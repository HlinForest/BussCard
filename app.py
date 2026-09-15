"""名片 MVP：拍照→多框调整→逐张识别→校对入库→Deck/表格/Excel→混合检索。
运行：python app.py（默认 http://127.0.0.1:5000，手机用电脑IP:5000访问）
环境变量见 .env.example：LLM_API_URL / LLM_API_KEY / LLM_MODEL
"""
import json
import os
import time
import uuid

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_file, send_from_directory

load_dotenv()

from carddeck import db
from carddeck.detector import crop_box, detect_cards
from carddeck.excel_export import export_xlsx
from carddeck.llm import recognize_crop, recognize_photo_multi
from carddeck.llm_config import get_llm_config, public_llm_config, save_llm_config
from carddeck.paths import data_dir, res_path
from carddeck.search import hybrid_search
from carddeck.validate import find_duplicates, validate_fields

UPLOAD_DIR = os.path.join(data_dir(), "uploads")
CROP_DIR = os.path.join(data_dir(), "crops")

app = Flask(__name__, static_folder=res_path("static"), template_folder=res_path("templates"))
app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024
db.init_db()


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/uploads/<path:name>")
def uploads(name):
    return send_from_directory(UPLOAD_DIR, name)


@app.get("/crops/<path:name>")
def crops(name):
    return send_from_directory(CROP_DIR, name)


@app.post("/api/upload")
def api_upload():
    f = request.files.get("photo")
    if not f:
        return jsonify({"error": "缺少 photo 文件"}), 400
    ext = os.path.splitext(f.filename or "")[1].lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    fname = f"{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    f.save(path)
    boxes = detect_cards(path)
    if not boxes:  # 漏检兜底：整图当一张，人工可再补框
        boxes = [{"x": 10, "y": 10, "w": 980, "h": 980}]
    conn = db.get_db()
    cur = conn.execute("INSERT INTO batches (photo_path,count,created_at) VALUES (?,?,?)",
                       (f"/uploads/{fname}", len(boxes), time.time()))
    conn.commit()
    batch_id = cur.lastrowid
    conn.close()
    return jsonify({"batch_id": batch_id, "photo_url": f"/uploads/{fname}", "boxes": boxes,
                    "hint": f"发现 {len(boxes)} 张名片，可拖动调整、补框后再识别"})


@app.post("/api/recognize")
def api_recognize():
    data = request.get_json(force=True)
    photo_url = data.get("photo_url", "")
    boxes = data.get("boxes", [])
    if not photo_url or not boxes:
        return jsonify({"error": "缺少 photo_url/boxes"}), 400
    if len(boxes) > 10:
        return jsonify({"error": "单张照片最多 10 张，请分批拍摄"}), 400
    src = os.path.join(UPLOAD_DIR, os.path.basename(photo_url))
    if not os.path.exists(src):
        return jsonify({"error": "原图不存在"}), 404
    conn = db.get_db()
    drafts = []
    for i, b in enumerate(boxes):
        crop_name = f"{int(time.time())}_{uuid.uuid4().hex[:6]}_{i}.jpg"
        crop_path = os.path.join(CROP_DIR, crop_name)
        try:
            crop_box(src, b, crop_path)
        except Exception as e:
            drafts.append({"box": b, "error": f"裁切失败：{e}"})
            continue
        try:
            fields = recognize_crop(crop_path)
        except Exception as e:
            fields = {k: ([] if k.startswith("tags") else "") for k in
                      ["name", "company", "title", "phone1", "phone2", "email", "address",
                       "business", "event", "met_at", "notes", "tags_printed", "tags_inferred"]}
            fields["_error"] = f"识别失败：{e}"
        v = validate_fields(fields)
        fields["status"] = v["status"]
        dups = find_duplicates(conn, fields)
        drafts.append({"box": b, "crop_url": f"/crops/{crop_name}", "fields": fields,
                       "issues": v["issues"] + ([fields["_error"]] if "_error" in fields else []),
                       "duplicates": dups})
    conn.close()
    return jsonify({"drafts": drafts})


