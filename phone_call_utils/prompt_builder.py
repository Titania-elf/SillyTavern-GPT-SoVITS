from typing import List, Dict
from datetime import datetime


class PromptBuilder:
    """提示词构建工具"""
    
    @staticmethod
    def build(
        template: str, 
        char_name: str, 
        context: List[Dict], 
        extracted_data: Dict, 
        emotions: List[str],
        max_context_messages: int = 10
    ) -> str:
        """
        构建LLM提示词
        
        Args:
            template: 提示词模板
            char_name: 角色名称
            context: 对话上下文
            extracted_data: 提取的数据
            emotions: 可用情绪列表
            max_context_messages: 最大上下文消息数(默认10)
            
        Returns:
            完整提示词
        """
        # 限制上下文长度
        limited_context = context[-max_context_messages:] if len(context) > max_context_messages else context
        
        # 格式化各部分数据
        formatted_context = PromptBuilder._format_context(limited_context)
        formatted_data = PromptBuilder._format_extracted_data(extracted_data)
        formatted_emotions = ", ".join(emotions)
        
        # 内置变量
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M")
        message_count = len(context)
        recent_message_count = len(limited_context)
        
        # 替换模板变量
        prompt = template
        prompt = prompt.replace("{{char_name}}", char_name)
        prompt = prompt.replace("{{context}}", formatted_context)
        prompt = prompt.replace("{{extracted_data}}", formatted_data)
        prompt = prompt.replace("{{emotions}}", formatted_emotions)
        prompt = prompt.replace("{{current_time}}", current_time)
        prompt = prompt.replace("{{message_count}}", str(message_count))
        prompt = prompt.replace("{{recent_message_count}}", str(recent_message_count))
        
        print(f"[PromptBuilder] 构建提示词: {len(prompt)} 字符, {message_count} 条消息, {len(emotions)} 个情绪")
        
        return prompt
    
    @staticmethod
    def _format_context(context: List[Dict]) -> str:
        """
        格式化上下文为文本
        
        Args:
            context: 对话上下文
            
        Returns:
            格式化的文本
        """
        if not context:
            return "暂无对话历史"
        
        lines = []
        for i, msg in enumerate(context, 1):
            role = "用户" if msg["role"] == "user" else "角色"
            content = msg["content"]
            lines.append(f"{i}. {role}: {content}")
        
        return "\n".join(lines)
    
    @staticmethod
    def _format_extracted_data(data: Dict) -> str:
        """
        格式化提取的数据
        
        Args:
            data: 提取的数据字典
            
        Returns:
            格式化的文本
        """
        if not data:
            return "无"
        
        lines = []
        for key, values in data.items():
            if values:
                # 去重并限制数量
                unique_values = list(dict.fromkeys(values))[:5]
                lines.append(f"- {key}: {', '.join(unique_values)}")
        
        return "\n".join(lines) if lines else "无"
