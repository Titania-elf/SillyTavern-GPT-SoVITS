import os
import hashlib
import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from typing import Optional

from config import get_current_dirs, SOVITS_HOST
from utils import maintain_cache_size

router = APIRouter()

@router.get("/proxy_set_gpt_weights")
def proxy_set_gpt_weights(weights_path: str):
    try:
        url = f"{SOVITS_HOST}/set_gpt_weights"
        resp = requests.get(url, params={"weights_path": weights_path}, timeout=10)
        return {"status": resp.status_code, "detail": resp.text}
    except Exception as e:
        print(f"Set GPT Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/proxy_set_sovits_weights")
def proxy_set_sovits_weights(weights_path: str):
    try:
        url = f"{SOVITS_HOST}/set_sovits_weights"
        resp = requests.get(url, params={"weights_path": weights_path}, timeout=10)
        return {"status": resp.status_code, "detail": resp.text}
    except Exception as e:
        print(f"Set SoVITS Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tts_proxy")
def tts_proxy(text: str, text_lang: str, ref_audio_path: str, prompt_text: str, prompt_lang: str, streaming_mode: Optional[str] = "false", check_only: Optional[str] = None):
    _, cache_dir = get_current_dirs()

    try:
        # 生成缓存Key
        raw_key = f"{text}_{ref_audio_path}_{prompt_text}_{text_lang}_{prompt_lang}"
        file_hash = hashlib.md5(raw_key.encode('utf-8')).hexdigest()
        cache_file_path = os.path.join(cache_dir, f"{file_hash}.wav")

        # 检查缓存是否存在
        if check_only == "true":
            return {"cached": os.path.exists(cache_file_path)}

        if os.path.exists(cache_file_path):
            return FileResponse(cache_file_path, media_type="audio/wav")

        maintain_cache_size(cache_dir)

        # 转发请求给 SoVITS (非流式)
        url = f"{SOVITS_HOST}/tts"
        params = {
            "text": text,
            "text_lang": text_lang,
            "ref_audio_path": ref_audio_path,
            "prompt_text": prompt_text,
            "prompt_lang": prompt_lang,
            "streaming_mode": "false" # 明确关闭流式
        }

        try:
            # 去掉 stream=True，增加超时时间，因为需要等待完整音频生成
            r = requests.get(url, params=params, timeout=120)
        except requests.exceptions.RequestException:
            raise HTTPException(status_code=503, detail="无法连接到 SoVITS 服务，请检查 9880 端口")

        if r.status_code != 200:
            raise HTTPException(status_code=500, detail=f"SoVITS Error: {r.status_code}")

        # 保存文件逻辑
        # 即使是非流式，也建议先写 .tmp 再 rename，防止写入中断导致缓存文件损坏
        temp_path = cache_file_path + ".tmp"

        try:
            with open(temp_path, "wb") as f:
                f.write(r.content)

            # 写入成功后重命名
            if os.path.exists(cache_file_path):
                os.remove(cache_file_path)
            os.rename(temp_path, cache_file_path)

        except Exception as e:
            print(f"文件保存错误: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise HTTPException(status_code=500, detail="Failed to save audio file")

        # 直接返回文件
        return FileResponse(cache_file_path, media_type="audio/wav")

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"General TTS Error: {e}")
        raise HTTPException(status_code=500, detail="TTS Server Internal Error")