def _draft_wrap(conn, fields, box=None, crop_url=""):
    v = validate_fields(fields)
    fields["status"] = v["status"]
    dups = find_duplicates(conn, fields)
    d = {"fields": fields, "issues": v["issues"] + ([fields["_error"]] if "_error" in fields else []),
         "duplicates": dups, "crop_url": crop_url}
    if box is not None:
        d["box"] = box
    return d


@app.post("/api/recognize-all")
def api_recognize_all():
    """免框选：整图多卡直接识别，一次返回多条草稿；不裁切，Deck 为文本小卡。"""
    data = request.get_json(force=True)
    photo_url = data.get("photo_url", "")
    if not photo_url:
        return jsonify({"error": "缺少 photo_url"}), 400
    src = os.path.join(UPLOAD_DIR, os.path.basename(photo_url))
    if not os.path.exists(src):
        return jsonify({"error": "原图不存在"}), 404
    conn = db.get_db()
    try:
        cards = recognize_photo_multi(src)
    except Exception as e:
        conn.close()
        return jsonify({"error": f"识别失败：{e}"}), 502
    if not cards:
        conn.close()
        return jsonify({"drafts": [], "note": "未识别出名片（未配 Key 或图上无清晰名片），请用框选模式"}), 200
    drafts = [_draft_wrap(conn, f, crop_url="") for f in cards]
    conn.close()
    return jsonify({"drafts": drafts, "mode": "whole-image"})


@app.post("/api/quick")
def api_quick():
    """一键到底：上传 → 整图多卡直接识别，一次返回全部草稿。
    不做框选、不裁切；Deck 为按提取字段生成的文本小卡。"""
    f = request.files.get("photo")
    if not f:
        return jsonify({"error": "缺少 photo 文件"}), 400
    ext = os.path.splitext(f.filename or "")[1].lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    fname = f"{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    f.save(path)
    photo_url = f"/uploads/{fname}"
    conn = db.get_db()
    conn.execute("INSERT INTO batches (photo_path,count,created_at) VALUES (?,?,?)",
                 (photo_url, 0, time.time()))
    conn.commit()
    try:
        cards = recognize_photo_multi(path)
    except Exception as e:
        conn.close()
        return jsonify({"error": f"识别失败：{e}"}), 502
    if not cards:
        conn.close()
        return jsonify({"photo_url": photo_url, "boxes": [], "drafts": [],
                        "note": "未识别出名片（未配 Key 或图上无清晰名片），可展开手动微调按框识别"}), 200
    drafts = [_draft_wrap(conn, f, crop_url="") for f in cards]
    conn.commit()
    conn.execute("UPDATE batches SET count=? WHERE photo_path=?", (len(drafts), photo_url))
    conn.commit()
    conn.close()
    return jsonify({"photo_url": photo_url, "boxes": [], "drafts": drafts, "mode": "whole-image"})


@app.post("/api/save")
def api_save():
    data = request.get_json(force=True)
    drafts = data.get("drafts", [])
    photo_url = data.get("photo_url", "")
    if not drafts:
        return jsonify({"error": "空草稿"}), 400
    conn = db.get_db()
    ids = []
    for d in drafts:
        f = d.get("fields", {})
        f["photo_path"] = photo_url
        f["crop_path"] = d.get("crop_url", "")
        v = validate_fields(f)
        f["status"] = d.get("fields", {}).get("status") or v["status"]
        # 人工已修正即视为确认，除非仍有格式问题
        ids.append(db.insert_contact(conn, f))
    conn.commit()
    conn.close()
    return jsonify({"ids": ids, "count": len(ids)})


@app.get("/api/contacts")
def api_contacts():
    conn = db.get_db()
    rows = conn.execute("SELECT * FROM contacts ORDER BY updated_at DESC LIMIT 2000").fetchall()
    conn.close()
    from carddeck.db import row_to_dict
    return jsonify([row_to_dict(r) for r in rows])


