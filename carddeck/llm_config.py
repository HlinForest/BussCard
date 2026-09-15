"""LLM 页面配置：存 data/llm_config.json，优先级：页面配置 > 环境变量 > .env。"""
import json
import os

from .paths import data_dir

CONFIG_PATH = os.path.join(data_dir(), "llm_config.json")


def get_llm_config():
    cfg = {}
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f) or {}
    except Exception:
        cfg = {}
    return {
        "api_url": (cfg.get("api_url") or os.environ.get("LLM_API_URL", "") or "").strip(),
        "api_key": (cfg.get("api_key") or os.environ.get("LLM_API_KEY", "") or "").strip(),
        "model": (cfg.get("model") or os.environ.get("LLM_MODEL", "") or "gpt-4o-mini").strip(),
    }


def save_llm_config(api_url: str, api_key: str, model: str):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"api_url": api_url.strip(), "api_key": api_key.strip(),
                   "model": (model or "gpt-4o-mini").strip()}, f, ensure_ascii=False)


def public_llm_config():
    c = get_llm_config()
    key = c["api_key"]
    masked = ("•••" + key[-4:]) if len(key) > 8 else ("已填" if key else "")
    return {"api_url": c["api_url"], "model": c["model"],
            "configured": bool(c["api_url"] and key), "api_key_masked": masked}
