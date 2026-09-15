@echo off
chcp 65001 >nul
cd /d %~dp0
echo 打包单文件版 CardDeck.exe（需本机有 Python，约几分钟）...
if not exist .build-venv\Scripts\python.exe (
  python -m venv .build-venv
)
.build-venv\Scripts\python.exe -m pip install -q -r requirements.txt pyinstaller
.build-venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --name CardDeck --add-data "templates;templates" --add-data "static;static" app.py
echo.
echo 完成：dist\CardDeck.exe（约70MB），拷到别的电脑双击即用，无需装 Python。
echo 数据存在 exe 旁边的 data 文件夹，LLM Key 进页面 LLM设置 里填。
pause