@app.put("/api/contacts/<int:cid>")
def api_update(cid):
    data = request.get_json(force=True)
    conn = db.get_db()
    allowed = ["name", "company", "title", "phone1", "phone2", "email", "address",
               "business", "event", "met_at", "notes", "status"]
    sets, vals = [], []
    for k in allowed:
        if k in data:
            sets.append(f"{k}=?")
            vals.append(data[k])
    for k in ("tags_printed", "tags_inferred"):
        if k in data:
            sets.append(f"{k}=?")
            vals.append(json.dumps(data[k] or [], ensure_ascii=False))
    if sets:
        # 同步 search_text
        row = conn.execute("SELECT * FROM contacts WHERE id=?", (cid,)).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "不存在"}), 404
        from carddeck.db import row_to_dict
        merged = row_to_dict(row)
        merged.update(data)
        sets.append("search_text=?")
        vals.append(db.build_search_text(merged))
        sets.append("updated_at=?")
        vals.append(time.time())
        vals.append(cid)
        conn.execute(f"UPDATE contacts SET {','.join(sets)} WHERE id=?", vals)
        conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.get("/api/duplicates")
def api_duplicates():
    """重复分组：电话（归一化去+86/空格）相同，或邮箱相同，或姓名+公司相同。用并查集合并传递重复。"""
    import re
    from carddeck.db import row_to_dict

    def norm_phone(p):
        d = re.sub(r"\D", "", p or "")
        if len(d) > 11 and d.startswith("86"):
            d = d[2:]
        return d

    conn = db.get_db()
    rows = conn.execute("SELECT * FROM contacts ORDER BY created_at ASC").fetchall()
    conn.close()
    cs = [row_to_dict(r) for r in rows]
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
    out = []
    for idxs in groups.values():
        if len(idxs) < 2:
            continue
        why = set()
        for x in range(len(idxs)):
            for y in range(x + 1, len(idxs)):
                why.update(pair_why.get((idxs[x], idxs[y]), []))
        out.append({"reason": "；".join(sorted(why)) or "疑似重复",
                    "contacts": [cs[k] for k in idxs]})
    out.sort(key=lambda g: -len(g["contacts"]))
    return jsonify(out)


@app.post("/api/contacts/delete")
def api_delete():
    data = request.get_json(force=True)
    ids = data.get("ids", [])
    if not ids:
        return jsonify({"error": "缺少 ids"}), 400
    conn = db.get_db()
    conn.execute(f"DELETE FROM contacts WHERE id IN ({','.join('?' * len(ids))})", ids)
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.get("/api/search")
def api_search():
    q = request.args.get("q", "")
    tag = request.args.get("tag", "")
    conn = db.get_db()
    res = hybrid_search(conn, q, tag_filter=tag)
    conn.close()
    return jsonify(res)


@app.get("/api/llm-config")
def api_llm_get():
    cfg = public_llm_config()
    return jsonify(cfg)


@app.post("/api/llm-config")
def api_llm_save():
    data = request.get_json(force=True)
    cur = get_llm_config()
    api_url = data.get("api_url", "").strip() or cur["api_url"]
    api_key = data.get("api_key", "").strip() or cur["api_key"]
    model = data.get("model", "").strip() or cur["model"]
    save_llm_config(api_url, api_key, model)
    return jsonify({"ok": True, **public_llm_config()})


@app.post("/api/llm-test")
def api_llm_test():
    from carddeck.llm import test_connection
    data = request.get_json(force=True) if request.data else {}
    cfg = get_llm_config()
    api_url = (data.get("api_url") or cfg["api_url"]).strip()
    api_key = (data.get("api_key") or cfg["api_key"]).strip()
    model = (data.get("model") or cfg["model"]).strip()
    if not api_url or not api_key:
        return jsonify({"error": "先填写 API URL 和 Key"}), 400
    try:
        return jsonify(test_connection(api_url, api_key, model))
    except Exception as e:
        return jsonify({"error": f"连接失败：{e}"}), 502


@app.post("/api/llm-models")
def api_llm_models():
    from carddeck.llm import list_models
    data = request.get_json(force=True) if request.data else {}
    cfg = get_llm_config()
    api_url = (data.get("api_url") or cfg["api_url"] or "").strip()
    api_key = (data.get("api_key") or cfg["api_key"] or "").strip()
    if not api_url or not api_key:
        return jsonify({"error": "先填写 API URL 和 Key"}), 400
    try:
        return jsonify(list_models(api_url, api_key))
    except Exception as e:
        return jsonify({"error": f"获取模型列表失败：{e}"}), 502


