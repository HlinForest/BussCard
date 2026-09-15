// MVP 前端：框选调整 → 识别 → 校对 → Deck/表格/搜索/导出
let boxes = [], photoUrl = "", drafts = [], contacts = [];
const $ = s => document.querySelector(s);
function showBusy(t) { $("#busyText").textContent = t || "处理中…"; $("#busy").hidden = false; }
function hideBusy() { $("#busy").hidden = true; }
async function runBusy(btn, text, fn) {
  const wasDisabled = btn ? btn.disabled : false;
  let old = "";
  if (btn) { old = btn.textContent; btn.disabled = true; btn.textContent = text || "处理中…"; }
  showBusy(text);
  try { return await fn(); }
  finally { hideBusy(); if (btn) { btn.textContent = old; btn.disabled = wasDisabled; } }
}

document.querySelectorAll("nav button").forEach(b => b.onclick = () => {
  document.querySelectorAll("nav button").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); $("#tab-" + b.dataset.tab).classList.add("active");
  if (b.dataset.tab === "deck") loadDeck();
  if (b.dataset.tab === "table") loadTable();
  if (b.dataset.tab === "data") loadStorage();
  if (b.dataset.tab === "settings") loadLlm();
});

// ---- 框选 ----
function renderBoxes() {
  const layer = $("#boxLayer"), img = $("#photoImg");
  layer.innerHTML = "";
  const r = img.getBoundingClientRect();
  const scaleX = img.clientWidth / 1000, scaleY = img.clientHeight / 1000;
  boxes.forEach((b, i) => {
    const d = document.createElement("div");
    d.className = "box";
    d.style.left = b.x / 10 + "%"; d.style.top = b.y / 10 + "%";
    d.style.width = b.w / 10 + "%"; d.style.height = b.h / 10 + "%";
    d.innerHTML = `<span class="tag">#${i + 1}</span><button class="del">×</button><span class="rs"></span>`;
    d.querySelector(".del").onclick = e => { e.stopPropagation(); boxes.splice(i, 1); renderBoxes(); };
    // 拖动
    d.onpointerdown = e => {
      if (e.target.classList.contains("rs") || e.target.classList.contains("del")) return;
      const sx = e.clientX, sy = e.clientY, ox = b.x, oy = b.y;
      const mv = ev => { b.x = Math.round(Math.min(950, Math.max(0, ox + (ev.clientX - sx) / img.clientWidth * 1000))); b.y = Math.round(Math.min(950, Math.max(0, oy + (ev.clientY - sy) / img.clientHeight * 1000))); renderBoxes(); };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    };
    // 缩放
    d.querySelector(".rs").onpointerdown = e => {
      e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, ow = b.w, oh = b.h;
      const mv = ev => { b.w = Math.round(Math.min(1000 - b.x, Math.max(30, ow + (ev.clientX - sx) / img.clientWidth * 1000))); b.h = Math.round(Math.min(1000 - b.y, Math.max(30, oh + (ev.clientY - sy) / img.clientHeight * 1000))); renderBoxes(); };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    };
    layer.appendChild(d);
  });
  $("#detectHint").textContent = boxes.length ? `发现 ${boxes.length} 张名片（可拖动/缩放/删除/补框）` : "";
  $("#btnRecognize").disabled = !boxes.length;
}
$("#btnAddBox").onclick = () => { boxes.push({ x: 350, y: 350, w: 300, h: 180 }); renderBoxes(); };
$("#photoImg").onload = renderBoxes;

$("#btnUpload").onclick = () => runBusy($("#btnUpload"), "上传检测中…", async () => {
  const f = $("#photo").files[0];
  if (!f) return alert("先选照片");
  const fd = new FormData(); fd.append("photo", f);
  const r = await fetch("/api/upload", { method: "POST", body: fd }).then(r => r.json());
  if (r.error) return alert(r.error);
  photoUrl = r.photo_url; boxes = r.boxes;
  $("#photoImg").src = photoUrl + "?t=" + Date.now();
  renderBoxes();
});

