"""视觉 LLM 适配器：OpenAI 兼容 /chat/completions，图片 base64 输入，结构化 JSON 输出。"""
import base64
import json
import os
import re

import requests

from .llm_config import get_llm_config

FIELDS = ["name", "company", "title", "phone1", "phone2", "email", "address",
          "business", "event", "met_at", "notes", "tags_printed", "tags_inferred"]

PROMPT = """你是名片信息提取器。看这张已裁切校正的单张名片图，只提取图上明确可见的信息。
规则：
1. 看不清或没有的信息留空字符串（标签留空数组），不要编造、不要补全号码。
2. 电话保留原始写法（含 +86、空格、连字符）；邮箱原样抄录。
3. tags_printed 只收录名片上明确印出的行业/业务词；模型推断的一律放 tags_inferred，不要混入事实字段。
4. business/event/met_at/notes 若图上没有就留空，等人工在表格里补充背景信息。
只返回 JSON，不要 markdown：
{"name":"","company":"","title":"","phone1":"","phone2":"","email":"","address":"","business":"","event":"","met_at":"","notes":"","tags_printed":[],"tags_inferred":[]}"""

MULTI_PROMPT = """这张照片里有多张名片（2～10 张）。请逐张提取每张名片上明确可见的信息，不要把 A 的电话填给 B。
规则：
1. 看不清或没有的信息留空字符串（标签留空数组），不要编造、不要补全号码。
2. 电话保留原始写法（含 +86、空格、连字符）；邮箱原样抄录。
3. tags_printed 只收录名片上明确印出的行业/业务词；模型推断的一律放 tags_inferred。
4. 按从左到右、从上到下的顺序排列。
只返回 JSON，不要 markdown：
{"cards": [{"name":"","company":"","title":"","phone1":"","phone2":"","email":"","address":"","business":"","event":"","met_at":"","notes":"","tags_printed":[],"tags_inferred":[]}]}"""


def _sanitize_fields(data: dict) -> dict:
    out = _empty_result()
    if not isinstance(data, dict):
        return out
    for k in FIELDS:
        if k in data:
            out[k] = data[k] if data[k] is not None else ([] if k.startswith("tags") else "")
    for k in ("tags_printed", "tags_inferred"):
        if isinstance(out[k], str):
            out[k] = [out[k]] if out[k] else []
        elif not isinstance(out[k], list):
            out[k] = []
    return out


def _chat(api_url, api_key, model, text, image_path, timeout):
    data_url = _img_to_data_url(image_path)
    r = requests.post(api_url, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                      json={"model": model, "temperature": 0, "response_format": {"type": "json_object"},
                            "messages": [{"role": "user", "content": [
                                {"type": "text", "text": text},
                                {"type": "image_url", "image_url": {"url": data_url}}]}]},
                      timeout=timeout)
    try:
        r.raise_for_status()
    except Exception as e:
        raise RuntimeError(_http_error_detail(e))
    content = r.json()["choices"][0]["message"]["content"]
    content = re.sub(r"^```(?:json)?|```$", "", content.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(content)
    except Exception:
        m = re.search(r"\{.*\}", content, re.DOTALL)
        return json.loads(m.group(0)) if m else {}


def recognize_photo_multi(photo_path: str, timeout=120, api_url="", api_key="", model="") -> list:
    """免框选：整图直接识别多张名片，返回 [fields...]。未配置 Key 时返回 []。"""
    if not api_url or not api_key:
        cfg = get_llm_config()
        api_url = api_url or cfg["api_url"]
        api_key = api_key or cfg["api_key"]
        model = model or cfg["model"]
    api_url = _normalize_chat_url(api_url)
    if not api_url or not api_key:
        return []
    data = _chat(api_url, api_key, model, MULTI_PROMPT, photo_path, timeout)
    cards = data.get("cards", []) if isinstance(data, dict) else []
    if isinstance(data, list):
        cards = data
    return [_sanitize_fields(c) for c in cards[:10]] if isinstance(cards, list) else []


def _img_to_data_url(path: str) -> str:
    from PIL import Image
    import io
    im = Image.open(path).convert("RGB")
    im.thumbnail((1400, 1400))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=88)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return "data:image/jpeg;base64," + b64


def _empty_result(mock=False):
    d = {k: ([] if k.startswith("tags") else "") for k in FIELDS}
    if mock:
        d["_mock"] = True
    return d


