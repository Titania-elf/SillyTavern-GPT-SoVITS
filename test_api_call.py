"""
测试主动电话API的完整调用流程
需要先启动服务: python manager.py
"""
import requests
import json

# API地址
BASE_URL = "http://localhost:3000"

def test_get_emotions():
    """测试获取角色情绪列表"""
    print("\n" + "="*60)
    print("测试1: 获取角色情绪列表")
    print("="*60)
    
    # 使用一个已绑定的角色名称
    char_name = "小助手"  # 根据你的实际角色名称修改
    
    url = f"{BASE_URL}/phone_call/emotions/{char_name}"
    
    try:
        response = requests.get(url)
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 成功获取情绪列表:")
            print(json.dumps(data, ensure_ascii=False, indent=2))
            return data.get("emotions", [])
        else:
            print(f"❌ 请求失败: {response.text}")
            return []
    except Exception as e:
        print(f"❌ 错误: {e}")
        return []

def test_generate_phone_call(emotions):
    """测试生成主动电话内容"""
    print("\n" + "="*60)
    print("测试2: 生成主动电话内容 (调用LLM)")
    print("="*60)
    
    url = f"{BASE_URL}/phone_call/generate"
    
    # 构建测试请求
    payload = {
        "char_name": "小助手",
        "context": [
            {"role": "user", "content": "你好呀"},
            {"role": "assistant", "content": "你好!很高兴见到你。<总结>用户打招呼</总结>"},
            {"role": "user", "content": "最近怎么样?"},
            {"role": "assistant", "content": "我很好,谢谢关心!<总结>询问近况</总结>"},
            {"role": "user", "content": "有什么新鲜事吗?"},
            {"role": "assistant", "content": "最近在研究一些有趣的事情呢。<总结>分享近况</总结>"}
        ]
    }
    
    print(f"\n📤 发送请求:")
    print(f"URL: {url}")
    print(f"角色: {payload['char_name']}")
    print(f"上下文消息数: {len(payload['context'])}")
    
    try:
        response = requests.post(url, json=payload, timeout=60)
        print(f"\n📥 响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ 成功生成主动电话内容!")
            print("\n" + "-"*60)
            print("LLM原始响应:")
            print("-"*60)
            print(data.get("llm_response", ""))
            
            print("\n" + "-"*60)
            print("解析后的情绪片段:")
            print("-"*60)
            segments = data.get("segments", [])
            for i, seg in enumerate(segments, 1):
                print(f"{i}. [{seg['emotion']}] {seg['text']}")
            
            print("\n" + "-"*60)
            print("提取的数据:")
            print("-"*60)
            extracted = data.get("extracted_data", {})
            for key, values in extracted.items():
                print(f"{key}: {', '.join(values)}")
            
            print("\n" + "-"*60)
            print("可用情绪:")
            print("-"*60)
            print(", ".join(data.get("available_emotions", [])))
            
            return True
        else:
            print(f"\n❌ 请求失败:")
            try:
                error_data = response.json()
                print(json.dumps(error_data, ensure_ascii=False, indent=2))
            except:
                print(response.text)
            return False
            
    except requests.exceptions.Timeout:
        print(f"\n❌ 请求超时 (60秒)")
        print("提示: LLM调用可能需要较长时间,请检查API配置")
        return False
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        return False

def main():
    print("\n" + "="*60)
    print("主动电话API完整测试")
    print("="*60)
    print("\n⚠️  请确保:")
    print("1. 已启动服务: python manager.py")
    print("2. 已在system_settings.json中配置LLM API密钥")
    print("3. 角色已绑定模型并有参考音频")
    
    input("\n按Enter键开始测试...")
    
    # 测试1: 获取情绪
    emotions = test_get_emotions()
    
    if not emotions:
        print("\n⚠️  警告: 未获取到情绪列表,可能角色未绑定或无参考音频")
        print("继续测试LLM调用...")
    
    # 测试2: 生成电话内容
    success = test_generate_phone_call(emotions)
    
    print("\n" + "="*60)
    if success:
        print("✅ 测试完成! LLM流程正常工作")
    else:
        print("❌ 测试失败,请检查:")
        print("  1. 服务是否正常运行")
        print("  2. LLM API密钥是否正确")
        print("  3. API地址是否可访问")
    print("="*60)

if __name__ == "__main__":
    main()
