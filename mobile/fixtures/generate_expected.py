"""用桌面版实现生成移动端对照期望：搜索/查重/校验。
输出 fixtures/expected/*.json；另生成 fixtures/desktop-backup.zip（桌面备份格式：carddeck.db+uploads+llm_config）。"""
import io
import json
import os
import sqlite3
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.dirname(HERE)
ROOT = os.path.dirname(MOBILE)
sys.path.insert(0, ROOT)
os.chdir(ROOT)

from carddeck import db as ddb
from carddeck.search import hybrid_search
from carddeck.validate import validate_fields

samples = json.load(open(os.path.join(HERE, "samples.json"), encoding="utf-8"))

conn = sqlite3.connect(":memory:")
conn.row_factory = sqlite3.Row
conn.executescript(ddb.SCHEMA)
ids = []
for i, s in enumerate(samples):
    d = dict(s)
    cid = ddb.insert_contact(conn, d)
    # 确定性时间戳：created 升序，updated 降序（与移动端 fixtures 一致）
    conn.execute("UPDATE contacts SET created_at=?, updated_at=? WHERE id=?", (1000 + i, 2000 - i, cid))
    ids.append(cid)
conn.commit()

QUERIES = ["38000", "张威", "工业机器人销售的人", "daniel", "包装供应商", "", "13800138000",
           "Olivia", "客服", "不存在的名字xyz"]
search_out = {}
for q in QUERIES:
    res = hybrid_search(conn, q)
    search_out[q] = [{"name": r["contact"]["name"], "company": r["contact"]["company"],
                      "score": r["score"], "reasons": r["reasons"]} for r in res]
search_out["__tag_机器人__"] = [
    {"name": r["contact"]["name"], "score": r["score"], "reasons": r["reasons"]}
    for r in hybrid_search(conn, "", tag_filter="机器人")]
os.makedirs(os.path.join(HERE, "expected"), exist_ok=True)
json.dump(search_out, open(os.path.join(HERE, "expected", "search.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# 查重：复刻 app.py /api/duplicates（归一化+并查集），输出 groups
import re

def norm_phone(p):
    d = re.sub(r"\D", "", p or "")
    if len(d) > 11 and d.startswith("86"):
        d = d[2:]
    return d

rows = conn.execute("SELECT * FROM contacts ORDER BY created_at ASC").fetchall()
cs = [ddb.row_to_dict(r) for r in rows]
parent = list(range(len(cs)))

def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]
        a = parent[a]
    return a

def link(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb

pair_why = {}
for i in range(len(cs)):
    for j in range(i + 1, len(cs)):
        a, b = cs[i], cs[j]
        why = []
        pa = {norm_phone(a.get("phone1", "")), norm_phone(a.get("phone2", ""))} - {""}
        pb = {norm_phone(b.get("phone1", "")), norm_phone(b.get("phone2", ""))} - {""}
        shr = pa & pb
        if shr:
            why.append("电话相同：" + "、".join(sorted(shr)))
        ea, eb = (a.get("email") or "").strip().lower(), (b.get("email") or "").strip().lower()
        if ea and ea == eb:
            why.append("邮箱相同：" + ea)
        na, ca = (a.get("name") or "").strip(), (a.get("company") or "").strip()
        nb, cb = (b.get("name") or "").strip(), (b.get("company") or "").strip()
        if na and ca and na == nb and ca == cb:
            why.append(f"姓名+公司相同：{na}@{ca}")
        if why:
            link(i, j)
            pair_why[(i, j)] = why

groups = {}
for i in range(len(cs)):
    groups.setdefault(find(i), []).append(i)
dupes = []
for idxs in groups.values():
    if len(idxs) < 2:
        continue
    why = set()
    for x in range(len(idxs)):
        for y in range(x + 1, len(idxs)):
            why.update(pair_why.get((idxs[x], idxs[y]), []))
    dupes.append({"reason": "；".join(sorted(why)) or "疑似重复",
                  "names": sorted(cs[k]["name"] for k in idxs)})
dupes.sort(key=lambda g: -len(g["names"]))
json.dump(dupes, open(os.path.join(HERE, "expected", "dupes.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

validate_out = []
for s in samples:
    v = validate_fields(s)
    validate_out.append({"name": s["name"], "issues": v["issues"], "status": v["status"]})
validate_out.append({"name": "(bad phone)", "issues": validate_fields({"phone1": "abc"})["issues"],
                     "status": validate_fields({"phone1": "abc"})["status"]})
validate_out.append({"name": "(bad mail)", "issues": validate_fields({"email": "a@b"})["issues"],
                     "status": validate_fields({"email": "a@b"})["status"]})
json.dump(validate_out, open(os.path.join(HERE, "expected", "validate.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# 桌面备份 zip：file db bytes + uploads 假图 + llm_config（含旧 Key，必须被导入忽略）
tmpdb = os.path.join(HERE, "expected", "_tmp.db")
if os.path.exists(tmpdb):
    os.remove(tmpdb)
disk = sqlite3.connect(tmpdb)
disk.executescript(ddb.SCHEMA)
for i, s in enumerate(samples):
    d = dict(s)
    ddb.insert_contact(disk, d)
    disk.execute("UPDATE contacts SET created_at=?, updated_at=? WHERE rowid=last_insert_rowid()",
                 (1000 + i, 2000 - i))
disk.commit()
db_bytes = open(tmpdb, "rb").read()
disk.close()
os.remove(tmpdb)
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("carddeck.db", db_bytes)
    z.writestr("uploads/1000_ab12cd34.jpg", b"FAKEJPEG-1")
    z.writestr("uploads/1001_ef56gh78.jpg", b"FAKEJPEG-2")
    z.writestr("llm_config.json", json.dumps({"api_url": "x", "api_key": "OLD-KEY-MUST-IGNORE", "model": "m"}))
open(os.path.join(HERE, "desktop-backup.zip"), "wb").write(buf.getvalue())
print("fixtures ok:", len(samples), "samples;", len(search_out), "queries;", len(dupes), "dupe groups")
