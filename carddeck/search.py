"""混合检索：精确命中优先 → 模糊(RapidFuzz) + 语义(字符bigram TF-IDF余弦) → 标签/地区筛选。附命中依据。"""
import math
import re
from collections import Counter

from rapidfuzz import fuzz

TOKEN_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]+")


def _tokens(text: str):
    toks = []
    for frag in TOKEN_RE.findall(text or ""):
        frag = frag.lower()
        toks.append(frag)
        # 中文按字+bigram展开，英文按原词；短姓名/简称可召回
        if re.search(r"[\u4e00-\u9fff]", frag):
            chars = list(frag)
            toks.extend(chars)
            toks.extend([chars[i] + chars[i + 1] for i in range(len(chars) - 1)])
    return toks


def _tfidf_scores(query: str, docs: list[str]) -> list[float]:
    q_tokens = _tokens(query)
    if not q_tokens:
        return [0.0] * len(docs)
    doc_counters = [Counter(_tokens(d)) for d in docs]
    df = Counter()
    for c in doc_counters:
        for t in c:
            df[t] += 1
    N = max(len(docs), 1)
    idf = {t: math.log((N + 1) / (n + 1)) + 1 for t, n in df.items()}
    q_vec = Counter(q_tokens)
    q_norm = math.sqrt(sum((q_vec[t] * idf.get(t, 1)) ** 2 for t in q_vec))
    scores = []
    for c in doc_counters:
        dot = sum(q_vec[t] * idf.get(t, 1) * c.get(t, 0) * idf.get(t, 1) for t in q_vec)
        d_norm = math.sqrt(sum((v * idf.get(t, 1)) ** 2 for t, v in c.items()))
        scores.append(dot / (q_norm * d_norm) if q_norm and d_norm else 0.0)
    return scores


def hybrid_search(conn, query: str, tag_filter="", limit=50):
    query = (query or "").strip()
    rows = conn.execute("SELECT * FROM contacts ORDER BY updated_at DESC LIMIT 2000").fetchall()
    from .db import row_to_dict
    contacts = [row_to_dict(r) for r in rows]
    if tag_filter:
        contacts = [c for c in contacts
                    if tag_filter in (c.get("tags_printed") or []) or tag_filter in (c.get("tags_inferred") or [])]
    if not query:
        return [{"contact": c, "score": 0.0, "reasons": ["全部"]} for c in contacts[:limit]]

    q = query
    q_low = q.lower()
    docs = [c.get("search_text", "") for c in contacts]
    sem = _tfidf_scores(q, docs)
    scored = []
    for c, s in zip(contacts, sem):
        reasons = []
        score = 0.0
        # 1) 精确/部分匹配优先：电话后四位、邮箱、公司片段直接命中
        blob = f"{c.get('name','')} {c.get('company','')} {c.get('phone1','')} {c.get('phone2','')} {c.get('email','')}".lower()
        if q_low in blob and q:
            score += 100
            reasons.append("精确命中")
        if q.isdigit() and len(q) >= 4 and (c.get("phone1", "").replace(" ", "").endswith(q) or c.get("phone2", "").replace(" ", "").endswith(q)):
            score += 50
            reasons.append("电话尾号命中")
        # 2) 模糊：姓名/公司相似度、简称
        fn = fuzz.ratio(q, c.get("name", "") or "")
        fc = fuzz.partial_ratio(q, c.get("company", "") or "")
        if fn >= 70:
            score += fn * 0.4
            reasons.append(f"姓名相似{fn:.0f}")
        if fc >= 70:
            score += fc * 0.3
            reasons.append(f"公司相似{fc:.0f}")
        # 3) 语义：TF-IDF over 职位/业务/备注/标签
        if s > 0.05:
            score += s * 60
            reasons.append(f"语义相关{s:.2f}")
            for field, label in (("title", "职位"), ("business", "业务"), ("notes", "备注"), ("event", "展会")):
                val = c.get(field, "") or ""
                if val and any(t in val.lower() for t in _tokens(q) if len(t) >= 2):
                    reasons.append(f"{label}：{val[:24]}")
                    break
        if score > 0:
            scored.append({"contact": c, "score": round(score, 2), "reasons": reasons})
    scored.sort(key=lambda x: -x["score"])
    return scored[:limit]
