import os
import random
from typing import List, Dict
from config import load_json, SETTINGS_FILE, get_current_dirs, get_sovits_host
from services.llm_service import LLMService
from services.emotion_service import EmotionService
from phone_call_utils.data_extractor import DataExtractor
from phone_call_utils.prompt_builder import PromptBuilder
from phone_call_utils.response_parser import ResponseParser, EmotionSegment
from phone_call_utils.tts_service import TTSService
from phone_call_utils.audio_merger import AudioMerger
from utils import scan_audio_files


class PhoneCallService:
    """主动电话生成服务"""
    
    def __init__(self):
        self.llm_service = LLMService()
        self.emotion_service = EmotionService()
        self.data_extractor = DataExtractor()
        self.prompt_builder = PromptBuilder()
        self.response_parser = ResponseParser()
        self.tts_service = TTSService(get_sovits_host())
        self.audio_merger = AudioMerger()
    
    async def generate(self, chat_branch: str, speakers: List[str], context: List[Dict], generate_audio: bool = True) -> Dict:
        """
        生成主动电话内容
        
        流程:
        1. 加载配置
        2. 提取上下文数据
        3. 获取所有说话人的可用情绪
        4. 构建提示词 (包含说话人列表)
        5. 调用LLM (LLM选择说话人)
        6. 解析响应 (验证说话人)
        7. (可选)生成音频
        8. (可选)合并音频
        9. 返回结果
        
        Args:
            chat_branch: 对话分支ID
            speakers: 说话人列表
            context: 对话上下文
            generate_audio: 是否生成音频(默认True)
            
        Returns:
            包含segments、selected_speaker和audio(可选)的字典
        """
        print(f"\n[PhoneCallService] 开始生成主动电话: chat_branch={chat_branch}, speakers={speakers}, 上下文={len(context)}条消息")
        
        # 1. 加载配置
        settings = load_json(SETTINGS_FILE)
        phone_call_config = settings.get("phone_call", {})
        
        llm_config = phone_call_config.get("llm", {})
        extractors = phone_call_config.get("data_extractors", [])
        prompt_template = phone_call_config.get("prompt_template", "")
        parser_config = phone_call_config.get("response_parser", {})
        tts_config = phone_call_config.get("tts_config", {})
        audio_merge_config = phone_call_config.get("audio_merge", {})
        
        # 2. 提取上下文数据
        extracted_data = self.data_extractor.extract(context, extractors)
        
        # 3. 获取所有说话人的可用情绪
        speakers_emotions = {}
        for speaker in speakers:
            emotions = self.emotion_service.get_available_emotions(speaker)
            speakers_emotions[speaker] = emotions
            print(f"[PhoneCallService] {speaker} 可用情绪: {emotions}")
        
        # 4. 构建提示词 (包含说话人和情绪信息)
        prompt = self.prompt_builder.build(
            template=prompt_template,
            char_name=speakers[0] if speakers else "Unknown",  # 保持兼容性
            context=context,
            extracted_data=extracted_data,
            emotions=speakers_emotions.get(speakers[0], []) if speakers else [],
            speakers=speakers,  # 新增: 传递说话人列表
            speakers_emotions=speakers_emotions  # 新增: 传递说话人情绪映射
        )
        
        # 5. 调用LLM
        print(f"[PhoneCallService] 调用LLM生成内容...")
        llm_response = await self.llm_service.call(llm_config, prompt)
        print(f"[PhoneCallService] LLM响应长度: {len(llm_response)} 字符")
        
        # 6. 解析响应 (提取说话人和情绪片段)
        import json
        
        # 解析JSON响应
        response_data = json.loads(llm_response)
        selected_speaker = response_data.get("speaker")
        
        # 验证说话人
        if not selected_speaker or selected_speaker not in speakers:
            raise ValueError(f"LLM返回的说话人 '{selected_speaker}' 无效,可用说话人: {speakers}")
        
        print(f"[PhoneCallService] LLM选择的说话人: {selected_speaker}")
        
        # 获取该说话人的可用情绪
        available_emotions = speakers_emotions.get(selected_speaker, [])
        
        # 解析情绪片段
        segments = self.response_parser.parse_emotion_segments(
            json.dumps(response_data),
            parser_config,
            available_emotions=available_emotions
        )
        
        print(f"[PhoneCallService] 解析到 {len(segments)} 个情绪片段, 说话人: {selected_speaker}")
        
        result = {
            "segments": [seg.dict() for seg in segments],
            "total_segments": len(segments),
            "selected_speaker": selected_speaker
        }
        
        # 7-8. 生成并合并音频(如果需要)
        if generate_audio and segments and selected_speaker:
            print(f"[PhoneCallService] 开始生成音频 (说话人: {selected_speaker})...")
            
            audio_bytes_list = []
            
            # 追踪上一个情绪和参考音频,用于情绪变化时的音色融合
            previous_emotion = None
            previous_ref_audio = None
            
            for i, segment in enumerate(segments):
                print(f"[PhoneCallService] 生成片段 {i+1}/{len(segments)}: [{segment.emotion}] {segment.text[:30]}...")
                
                # 选择参考音频 (使用选定的说话人)
                ref_audio = self._select_ref_audio(selected_speaker, segment.emotion)
                
                if not ref_audio:
                    print(f"[PhoneCallService] 警告: 未找到情绪 '{segment.emotion}' 的参考音频,跳过")
                    continue
                
                # 检测情绪变化
                emotion_changed = previous_emotion is not None and previous_emotion != segment.emotion
                if emotion_changed:
                    print(f"[PhoneCallService] 检测到情绪变化: {previous_emotion} -> {segment.emotion}")
                
                # 生成音频 - 如果情绪变化,传入上一个情绪的参考音频进行音色融合
                try:
                    audio_bytes = await self.tts_service.generate_audio(
                        segment=segment,
                        ref_audio=ref_audio,
                        tts_config=tts_config,
                        previous_ref_audio=previous_ref_audio if emotion_changed else None
                    )
                    audio_bytes_list.append(audio_bytes)
                    
                    # 更新上一个情绪和参考音频
                    previous_emotion = segment.emotion
                    previous_ref_audio = ref_audio
                    
                except Exception as e:
                    print(f"[PhoneCallService] 错误: 生成音频失败 - {e}")
                    continue

            
            # 合并音频
            if audio_bytes_list:
                print(f"[PhoneCallService] 合并 {len(audio_bytes_list)} 段音频...")
                try:
                    merged_audio = self.audio_merger.merge_segments(
                        audio_bytes_list,
                        audio_merge_config
                    )
                    result["audio"] = merged_audio
                    result["audio_format"] = audio_merge_config.get("output_format", "wav")
                    print(f"[PhoneCallService] 音频合并完成: {len(merged_audio)} 字节")
                except Exception as e:
                    print(f"[PhoneCallService] 错误: 合并音频失败 - {e}")
            else:
                print(f"[PhoneCallService] 警告: 没有成功生成任何音频片段")
        
        print(f"[PhoneCallService] 生成完成!\n")
        return result
    
    def _select_ref_audio(self, char_name: str, emotion: str) -> Dict:
        """
        根据情绪选择参考音频
        
        Args:
            char_name: 角色名称
            emotion: 情绪名称
            
        Returns:
            参考音频信息 {path, text} 或 None
        """
        # 获取角色模型文件夹
        mappings = load_json(os.path.join(os.path.dirname(SETTINGS_FILE), "character_mappings.json"))
        
        if char_name not in mappings:
            print(f"[PhoneCallService] 错误: 角色 {char_name} 未绑定模型")
            return None
        
        model_folder = mappings[char_name]
        base_dir, _ = get_current_dirs()
        ref_dir = os.path.join(base_dir, model_folder, "reference_audios")
        
        if not os.path.exists(ref_dir):
            print(f"[PhoneCallService] 错误: 参考音频目录不存在: {ref_dir}")
            return None
        
        # 扫描音频文件
        audio_files = scan_audio_files(ref_dir)
        
        # 筛选匹配情绪的音频
        matching_audios = [a for a in audio_files if a["emotion"] == emotion]
        
        if not matching_audios:
            print(f"[PhoneCallService] 警告: 未找到情绪 '{emotion}' 的参考音频")
            return None
        
        # 随机选择一个
        selected = random.choice(matching_audios)
        
        return {
            "path": selected["path"],
            "text": selected["text"]
        }
