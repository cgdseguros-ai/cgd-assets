/*! cgd-leads.js — CGD Leads Panel — BUILD PROVA */
(function () {
  "use strict";

  // ========= BUILD (prova visual de update) =========
  const BUILD = "CGD-LEADS BUILD 2026-02-18 • PROVA-1";

  // ========= Sentinel helpers =========
  const SENT_ID = "cgd-sentinel";
  function setSent(t) {
    try {
      const el = document.getElementById(SENT_ID);
      if (el) el.textContent = String(t);
    } catch (_) {}
  }

  // Prova imediata (antes de qualquer coisa)
  setSent("JS iniciou ✅ " + BUILD);
  try {
    document.title = "✅ " + BUILD;
  } catch (_) {}

  // Captura de erro global (pra não ficar “igual”)
  function showFatal(err) {
    const msg = String(err && (err.stack || err.message || err) ? (err.stack || err.message || err) : err);
    setSent("ERRO ❌ " + BUILD + " — veja tela");
    try {
      const r = document.getElementById("cgd-leads-root") || document.body;
      const box = document.createElement("div");
      box.style.cssText =
        "margin:12px;padding:12px;border-radius:14px;border:2px solid rgba(220,0,60,.35);background:rgba(255,220,235,.75);font:900 12px system-ui;white-space:pre-wrap;";
      box.textContent = "FALHA NO PAINEL (" + BUILD + ")\n\n" + msg;
      r.prepend(box);
    } catch (_) {}
  }
  window.addEventListener("error", (e) => showFatal(e.error || e.message || e));
  window.addEventListener("unhandledrejection", (e) => showFatal(e.reason || e));

  // ========= CONFIG =========
  const CFG = {
    WEBHOOK_BASE: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb",

    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD: "UF_CRM_1771333014",
    UF_IDADE: "UF_CRM_1771339221",
    UF_BAIRRO: "UF_CRM_LEAD_1731909705398",
    UF_FONTE: "UF_CRM_1767285733843",
    LEAD_COMMENTS_FIELD: "COMMENTS",

    LEAD_STATUS: {
      NEW: "NEW",
      IN_PROCESS: "IN_PROCESS",
      QUALIFIED: "UC_0NFA3H",
      LOST: "UC_5IMTI4",
      WON: "UC_B3RQAF",
      JUNK: "JUNK",
    },

    USERS: [
      { id: 15, name: "ALINE" },
      { id: 19, name: "ADRIANA" },
      { id: 17, name: "ANDREYNA" },
      { id: 23, name: "MARIANA" },
      { id: 811, name: "JOSIANE" },
      { id: 3081, name: "BRUNA LUISA" },
      { id: 3079, name: "LIVIA ALVES" },
      { id: 3083, name: "FERNANDA SILVA" },
      { id: 3085, name: "NICOLLE BELMONTE" },
      { id: 815, name: "GABRIEL" },
      { id: 3389, name: "ANNA CLARA" },
      { id: 3387, name: "BEATRIZ" },
      { id: 813, name: "MANUELA" },
      { id: 841, name: "MARIA CLARA" },
    ],

    REFRESH_MS: 15000, // 15s

    LOGO_URL:
      "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=e6lxlp1bz9nz",

    TITLE: "PAINEL DE LEADS - CGD CORRETORA",
  };

  // ========= Small helpers =========
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const pad2 = (n) => String(n).padStart(2, "0");
  function fmtDT(v) {
    if (!v) return "-";
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(
      d.getMinutes()
    )}`;
  }

  function renderClientName(lead) {
    const n = [lead.NAME, lead.LAST_NAME].filter(Boolean).join(" ").trim();
    if (n) return n;
    if (lead.TITLE) return String(lead.TITLE);
    return `Lead ${lead.ID}`;
  }

  // ========= Bitrix REST =========
  async function bx(method, params) {
    const url = `${CFG.WEBHOOK_BASE}/${method}.json`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params || {}),
      credentials: "omit",
      cache: "no-store",
    });

    const txt = await res.text();
    let data;
    try {
      data = JSON.parse(txt);
    } catch (e) {
      throw new Error(`Resposta inválida (${res.status}): ${txt.slice(0, 250)}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${data?.error_description || data?.error || txt}`);
    if (data.error) throw new Error(data.error_description || data.error);
    return data.result;
  }

  async function listLeads(filter, limit = 100) {
    let start = 0;
    const out = [];
    while (out.length < limit) {
      const batch = await bx("crm.lead.list", {
        order: { DATE_CREATE: "DESC" },
        filter: filter || {},
        select: [
          "ID",
          "TITLE",
          "STATUS_ID",
          "ASSIGNED_BY_ID",
          "DATE_CREATE",
          "DATE_MODIFY",
          "NAME",
          "LAST_NAME",
          CFG.UF_OPERADORA,
          CFG.UF_DT_LEAD,
          CFG.UF_IDADE,
          CFG.UF_FONTE,
          CFG.UF_BAIRRO,
        ],
        start,
      });
      if (!Array.isArray(batch) || !batch.length) break;
      out.push(...batch);
      start += batch.length;
      if (batch.length < 50) break;
    }
    return out.slice(0, limit);
  }

  // ========= UI =========
  const ROOT_ID = "cgd-leads-root";
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    (document.body || document.documentElement).appendChild(root);
  }

  const css = document.createElement("style");
  css.textContent = `
    #cgd-app, #cgd-app *{ box-sizing:border-box; }
    #cgd-app{ font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; padding:12px; }
    .top{ position:sticky; top:0; z-index:10; background:#fff; border:1px solid rgba(0,0,0,.12); border-radius:16px; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .ttl{ display:flex; align-items:center; gap:10px; font-weight:950; }
    .logo{ width:28px; height:28px; border-radius:999px; object-fit:cover; border:1px solid rgba(0,0,0,.14); }
    .badge{ font:900 12px system-ui; padding:6px 10px; border-radius:999px; border:1px solid rgba(0,0,0,.12); background:rgba(0,0,0,.03); }
    .grid{ margin-top:12px; display:grid; grid-template-columns: 1fr; gap:10px; }
    .card{ border:1px solid rgba(0,0,0,.12); border-radius:16px; padding:10px; background:#fff; }
    .name{ font-weight:950; font-size:14px; line-height:1.2; word-break:break-word; }
    .meta{ margin-top:6px; font:800 12px system-ui; opacity:.75; display:flex; flex-wrap:wrap; gap:8px; }
    .pill{ border:1px solid rgba(0,0,0,.12); border-radius:999px; padding:4px 8px; background:rgba(0,0,0,.03); }
  `;
  document.head.appendChild(css);

  root.innerHTML = `
    <div id="cgd-app">
      <div class="top">
        <div class="ttl">
          <img class="logo" alt="CGD" src="${esc(CFG.LOGO_URL)}" />
          <div>${esc(CFG.TITLE)}</div>
        </div>
        <div class="badge">${esc(BUILD)}</div>
      </div>

      <div class="grid" id="list">
        <div class="badge">Carregando leads…</div>
      </div>
    </div>
  `;

  async function refresh() {
    setSent("Atualizando… ✅ " + BUILD);
    const leads = await listLeads({ STATUS_ID: CFG.LEAD_STATUS.NEW }, 120);

    const box = document.getElementById("list");
    if (!box) return;

    if (!leads.length) {
      box.innerHTML = `<div class="card"><div class="name">Sem novos leads</div><div class="meta">${esc(fmtDT(new Date().toISOString()))}</div></div>`;
      return;
    }

    box.innerHTML = leads
      .map((l) => {
        const name = renderClientName(l);
        const op = l[CFG.UF_OPERADORA] || "-";
        const dt = l[CFG.UF_DT_LEAD] || l.DATE_CREATE || l.DATE_MODIFY || "";
        const idade = l[CFG.UF_IDADE] || "-";
        const fonte = l[CFG.UF_FONTE] || "-";
        const bairro = l[CFG.UF_BAIRRO] || "-";

        return `
          <div class="card">
            <div class="name">${esc(name)}</div>
            <div class="meta">
              <span class="pill">OP: ${esc(op)}</span>
              <span class="pill">DT: ${esc(fmtDT(dt))}</span>
              <span class="pill">IDADE: ${esc(idade)}</span>
              <span class="pill">FONTE: ${esc(fonte)}</span>
              <span class="pill">BAIRRO: ${esc(bairro)}</span>
              <span class="pill">ID: ${esc(l.ID)}</span>
            </div>
          </div>
        `;
      })
      .join("");

    setSent("OK ✅ " + BUILD + " • novos=" + leads.length);
  }

  refresh();
  setInterval(() => refresh().catch(showFatal), CFG.REFRESH_MS);

})();