def recognize_crop(crop_path: str, timeout=90, api_url="", api_key="", model="") -> dict:
    """逐张调用视觉模型。未配置 API Key 时返回空模板（标记 _mock），保证离线可走通全流程。"""
    if not api_url or not api_key:
        cfg = get_llm_config()
        api_url = api_url or cfg["api_url"]
        api_key = api_key or cfg["api_key"]
        model = model or cfg["model"]
    api_url = _normalize_chat_url(api_url)
    if not api_url or not api_key:
        return _empty_result(mock=True)
    # 注意：DeepSeek 官方只有 deepseek-v4-flash-vision-exp 支持图片；
    # deepseek-chat/reasoner、v4-flash/v4-pro 仍是纯文本，直接调会 400。
    # 这里不硬拦：统一真实调用，失败信息原样返回，方便按网关实际能力判断。
    data_url = _img_to_data_url(crop_path)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": data_url}},
        ]}],
    }
    r = requests.post(api_url, headers=headers, json=payload, timeout=timeout)
    try:
        r.raise_for_status()
    except Exception as e:
        raise RuntimeError(_http_error_detail(e))
    content = r.json()["choices"][0]["message"]["content"]
    content = re.sub(r"^```(?:json)?|```$", "", content.strip(), flags=re.MULTILINE).strip()
    try:
        data = json.loads(content)
    except Exception:
        m = re.search(r"\{.*\}", content, re.DOTALL)
        data = json.loads(m.group(0)) if m else {}
    out = _empty_result()
    for k in FIELDS:
        if k in data:
            out[k] = data[k] if data[k] is not None else ([] if k.startswith("tags") else "")
    for k in ("tags_printed", "tags_inferred"):
        if isinstance(out[k], str):
            out[k] = [out[k]] if out[k] else []
    return out


def _normalize_chat_url(api_url: str) -> str:
    u = (api_url or "").strip().rstrip("/")
    if u.endswith("/chat/completions"):
        return u
    if u.endswith("/completions"):
        return u
    # 只填了域名/base（如 https://api.deepseek.com 或 .../v1）时自动补全
    if u.endswith("/v1"):
        # DeepSeek 的 base 就是 https://api.deepseek.com（/v1 仅兼容用），补 /chat/completions
        return u.replace("/v1", "") + "/chat/completions" if "deepseek" in u else u + "/chat/completions"
    return u + "/chat/completions"


def _models_url(api_url: str) -> str:
    u = (api_url or "").strip().rstrip("/")
    if "/chat/completions" in u:
        return u.replace("/chat/completions", "/models")
    if u.endswith("/completions"):
        return u[: -len("/completions")] + "/models"
    return u + "/models"


def _http_error_detail(e: Exception) -> str:
    resp = getattr(e, "response", None)
    if resp is not None:
        try:
            body = resp.text or ""
        except Exception:
            body = ""
        code = getattr(resp, "status_code", "?")
        hint = ""
        if code == 401:
            hint = "（Key 未通过：检查是否复制完整、有无多余空格、是否过期、是否有该模型调用权限）"
        elif code == 403:
            hint = "（无权限：Key 可能无此模型/地域权限）"
        elif code == 404:
            hint = "（地址可能不对：检查 URL 中的 compatible-mode/v1 路径）"
        return f"HTTP {code} {body[:300]}{hint}"
    return str(e)[:300]


def list_models(api_url: str, api_key: str, timeout=30) -> dict:
    """OpenAI 兼容 GET /models。返回 {"models": [id...]}。"""
    import requests as _rq
    url = _models_url(_normalize_chat_url(api_url))
    try:
        r = _rq.get(url, headers={"Authorization": f"Bearer {api_key}"}, timeout=timeout)
        r.raise_for_status()
    except Exception as e:
        raise RuntimeError(_http_error_detail(e))
    data = r.json()
    items = data.get("data", []) if isinstance(data, dict) else []
    ids = sorted({str(x.get("id")) for x in items if isinstance(x, dict) and x.get("id")})
    return {"models": ids, "url": url}


def test_connection(api_url: str, api_key: str, model: str, timeout=30) -> dict:
    """只发一句纯文本测试连通性，不传图片，省 token。"""
    import requests as _rq
    api_url = _normalize_chat_url(api_url)
    try:
        r = _rq.post(api_url, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                     json={"model": model, "temperature": 0, "max_tokens": 16,
                           "messages": [{"role": "user", "content": "只回复 ok"}]},
                     timeout=timeout)
        r.raise_for_status()
    except Exception as e:
        raise RuntimeError(_http_error_detail(e))
    try:
        txt = r.json()["choices"][0]["message"]["content"]
    except Exception:
        txt = r.text[:200]
    return {"ok": True, "reply": (txt or "")[:200]}
