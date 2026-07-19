# -*- coding: utf-8 -*-
"""Windows 任务计划注册：让程序每天（工作日）自动运行一次。
打包到其他电脑后，只需执行 main.py --install 即可在本机注册计划任务。"""
import os
import sys
import subprocess

TASK_NAME = "QiaoFeiProductIntel"


def _python_or_exe():
    """返回要执行的程序：打包后为 exe 本身，否则为 python + main.py。"""
    if getattr(sys, "frozen", False):
        return '"' + sys.executable + '"'
    py = sys.executable
    main = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py")
    return f'"{py}" "{main}"'


def _run(cmd):
    """安全执行 schtasks，规避 Windows 管道编码导致的线程告警。"""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        return (r.stdout or r.stderr or "").strip()
    except Exception as e:
        return f"(执行失败: {e})"


def install(bd, config=None):
    target = f"{_python_or_exe()} --run"
    sched = (config or {}).get("schedule", {})
    hour = str(sched.get("hour", 9)).zfill(2)
    minute = str(sched.get("minute", 0)).zfill(2)
    days = sched.get("days", "MON,TUE,WED,THU,FRI")
    cmd = [
        "schtasks", "/create", "/tn", TASK_NAME, "/f",
        "/tr", target,
        "/sc", "weekly", "/d", days, "/st", f"{hour}:{minute}",
    ]
    print(_run(cmd) or "(无输出)")
    return True


def remove():
    print(_run(["schtasks", "/delete", "/tn", TASK_NAME, "/f"]) or "(已移除或无此任务)")
    return True


def status():
    out = _run(["schtasks", "/query", "/tn", TASK_NAME])
    print(out or "（未注册任务计划）")
    return out


if __name__ == "__main__":
    bd = os.path.dirname(os.path.abspath(__file__))
    install(bd)
    status()
