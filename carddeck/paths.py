"""路径：源码运行放项目目录；PyInstaller 打包后数据放 exe 旁边（重启不丢），页面模板走包内资源。
存储位置可在页面自定义：CARDDECK_DATA 环境变量 > datapath.txt 指针文件 > 默认 data/。
所有路径每次调用现算，改位置无需重启服务。
"""
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


def _pointer_file() -> str:
    return os.path.join(base_dir(), "datapath.txt")


def custom_path() -> str:
    try:
        if os.path.exists(_pointer_file()):
            with open(_pointer_file(), "r", encoding="utf-8") as f:
                return (f.read() or "").strip()
    except OSError:
        pass
    return ""


def set_custom_path(p: str):
    p = (p or "").strip()
    if not p:
        try:
            if os.path.exists(_pointer_file()):
                os.remove(_pointer_file())
        except OSError:
            pass
        return
    with open(_pointer_file(), "w", encoding="utf-8") as f:
        f.write(p)


def data_dir() -> str:
    p = os.environ.get("CARDDECK_DATA", "").strip() or custom_path() or os.path.join(base_dir(), "data")
    os.makedirs(p, exist_ok=True)
    os.makedirs(os.path.join(p, "uploads"), exist_ok=True)
    os.makedirs(os.path.join(p, "crops"), exist_ok=True)
    return p


def upload_dir() -> str:
    return os.path.join(data_dir(), "uploads")


def crop_dir() -> str:
    return os.path.join(data_dir(), "crops")
