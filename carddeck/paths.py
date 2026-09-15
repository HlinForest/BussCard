"""路径：源码运行放项目目录；PyInstaller 打包后数据放 exe 旁边（重启不丢），页面模板走包内资源。"""
import os
import sys


def base_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def res_path(rel: str) -> str:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, rel)
    return os.path.join(base_dir(), rel)


def data_dir() -> str:
    p = os.environ.get("CARDDECK_DATA", "").strip() or os.path.join(base_dir(), "data")
    os.makedirs(p, exist_ok=True)
    os.makedirs(os.path.join(p, "uploads"), exist_ok=True)
    os.makedirs(os.path.join(p, "crops"), exist_ok=True)
    return p
