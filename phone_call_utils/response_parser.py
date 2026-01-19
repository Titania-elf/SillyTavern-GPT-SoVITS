import re
from typing import List, Dict, Optional
from pydantic import BaseModel


class EmotionSegment(BaseModel):
    """情绪片段"""
    emotion: str
    text: str


class ResponseParser:
    """响应解析工具"""
    
    @staticmethod
    def parse_emotion_segments(
        response: str, 
        parser_config: Dict,
        available_emotions: Optional[List[str]] = None
    ) -> List[EmotionSegment]:
        """
        解析LLM响应,提取情绪片段
        
        Args:
            response: LLM响应文本
            parser_config: 解析器配置
                - pattern: 正则表达式模式
                - emotion_group: 情绪捕获组索引(默认1)
                - text_group: 文本捕获组索引(默认2)
                - fallback_emotion: 回退情绪(默认"neutral")
                - validate_emotion: 是否验证情绪(默认True)
                - clean_text: 是否清理文本(默认True)
            available_emotions: 可用情绪列表(用于验证)
            
        Returns:
            情绪片段列表
        """
        pattern = parser_config.get("pattern", r'\[情绪:([^\]]+)\]([^\[]+)')
        emotion_group = parser_config.get("emotion_group", 1)
        text_group = parser_config.get("text_group", 2)
        fallback_emotion = parser_config.get("fallback_emotion", "neutral")
        validate_emotion = parser_config.get("validate_emotion", True)
        clean_text = parser_config.get("clean_text", True)
        
        segments = []
        matches = re.findall(pattern, response, re.DOTALL)
        
        print(f"[ResponseParser] 找到 {len(matches)} 个匹配项")
        
        for i, match in enumerate(matches):
            if len(match) < max(emotion_group, text_group):
                print(f"[ResponseParser] 警告: 匹配项 {i} 捕获组不足,跳过")
                continue
            
            emotion = match[emotion_group - 1].strip()
            text = match[text_group - 1].strip()
            
            # 清理文本
            if clean_text:
                text = ResponseParser._clean_text(text)
            
            if not text:
                print(f"[ResponseParser] 警告: 匹配项 {i} 文本为空,跳过")
                continue
            
            # 验证情绪
            if validate_emotion and available_emotions:
                if emotion not in available_emotions:
                    print(f"[ResponseParser] 警告: 情绪 '{emotion}' 不在可用列表中,使用回退情绪 '{fallback_emotion}'")
                    emotion = fallback_emotion
            
            segments.append(EmotionSegment(
                emotion=emotion,
                text=text
            ))
            print(f"[ResponseParser] 片段 {i}: [{emotion}] {text[:50]}...")
        
        if not segments:
            print(f"[ResponseParser] 警告: 未解析到任何片段,使用回退策略")
            # 回退策略:将整个响应作为单个片段
            cleaned_response = ResponseParser._clean_text(response) if clean_text else response
            if cleaned_response:
                segments.append(EmotionSegment(
                    emotion=fallback_emotion,
                    text=cleaned_response
                ))
        
        return segments
    
    @staticmethod
    def _clean_text(text: str) -> str:
        """
        清理文本
        
        Args:
            text: 原始文本
            
        Returns:
            清理后的文本
        """
        # 去除多余空白
        text = re.sub(r'\s+', ' ', text)
        
        # 去除首尾空白
        text = text.strip()
        
        # 去除多余的标点符号
        text = re.sub(r'([。!?])\1+', r'\1', text)
        
        return text