function renderDrafts(list) {
  drafts = list;
  const wrap = $("#drafts"); wrap.innerHTML = "";
  drafts.forEach((d, i) => {
    const div = document.createElement("div"); div.className = "draft";
    const f = d.fields || {};
    div.innerHTML = `<div>${miniCard(Object.assign({ status: (d.issues || []).length ? "待核对" : "已确认" }, f))}<div class="muted">卡片 #${i + 1}（保存后 Deck 即此样式）</div></div>
    <div><div class="fields">${["name", "company", "title", "phone1", "phone2", "email", "address", "business", "event", "met_at", "notes"].map(k => `<label>${k}<input data-i="${i}" data-k="${k}" value="${(f[k] || '').replace(/"/g, '&quot;')}"></label>`).join("")}
    <label>tags_printed(逗号)<input data-i="${i}" data-k="tags_printed" value="${(f.tags_printed || []).join(',')}"></label>
    <label>tags_inferred(逗号)<input data-i="${i}" data-k="tags_inferred" value="${(f.tags_inferred || []).join(',')}"></label></div>
    <div class="issues">${(d.issues || []).join('<br>')}</div>
    <div class="dups">${(d.duplicates || []).map(x => `疑似重复：${x.name}@${x.company}（${x.reason}）`).join('<br>')}</div></div>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll("input").forEach(inp => inp.oninput = () => {
    const i = +inp.dataset.i, k = inp.dataset.k;
    drafts[i].fields[k] = (k.startsWith("tags")) ? inp.value.split(",").map(s => s.trim()).filter(Boolean) : inp.value;
  });
  $("#btnSave").disabled = !drafts.length;
}

$("#btnQuick").onclick = () => runBusy($("#btnQuick"), "一键识别中（约需几十秒）…", async () => {
  const f = $("#photo").files[0];
  if (!f) return alert("先选照片");
  $("#detectHint").textContent = "一键识别中（上传+整图多卡识别）…";
  const fd = new FormData(); fd.append("photo", f);
  const r = await fetch("/api/quick", { method: "POST", body: fd }).then(r => r.json());
  if (r.error) { $("#detectHint").textContent = ""; return alert(r.error); }
  photoUrl = r.photo_url; boxes = r.boxes;
  $("#photoImg").src = photoUrl + "?t=" + Date.now();
  renderBoxes();
  renderDrafts(r.drafts || []);
  $("#detectHint").textContent = (r.drafts || []).length ? `一键完成：识别出 ${r.drafts.length} 张，直接核对保存` : (r.note || "未识别出");
});

$("#btnRecognize").onclick = () => runBusy($("#btnRecognize"), "按框识别中…", async () => {
  const r = await fetch("/api/recognize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo_url: photoUrl, boxes }) }).then(r => r.json());
  if (r.error) return alert(r.error);
  renderDrafts(r.drafts);
});

$("#btnSave").onclick = () => runBusy($("#btnSave"), "保存中…", async () => {
  const r = await fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo_url: photoUrl, drafts }) }).then(r => r.json());
  if (r.error) return alert(r.error);
  alert(`已保存 ${r.count} 条`); loadDeck();
});

