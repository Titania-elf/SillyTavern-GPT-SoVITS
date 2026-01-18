import os
import re
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
from config import load_json, SETTINGS_FILE, MAPPINGS_FILE, get_current_dirs
from utils import scan_audio_files

router = APIRouter()

# ============ 数据模型 ============

class DataExtractor(BaseModel):
    """数据提取器配置"""
    name: str
    pattern: str
    scope: str  # "character_only" | "all" | "user_only"
    description: Optional[str] = ""

class PhoneCallRequest(BaseModel):
    """主动电话生成请求"""
    char_name: str
    context: List[Dict[str, str]]  # [{"role": "user/assistant", "content": "..."}]
    
class EmotionSegment(BaseModel):
    """情绪片段"""
    emotion: str
    text: str

# ============ 工具函数 ============

def extract_data_from_context(context: List[Dict], extractors: List[Dict]) -> Dict[str, List[str]]:
    """
    使用配置的提取器从上下文中提取数据
    
    Args:
        context: 对话上下文列表
        extractors: 提取器配置列表
    
    Returns:
        提取结果字典 {extractor_name: [matched_values]}
    """
    results = {}
    
    for extractor in extractors:
        name = extractor["name"]
        pattern = extractor["pattern"]
        scope = extractor["scope"]
        
        results[name] = []
        
        # 根据scope过滤消息
        filtered_messages = []
        if scope == "character_only":
            filtered_messages = [msg for msg in context if msg["role"] == "assistant"]
        elif scope == "user_only":
            filtered_messages = [msg for msg in context if msg["role"] == "user"]
        else:  # "all"
            filtered_messages = context
        
        # 提取数据
        for msg in filtered_messages:
            content = msg["content"]
            matches = re.findall(pattern, content)
            results[name].extend(matches)
    
    return results

def get_character_emotions(char_name: str) -> List[str]:
    """
    扫描角色模型目录,获取所有可用情绪
    
    Args:
        char_name: 角色名称
    
    Returns:
        情绪列表
    """
    mappings = load_json(MAPPINGS_FILE)
    
    if char_name not in mappings:
        raise HTTPException(status_code=404, detail=f"角色 {char_name} 未绑定模型")
    
    model_folder = mappings[char_name]
    base_dir, _ = get_current_dirs()
    ref_dir = os.path.join(base_dir, model_folder, "reference_audios")
    
    emotions = set()
    
    # 扫描所有音频文件
    for root, dirs, files in os.walk(ref_dir):
        for file in files:
            if file.endswith(('.wav', '.mp3', '.flac')):
                # 提取情绪前缀 (格式: emotion_text.wav)
                match = re.match(r'^([^_]+)_', file)
                if match:
                    emotions.add(match.group(1))
    
    return sorted(list(emotions))

async def call_llm(config: Dict, prompt: str) -> str:
    """
    调用LLM API
    
    Args:
        config: LLM配置
        prompt: 提示词
    
    Returns:
        LLM响应文本
    """
    api_url = config["api_url"]
    api_key = config["api_key"]
    model = config["model"]
    temperature = config.get("temperature", 0.8)
    max_tokens = config.get("max_tokens", 500)
    
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置LLM API密钥")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                api_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": temperature,
                    "max_tokens": max_tokens
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"LLM调用失败: {str(e)}")

def parse_llm_response(response: str, parser_config: Dict) -> List[EmotionSegment]:
    """
    解析LLM响应,提取情绪片段
    
    Args:
        response: LLM响应文本
        parser_config: 解析器配置
    
    Returns:
        情绪片段列表
    """
    pattern = parser_config["pattern"]
    emotion_group = parser_config["emotion_group"]
    text_group = parser_config["text_group"]
    fallback_emotion = parser_config.get("fallback_emotion", "neutral")
    
    segments = []
    matches = re.findall(pattern, response)
    
    for match in matches:
        if isinstance(match, tuple):
            emotion = match[emotion_group - 1].strip()
            text = match[text_group - 1].strip()
        else:
            emotion = fallback_emotion
            text = match.strip()
        
        if text:  # 只添加非空文本
            segments.append(EmotionSegment(emotion=emotion, text=text))
    
    # 如果没有匹配到任何片段,使用降级方案
    if not segments and response.strip():
        segments.append(EmotionSegment(emotion=fallback_emotion, text=response.strip()))
    
    return segments

def build_prompt(template: str, char_name: str, context: List[Dict], 
                 extracted_data: Dict, emotions: List[str]) -> str:
    """
    构建LLM提示词
    
    Args:
        template: 提示词模板
        char_name: 角色名称
        context: 对话上下文
        extracted_data: 提取的数据
        emotions: 可用情绪列表
    
    Returns:
        完整提示词
    """
    # 格式化上下文
    context_text = "\n".join([
        f"{'用户' if msg['role'] == 'user' else char_name}: {msg['content']}"
        for msg in context
    ])
    
    # 格式化提取的数据
    extracted_text = "\n".join([
        f"{name}: {', '.join(values)}"
        for name, values in extracted_data.items()
        if values
    ])
    
    # 格式化情绪列表
    emotions_text = "、".join(emotions)
    
    # 替换模板变量
    prompt = template.replace("{char_name}", char_name)
    prompt = prompt.replace("{context}", context_text)
    prompt = prompt.replace("{extracted_data}", extracted_text)
    prompt = prompt.replace("{emotions}", emotions_text)
    
    return prompt

# ============ API端点 ============

@router.post("/phone_call/generate")
async def generate_phone_call(req: PhoneCallRequest):
    """
    生成主动电话内容
    
    流程:
    1. 加载配置
    2. 提取上下文数据
    3. 获取可用情绪
    4. 构建提示词
    5. 调用LLM
    6. 解析响应
    7. 返回情绪片段列表
    """
    settings = load_json(SETTINGS_FILE)
    phone_config = settings.get("phone_call", {})
    
    if not phone_config.get("enabled", False):
        raise HTTPException(status_code=400, detail="主动电话功能未启用")
    
    # 1. 提取数据
    extractors = phone_config.get("data_extractors", [])
    extracted_data = extract_data_from_context(req.context, extractors)
    
    # 2. 获取可用情绪
    emotions = get_character_emotions(req.char_name)
    
    if not emotions:
        raise HTTPException(status_code=404, detail=f"角色 {req.char_name} 没有可用的参考音频")
    
    # 3. 构建提示词
    template = phone_config.get("prompt_template", "")
    prompt = build_prompt(template, req.char_name, req.context, extracted_data, emotions)
    
    # 4. 调用LLM
    llm_config = phone_config.get("llm", {})
    llm_response = await call_llm(llm_config, prompt)
    
    # 5. 解析响应
    parser_config = phone_config.get("response_parser", {})
    segments = parse_llm_response(llm_response, parser_config)
    
    return {
        "status": "success",
        "char_name": req.char_name,
        "llm_response": llm_response,
        "segments": [seg.dict() for seg in segments],
        "extracted_data": extracted_data,
        "available_emotions": emotions
    }

@router.get("/phone_call/emotions/{char_name}")
def get_emotions(char_name: str):
    """获取角色可用情绪列表"""
    try:
        emotions = get_character_emotions(char_name)
        return {
            "status": "success",
            "char_name": char_name,
            "emotions": emotions
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
