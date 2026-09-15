"""字段校验：电话/邮箱单独校验；缺失标待核对；重名只提示不自动合并。"""
import re

PHONE_RE = re.compile(r"^\+?[\d][\d\s\-()]{5,20}$")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def validate_fields(d: dict) -> dict:
    issues = []
    for key in ("phone1", "phone2"):
        v = (d.get(key) or "").strip()
        if v and not PHONE_RE.match(v):
            issues.append(f"{key} 格式可疑：{v}")
    email = (d.get("email") or "").strip()
    if email and not EMAIL_RE.match(email):
        issues.append(f"邮箱格式可疑：{email}")
    critical_empty = [k for k in ("name", "company", "phone1") if not (d.get(k) or "").strip()]
    if critical_empty:
        issues.append("待核对：" + "、".join(critical_empty) + "为空")
    status = "待核对" if issues else "已确认"
    return {"issues": issues, "status": status}


def find_duplicates(conn, d: dict, limit=5):
    """疑似重复提示：同手机号/同邮箱/同名+同公司。"""
    out = []
    phones = [p for p in [(d.get("phone1") or "").strip(), (d.get("phone2") or "").strip()] if p]
    email = (d.get("email") or "").strip()
    name = (d.get("name") or "").strip()
    company = (d.get("company") or "").strip()
    seen = set()
    if phones:
        q = "SELECT id,name,company,phone1,email FROM contacts WHERE phone1 IN (%s) OR phone2 IN (%s)" % (
            ",".join("?" * len(phones)), ",".join("?" * len(phones)))
        for r in conn.execute(q, phones + phones):
            if r["id"] not in seen:
                seen.add(r["id"])
                out.append({"id": r["id"], "name": r["name"], "company": r["company"],
                            "phone1": r["phone1"], "email": r["email"], "reason": "电话相同"})
    if email:
        for r in conn.execute("SELECT id,name,company,phone1,email FROM contacts WHERE email=?", (email,)):
            if r["id"] not in seen:
                seen.add(r["id"])
                out.append({"id": r["id"], "name": r["name"], "company": r["company"],
                            "phone1": r["phone1"], "email": r["email"], "reason": "邮箱相同"})
    if name and company:
        for r in conn.execute("SELECT id,name,company,phone1,email FROM contacts WHERE name=? AND company=?", (name, company)):
            if r["id"] not in seen:
                seen.add(r["id"])
                out.append({"id": r["id"], "name": r["name"], "company": r["company"],
                            "phone1": r["phone1"], "email": r["email"], "reason": "姓名+公司相同"})
    return out[:limit]
