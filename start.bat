@echo off
cd /d "%~dp0"
title SillyTavern GPT-SoVITS Launcher

echo [INFO] 正在启动...
echo [INFO] 当前路径: %cd%

:: 1. 尝试检测 Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] 找不到 'python' 命令！
    echo 请确认你已经安装了 Python，并且在安装时勾选了 "Add Python to PATH"。
    echo 或者尝试重新安装 Python 3.10+。
    echo.
    pause
    exit
)

:: 2. 安装/更新依赖
echo [INFO] 检查依赖库...
pip install -r requirements.txt

:: 3. 启动服务
echo.
echo [INFO] 准备启动 Manager...
echo [INFO] 如果出现 Uvicorn running... 字样说明启动成功。
echo ---------------------------------------------------
python manager.py

:: 4. 如果运行结束（无论成功失败），都暂停
echo.
echo ---------------------------------------------------
echo [INFO] 程序已停止运行。
pause