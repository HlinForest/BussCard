@echo off
chcp 65001 >nul
cd /d %~dp0
echo ==============================================
echo  名片 CardDeck 一键启动（关闭此窗口即停止服务）
echo ==============================================
echo [1/3] 检查依赖...
python -m pip install -q -r requirements.txt
if errorlevel 1 (
  echo 依赖安装失败：请确认已安装 Python 3.10+ 并勾选 PATH
  pause
  exit /b 1
)
echo [2/3] 访问地址：
python -c "import socket;print('  电脑打开: http://127.0.0.1:5000');[print('  手机同WiFi打开: http://'+a+':5000') for a in socket.gethostbyname_ex(socket.gethostname())[2] if not a.startswith('127.')]"
echo       多个地址时选和手机同一网段的（一般 192.168.x.x 或 10.x.x.x）。
echo       手机打不开？先确认同 WiFi，再放行防火墙 5000 端口。
echo [3/3] 启动服务...
start "" http://127.0.0.1:5000
python app.py
pause
