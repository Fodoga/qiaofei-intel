@echo off
chcp 65001 >nul
echo ============================================
echo   俏妃甄选每日爆品情报站 - 一键安装
echo ============================================
echo.
echo [1/2] 安装依赖（requests 等）...
pip install -r requirements.txt
if errorlevel 1 (
  echo 依赖安装失败，请确认已安装 Python 并加入 PATH。
  pause
  exit /b 1
)
echo.
echo [2/2] 注册 Windows 每日任务计划（工作日 09:00 自动采集）...
python main.py --install
echo.
echo 完成！此后每天 09:00 将自动：联网采集 -^> 更新网页 -^> 推送企业微信（若已配置）。
echo 网页位置：web\index.html （双击即可在浏览器查看，历史按日期归档）
echo 把整个文件夹压缩发给同事，对方解压后跑一次 install.bat 即可复用到他的电脑。
echo.
pause