@app.get("/api/storage")
def api_storage():
    """本机数据位置与占用：路径、大小、条数，一目了然。"""
    from carddeck.db import DB_PATH
    from carddeck.llm_config import CONFIG_PATH
    from carddeck.paths import data_dir

    def dir_stat(p):
        n, s = 0, 0
        if os.path.isdir(p):
            for root, _, files in os.walk(p):
                for fn in files:
                    fp = os.path.join(root, fn)
                    try:
                        s += os.path.getsize(fp)
                        n += 1
                    except OSError:
                        pass
        return {"count": n, "size": s}

    def fmt_mb(b):
        return round(b / 1048576, 1)

    dd = data_dir()
    conn = db.get_db()
    contacts = conn.execute("SELECT COUNT(*) c FROM contacts").fetchone()["c"]
    batches = conn.execute("SELECT COUNT(*) c FROM batches").fetchone()["c"]
    conn.close()
    ups, crs = dir_stat(UPLOAD_DIR), dir_stat(CROP_DIR)
    try:
        db_size = os.path.getsize(DB_PATH)
    except OSError:
        db_size = 0
    return jsonify({
        "data_dir": dd,
        "db_path": DB_PATH,
        "db_mb": fmt_mb(db_size),
        "contacts": contacts,
        "batches": batches,
        "uploads": {"count": ups["count"], "mb": fmt_mb(ups["size"])},
        "llm_config": {"path": CONFIG_PATH, "exists": os.path.exists(CONFIG_PATH)},
        "total_mb": fmt_mb(db_size + ups["size"] + crs["size"]),
    })


@app.get("/api/backup.zip")
def api_backup():
    """一键备份：整个 data 文件夹打包下载。"""
    import io
    import zipfile
    from carddeck.paths import data_dir
    dd = data_dir()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(dd):
            for fn in files:
                fp = os.path.join(root, fn)
                z.write(fp, os.path.relpath(fp, dd))
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True,
                     download_name="carddeck-backup.zip")


@app.post("/api/open-folder")
def api_open_folder():
    """在本机打开数据文件夹（电脑上点有效；手机点则打开服务器那台电脑的文件夹）。"""
    import subprocess
    import sys
    from carddeck.paths import data_dir
    dd = data_dir()
    try:
        if sys.platform.startswith("win"):
            os.startfile(dd)  # noqa: S606
        elif sys.platform == "darwin":
            subprocess.Popen(["open", dd])
        else:
            subprocess.Popen(["xdg-open", dd])
    except Exception as e:
        return jsonify({"error": f"打不开：{e}"}), 500
    return jsonify({"ok": True, "path": dd})


@app.get("/api/export.xlsx")
def api_export():
    ids = request.args.get("ids", "")
    q = request.args.get("q", "")
    conn = db.get_db()
    if ids:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
        if not id_list:
            conn.close()
            return jsonify({"error": "ids 为空"}), 400
        rows = conn.execute(
            f"SELECT * FROM contacts WHERE id IN ({','.join('?' * len(id_list))})", id_list).fetchall()
    elif q:
        res = hybrid_search(conn, q)
        rows = []
        # hybrid 返回 dict，需要回查保持导出一致性：用 id 再查一次
        for r in res:
            rows.append(r["contact"])
        conn.close()
        from carddeck.db import row_to_dict  # rows 已是 dict
        blob = export_xlsx(rows)
        return send_file(__import__("io").BytesIO(blob),
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                         as_attachment=True, download_name="contacts.xlsx")
    else:
        rows = conn.execute("SELECT * FROM contacts ORDER BY updated_at DESC").fetchall()
    from carddeck.db import row_to_dict
    contacts = [row_to_dict(r) for r in rows] if rows and not isinstance(rows[0], dict) else list(rows)
    conn.close()
    blob = export_xlsx(contacts)
    return send_file(__import__("io").BytesIO(blob),
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     as_attachment=True, download_name="contacts.xlsx")


if __name__ == "__main__":
    import sys
    port = int(os.environ.get("PORT", 5000))
    frozen = getattr(sys, "frozen", False)
    debug = os.environ.get("CARDDECK_DEBUG", "" if frozen else "1") == "1"
    if frozen and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        import webbrowser
        webbrowser.open(f"http://127.0.0.1:{port}/")
    app.run(host="0.0.0.0", port=port, debug=debug)
