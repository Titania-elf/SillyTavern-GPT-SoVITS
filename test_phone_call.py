import asyncio
import json
from routers.phone_call import (
    extract_data_from_context,
    get_character_emotions,
    parse_llm_response,
    build_prompt
)

async def test_llm_flow():
    """测试完整LLM流程"""
    
    print("=" * 60)
    print("主动电话LLM流程测试")
    print("=" * 60)
    
    # 模拟上下文
    context = [
        {"role": "user", "content": "你好"},
        {"role": "assistant", "content": "你好!<总结>用户打招呼</总结>"},
        {"role": "user", "content": "最近怎么样?"},
        {"role": "assistant", "content": "我很好,谢谢!<总结>询问近况</总结>"}
    ]
    
    print("\n1. 测试数据提取器")
    print("-" * 60)
    
    extractors = [
        {
            "name": "summary",
            "pattern": "<总结>([\\s\\S]*?)</总结>",
            "scope": "character_only"
        }
    ]
    
    extracted = extract_data_from_context(context, extractors)
    print(f"提取的数据: {json.dumps(extracted, ensure_ascii=False, indent=2)}")
    
    print("\n2. 测试情绪扫描")
    print("-" * 60)
    
    # 测试情绪获取
    try:
        test_char = "八重神子_ZH"  # 使用实际存在的角色
        emotions = get_character_emotions(test_char)
        print(f"角色 '{test_char}' 可用情绪: {emotions}")
    except Exception as e:
        print(f"情绪获取失败: {e}")
        print("使用模拟情绪列表")
        emotions = ["neutral", "happy", "sad", "angry", "surprised"]
    
    print("\n3. 测试提示词构建")
    print("-" * 60)
    
    template = """你是{char_name},正在主动给用户打电话。

对话历史:
{context}

提取的数据:
{extracted_data}

可用情绪: {emotions}

请生成3-5句电话内容,每句话用[情绪:xxx]标记。"""
    
    prompt = build_prompt(template, "测试角色", context, extracted, emotions)
    print(f"生成的提示词:\n{prompt}")
    
    print("\n4. 测试响应解析")
    print("-" * 60)
    
    # 测试响应解析
    mock_response = """[情绪:happy]你好呀,最近怎么样?
[情绪:关心]听说你遇到了一些麻烦?
[情绪:温柔]别担心,我会一直陪着你的。"""
    
    parser_config = {
        "pattern": "\\[情绪:([^\\]]+)\\]([^\\[]+)",
        "emotion_group": 1,
        "text_group": 2,
        "fallback_emotion": "neutral"
    }
    
    segments = parse_llm_response(mock_response, parser_config)
    print(f"模拟LLM响应:\n{mock_response}\n")
    print("解析的片段:")
    for i, seg in enumerate(segments, 1):
        print(f"  {i}. [{seg.emotion}] {seg.text}")
    
    print("\n" + "=" * 60)
    print("测试完成!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_llm_flow())