// ---- Deck ----
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function miniCard(f) {
  const tp = (f.tags_printed || []).join("、"), ti = (f.tags_inferred || []).join("、");
  const st = f.status === "已确认" ? `<span class="astatus ok">已确认</span>` : `<span class="astatus">待核对</span>`;
  return `<div class="acard"><div class="aname">${esc(f.name) || '(待核对)'}</div>
  <div class="aco">${esc(f.company)}${f.title ? ' · ' + esc(f.title) : ''}</div>
  ${f.phone1 ? `<div class="arow">电话 ${esc(f.phone1)}${f.phone2 ? ' / ' + esc(f.phone2) : ''}</div>` : ''}
  ${f.email ? `<div class="arow">邮箱 ${esc(f.email)}</div>` : ''}
  ${f.business ? `<div class="abiz">${esc(f.business)}</div>` : ''}
  ${(tp || ti) ? `<div class="atags">${tp ? '印:' + esc(tp) : ''}${tp && ti ? ' ' : ''}${ti ? '推:' + esc(ti) : ''}</div>` : ''}
  ${f.status ? st : ''}</div>`;
}
function sheetHtml(c) {
  const kv = [["公司", c.company], ["职位", c.title], ["电话1", c.phone1], ["电话2", c.phone2],
    ["邮箱", c.email], ["地址", c.address], ["业务", c.business], ["展会", c.event], ["结识时间", c.met_at],
    ["备注", c.notes]].map(([k, v]) => v ? `<b>${k}</b><span>${esc(v)}</span>` : "").join("");
  return `${miniCard(c)}<div class="kv">${kv}</div>`;
}
let sheetContact = null;
function openSheet(c) { sheetContact = c; $("#sheetBody").innerHTML = sheetHtml(c); $("#modal").hidden = false; }
$("#btnClose").onclick = () => { $("#modal").hidden = true; sheetContact = null; };
$("#modal").onclick = e => { if (e.target.id === "modal") { $("#modal").hidden = true; sheetContact = null; } };
async function delContact(id) {
  if (!confirm("删除这张名片？")) return;
  showBusy("删除中…");
  try {
    await fetch("/api/contacts/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
  } finally { hideBusy(); }
  $("#modal").hidden = true; sheetContact = null;
  loadDeck();
  if ($("#tab-search").classList.contains("active")) $("#btnSearch").onclick();
}
$("#btnSheetDel").onclick = () => { if (sheetContact && sheetContact.id) delContact(sheetContact.id); };
async function loadDeck() {
  contacts = await fetch("/api/contacts").then(r => r.json());
  const el = $("#deck");
  el.innerHTML = contacts.map((c, i) => `<div class="card" data-i="${i}"><button class="carddel" data-id="${c.id}">删除</button>${miniCard(c)}</div>`).join("") || '<span class="muted">暂无数据，先去拍照入库</span>';
  el.querySelectorAll(".card").forEach(d => d.onclick = () => openSheet(contacts[+d.dataset.i]));
  el.querySelectorAll(".carddel").forEach(b => b.onclick = e => { e.stopPropagation(); delContact(+b.dataset.id); });
}

// ---- 表格 ----
async function loadTable() {
  contacts = await fetch("/api/contacts").then(r => r.json());
  const tb = $("#tbl tbody"); tb.innerHTML = "";
  contacts.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input type="checkbox" data-id="${c.id}" class="sel"></td>
    ${["name", "company", "title", "phone1", "phone2", "email"].map(k => `<td><input data-id="${c.id}" data-k="${k}" value="${(c[k] || '').replace(/"/g, '&quot;')}"></td>`).join("")}
    <td><input data-id="${c.id}" data-k="business" value="${(c.business || '').replace(/"/g, '&quot;')}"> <input data-id="${c.id}" data-k="notes" value="${(c.notes || '').replace(/"/g, '&quot;')}"></td>
    <td>${(c.tags_printed || []).join('、')}/${(c.tags_inferred || []).join('、')}</td><td>${c.status}</td>
    <td><button data-save="${c.id}">保存</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll("[data-save]").forEach(b => b.onclick = () => runBusy(b, "保存…", async () => {
    const id = b.dataset.save, payload = {};
    tb.querySelectorAll(`input[data-id="${id}"][data-k]`).forEach(i => payload[i.dataset.k] = i.value);
    await fetch(`/api/contacts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    alert("已保存");
  }));
}
$("#btnReloadTable").onclick = e => runBusy(e.currentTarget, "加载中…", loadTable);
$("#chkAll").onchange = e => document.querySelectorAll(".sel").forEach(c => c.checked = e.target.checked);
const selIds = () => [...document.querySelectorAll(".sel:checked")].map(c => c.dataset.id).join(",");
$("#btnExportAll").onclick = () => location.href = "/api/export.xlsx";
$("#btnExportSel").onclick = () => { const s = selIds(); if (!s) return alert("先勾选"); location.href = "/api/export.xlsx?ids=" + encodeURIComponent(s); };
function renderDupPanel(p, groups, reload) {
  if (!groups.length) { p.innerHTML = `<div class="muted">没有发现重复（电话/邮箱/姓名+公司均无碰撞）</div>`; return; }
  let total = 0;
  groups.forEach(g => total += g.contacts.length - 1);
  const gid = "d" + Math.random().toString(36).slice(2, 8);
  p.innerHTML = `<div class="muted">发现 ${groups.length} 组、${total} 条重复。默认每组保留最早一条，可改选，确认后删除未勾选：</div>` +
    groups.map((g, i) => `<div class="dup"><div class="why">${esc(g.reason)}</div>` +
      g.contacts.map((c, k) => `<label><input type="radio" name="${gid}${i}" value="${c.id}"${k === 0 ? " checked" : ""}> 保留 ${esc(c.name) || '(待核对)'} · ${esc(c.company)} · ${esc(c.phone1)} · ${esc(c.email)}</label>`).join("") +
      `</div>`).join("") +
    `<div><button id="${gid}clean">删除重复（保留每组勾选）</button></div>`;
  p.querySelector("#" + gid + "clean").onclick = () => runBusy(p.querySelector("#" + gid + "clean"), "删除中…", async () => {
    const keep = new Set([...p.querySelectorAll("input[type=radio]:checked")].map(r => +r.value));
    const del = [];
    groups.forEach(g => g.contacts.forEach(c => { if (!keep.has(c.id)) del.push(c.id); }));
    if (!del.length) return alert("没有可删的");
    if (!confirm(`删除 ${del.length} 条重复，保留 ${keep.size} 条？`)) return;
    await fetch("/api/contacts/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: del }) });
    p.innerHTML = `<div class="muted">已删除 ${del.length} 条</div>`;
    reload();
  });
}
function bindDup(btnId, panelId, reload) {
  $("#" + btnId).onclick = () => runBusy($("#" + btnId), "查找重复中…", async () => {
    const groups = await fetch("/api/duplicates").then(r => r.json());
    renderDupPanel($("#" + panelId), groups, reload);
  });
}
bindDup("btnDup", "dupPanel", loadTable);
bindDup("btnDupDeck", "dupPanelDeck", loadDeck);
$("#btnDelSel").onclick = e => runBusy(e.currentTarget, "删除中…", async () => {
  const s = selIds(); if (!s) return alert("先勾选");
  if (!confirm("删除勾选？")) return;
  await fetch("/api/contacts/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: s.split(",").map(Number) }) });
  loadTable();
});

// ---- 搜索 ----
let lastResults = [];
$("#btnSearch").onclick = () => runBusy($("#btnSearch"), "搜索中…", async () => {
  const q = $("#q").value;
  lastResults = await fetch("/api/search?q=" + encodeURIComponent(q)).then(r => r.json());
  const box = $("#results");
  box.innerHTML = lastResults.map((r, i) => { const c = r.contact; return `<div class="hit" data-i="${i}" style="cursor:pointer"><b>${c.name || '(待核对)'}</b> ${c.company || ''} ${c.title || ''} · ${c.phone1 || ''} ${c.email || ''}
  <div class="why">命中：${(r.reasons || []).join('；')}（${r.score}）</div></div>`; }).join("") || "无结果";
  box.querySelectorAll(".hit").forEach(h => h.onclick = () => openSheet(lastResults[+h.dataset.i].contact));
});

// ---- 本机数据 ----
async function loadStorage() {
  const s = await fetch("/api/storage").then(r => r.json());
  $("#storage").innerHTML = `<div class="sheet" style="max-width:640px"><div class="kv">
  <b>数据文件夹</b><span>${esc(s.data_dir)}</span>
  <b>联系人库</b><span>${esc(s.db_path)}（${s.db_mb} MB，${s.contacts} 条联系人 / ${s.batches} 次拍照）</span>
  <b>原图</b><span>${s.uploads.count} 张，共 ${s.uploads.mb} MB</span>
  <b>LLM配置</b><span>${s.llm_config.exists ? esc(s.llm_config.path) + "（已配置）" : "未配置，去 LLM设置 页填写"}</span>
  <b>总占用</b><span>${s.total_mb} MB</span>
  </div></div>`;
}
$("#btnStorage").onclick = e => runBusy(e.currentTarget, "加载中…", loadStorage);
$("#btnBackup").onclick = () => location.href = "/api/backup.zip";
$("#btnOpenFolder").onclick = e => runBusy(e.currentTarget, "打开中…", async () => {
  const r = await fetch("/api/open-folder", { method: "POST" }).then(r => r.json());
  if (r.error) alert(r.error);
});

// ---- LLM 设置 ----
async function loadLlm() {
  const c = await fetch("/api/llm-config").then(r => r.json());
  $("#llmUrl").value = c.api_url || "";
  $("#llmModel").value = c.model || "gpt-4o-mini";
  $("#llmStatus").textContent = c.configured ? `已配置（${c.api_key_masked}），识别走真实模型` : "未配置，识别走空模板待核对流程";
}
$("#btnLlmSave").onclick = () => runBusy($("#btnLlmSave"), "保存中…", async () => {
  const payload = { api_url: $("#llmUrl").value.trim(), api_key: $("#llmKey").value.trim(), model: $("#llmModel").value.trim() || "gpt-4o-mini" };
  if (!payload.api_key) { // 不想改 Key 时允许留空：沿用已存的
    const cur = await fetch("/api/llm-config").then(r => r.json());
    if (cur.configured && !payload.api_url) return alert("已配置，如需修改请填写完整 URL+Key");
  }
  const r = await fetch("/api/llm-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(r => r.json());
  $("#llmKey").value = "";
  await loadLlm();
  alert("已保存");
});
$("#btnLlmTest").onclick = () => runBusy($("#btnLlmTest"), "测试中…", async () => {
  const payload = { api_url: $("#llmUrl").value.trim(), api_key: $("#llmKey").value.trim(), model: $("#llmModel").value.trim() };
  const r = await fetch("/api/llm-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(r => r.json());
  $("#llmStatus").textContent = r.ok ? `连接成功，模型回复：${r.reply}` : (r.error || "失败");
});
async function fetchModels(auto) {
  const url = $("#llmUrl").value.trim(), key = $("#llmKey").value.trim();
  if (!url || !key) { if (!auto) alert("先填 API URL 和 Key"); return; }
  if (!auto) showBusy("正在获取模型列表…"); else $("#llmStatus").textContent = "正在获取模型列表…";
  try {
  const r = await fetch("/api/llm-models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_url: url, api_key: key }) }).then(r => r.json());
  if (r.error) { $("#llmStatus").textContent = r.error + "（部分网关不支持 /models，可手填模型名）"; return; }
  const sel = $("#llmModelSel"); sel.innerHTML = "";
  (r.models || []).forEach((m, i) => { const o = document.createElement("option"); o.value = m; o.textContent = m; sel.appendChild(o); });
  const cur = $("#llmModel").value.trim();
  if (r.models && r.models.length) {
    sel.value = r.models.includes(cur) ? cur : r.models[0];
    if (!cur) $("#llmModel").value = r.models[0];
  } else {
    const o = document.createElement("option"); o.value = ""; o.textContent = "未取到请手填模型名"; sel.appendChild(o);
  }
  $("#llmModels").textContent = r.models && r.models.length ? `共 ${r.models.length} 个模型：${r.models.slice(0, 12).join("、")}${r.models.length > 12 ? "…" : ""}（已可下拉选择，也可手填）` : "该 Key 下无可用模型（或网关返回为空），请手填模型名";
  $("#llmStatus").textContent = "模型列表已更新";
  } finally { if (!auto) hideBusy(); }
}
$("#btnLlmModels").onclick = () => fetchModels(false);
$("#llmModelSel").onchange = e => { if (e.target.value) $("#llmModel").value = e.target.value; };
$("#llmKey").addEventListener("change", () => { if ($("#llmUrl").value.trim() && $("#llmKey").value.trim()) fetchModels(true); });
loadDeck();
