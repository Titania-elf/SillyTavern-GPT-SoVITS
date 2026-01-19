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
    
    async def generate(self, char_name: str, context: List[Dict], generate_audio: bool = True) -> Dict:
        """
        生成主动电话内容
        
        流程:
        1. 加载配置
        2. 提取上下文数据
        3. 获取可用情绪
        4. 构建提示词
        5. 调用LLM
        6. 解析响应
        7. (可选)生成音频
        8. (可选)合并音频
        9. 返回结果
        
        Args:
            char_name: 角色名称
            context: 对话上下文
            generate_audio: 是否生成音频(默认True)
            
        Returns:
            包含segments和audio(可选)的字典
        """
        print(f"\n[PhoneCallService] 开始生成主动电话: 角色={char_name}, 上下文={len(context)}条消息")
        
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
        
        # 3. 获取可用情绪
        emotions = self.emotion_service.get_available_emotions(char_name)
        
        # 4. 构建提示词
        prompt = self.prompt_builder.build(
            template=prompt_template,
            char_name=char_name,
            context=context,
            extracted_data=extracted_data,
            emotions=emotions
        )
        
        # 5. 调用LLM
        print(f"[PhoneCallService] 调用LLM生成内容...")
        llm_response = await self.llm_service.call(llm_config, prompt)
        print(f"[PhoneCallService] LLM响应长度: {len(llm_response)} 字符")
        
        # 6. 解析响应
        segments = self.response_parser.parse_emotion_segments(
            llm_response, 
            parser_config,
            available_emotions=emotions
        )
        print(f"[PhoneCallService] 解析到 {len(segments)} 个情绪片段")
        
        result = {
            "segments": [seg.dict() for seg in segments],
            "total_segments": len(segments)
        }
        
        # 7-8. 生成并合并音频(如果需要)
        if generate_audio and segments:
            print(f"[PhoneCallService] 开始生成音频...")
            
            audio_bytes_list = []
            for i, segment in enumerate(segments):
                print(f"[PhoneCallService] 生成片段 {i+1}/{len(segments)}: [{segment.emotion}] {segment.text[:30]}...")
                
                # 选择参考音频
                ref_audio = self._select_ref_audio(char_name, segment.emotion)
                
                if not ref_audio:
                    print(f"[PhoneCallService] 警告: 未找到情绪 '{segment.emotion}' 的参考音频,跳过")
                    continue
                
                # 生成音频
                try:
                    audio_bytes = await self.tts_service.generate_audio(
                        segment=segment,
                        ref_audio=ref_audio,
                        tts_config=tts_config
                    )
                    audio_bytes_list.append(audio_bytes)
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
