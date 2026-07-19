@echo off
chcp 65001 >nul
echo 正在打包为独立 exe（无需目标电脑安装 Python）...
pip install pyinstaller
pyinstaller --onefile --noconsole --name QiaoFeiIntel main.py
echo.
echo 打包完成！exe 位于 dist\QiaoFeiIntel.exe
echo 将 dist\QiaoFeiIntel.exe 与 config.json、web\ 文件夹放在一起即可运行。
echo 在目标电脑上用 QiaoFeiIntel.exe --install 注册任务计划。
echo.
pause
