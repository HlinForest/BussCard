"""SQLite 存储：联系人与批次。MVP 用 SQLite，升级路径见 README（Postgres+pgvector/pg_trgm）。"""
import json
import os
import sqlite3
import time

DB_PATH = os.environ.get(
    "CARDDECK_DB",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "carddeck.db"),
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTINCReMENT,
  photo_path TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  created_at REAL NOT NULL
);
""".replace("AUTINCReMENT", "AUTOINCREMENT") + """
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  title TEXT DEFAULT '',
  phone1 TEXT DEFAULT '',
  phone2 TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  business TEXT DEFAULT '',
  event TEXT DEFAULT '',
  met_at TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags_printed TEXT DEFAULT '[]',
  tags_inferred TEXT DEFAULT '[]',
  status TEXT DEFAULT '待核对',
  photo_path TEXT DEFAULT '',
  crop_path TEXT DEFAULT '',
  search_text TEXT DEFAULT '',
  embedding TEXT DEFAULT '',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_phone1 ON contacts(phone1);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
"""


def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def build_search_text(d: dict) -> str:
    parts = [
        d.get("name", ""), d.get("company", ""), d.get("title", ""),
        d.get("phone1", ""), d.get("phone2", ""), d.get("email", ""),
        d.get("address", ""), d.get("business", ""), d.get("event", ""),
        d.get("met_at", ""), d.get("notes", ""),
        " ".join(_as_list(d.get("tags_printed"))),
        " ".join(_as_list(d.get("tags_inferred"))),
    ]
    return "\n".join([p for p in parts if p])


def _as_list(v):
    if isinstance(v, list):
        return [str(x) for x in v]
    if isinstance(v, str):
        try:
            parsed = json.loads(v)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except Exception:
            pass
        return [v] if v else []
    return []


def row_to_dict(r: sqlite3.Row) -> dict:
    d = dict(r)
    for k in ("tags_printed", "tags_inferred"):
        try:
            d[k] = json.loads(d[k]) if d[k] else []
        except Exception:
            d[k] = []
    return d


def insert_contact(conn, d: dict) -> int:
    now = time.time()
    tags_p = json.dumps(d.get("tags_printed", []) or [], ensure_ascii=False)
    tags_i = json.dumps(d.get("tags_inferred", []) or [], ensure_ascii=False)
    st = build_search_text(d)
    cur = conn.execute(
        """INSERT INTO contacts
        (name,company,title,phone1,phone2,email,address,business,event,met_at,notes,
         tags_printed,tags_inferred,status,photo_path,crop_path,search_text,embedding,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            d.get("name", ""), d.get("company", ""), d.get("title", ""),
            d.get("phone1", ""), d.get("phone2", ""), d.get("email", ""),
            d.get("address", ""), d.get("business", ""), d.get("event", ""),
            d.get("met_at", ""), d.get("notes", ""),
            tags_p, tags_i, d.get("status", "待核对"),
            d.get("photo_path", ""), d.get("crop_path", ""),
            st, d.get("embedding", ""), now, now,
        ),
    )
    return cur.lastrowid
