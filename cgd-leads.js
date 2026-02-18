/*! cgd-leads.js — Painel de Leads CGD (externo, GitHub Pages friendly) */
(function () {
  "use strict";

  /* =============================
   * 0) CONFIG
   * ============================= */

  const CFG = {
    // ✅ Webhook REST (sem barra no final)
    WEBHOOK_BASE: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb",

    // ✅ UFs (Leads)
    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD: "UF_CRM_1771333014", // Data/Hora do Lead
    UF_IDADE: "UF_CRM_1771339221", // Idade (texto)
    UF_BAIRRO: "UF_CRM_LEAD_1731909705398",
    UF_FONTE: "UF_CRM_1767285733843",

    // ✅ Campo de OBS do Lead (padrão do Bitrix)
    LEAD_COMMENTS_FIELD: "COMMENTS",

    // ✅ STATUS_ID do funil de LEADS (ENTITY_ID = STATUS)
    LEAD_STATUS: {
      NEW: "NEW", // NOVO LEAD
      IN_PROCESS: "IN_PROCESS", // Em atendimento
      QUALIFIED: "UC_0NFA3H", // Qualificado
      LOST: "UC_5IMTI4", // Perdido
      WON: "UC_B3RQAF", // Convertido (custom)
      JUNK: "JUNK", // Lead descartado (system)
    },

    // ✅ Usuárias (fila + KPI + modais)
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

    // ✅ Pipeline 17 (FOLLOW-UP) — Negócios (CATEGORY_ID = 17)
    PIPE17: {
      CATEGORY_ID: 17,
      // colunas (stages) por usuária (STATUS_ID)
      STAGE_BY_USER: {
        813: "C17:PREPARATION", // MANUELA
        841: "C17:PREPAYMENT_INVOIC", // MARIA CLARA
        3387: "C17:UC_RXISLQ", // BEATRIZ
        3081: "C17:EXECUTING", // BRUNA LUISA
        3079: "C17:UC_P1P9RJ", // LIVIA
        3083: "C17:UC_8O5UFO", // FERNANDA
        3085: "C17:UC_U8AAGB", // NICOLLE
        3389: "C17:UC_A6LSS8", // ANNA CLARA
        15: "C17:UC_FQ8UPI", // ALINE
        19: "C17:UC_1HXNTB", // ADRIANA
        17: "C17:UC_RRQKAQ", // ANDREYNA
        811: "C17:UC_8Y4R4V", // JOSIANE
        23: "C17:UC_4HQGI1", // MARIANA
        815: "C17:UC_ZT6WEB", // GABRIEL
      },

      // UFs (Negócio) usados no FOLLOW-UP (você passou)
      UF_OBS: "UF_CRM_691385BE7D33D", // onde vai o bloco com dados do lead
      UF_PRAZO: "UF_CRM_1768175087",
      // os abaixo você pediu como auto preenchidos/ocultos.
      UF_URGENCIA: "UF_CRM_1768174982",
      UF_ETAPA_TAREFA: "UF_CRM_1768179977089",
      UF_COLAB: "UF_CRM_1770327799",

      // Valores a setar (se o seu Bitrix usar IDs numéricos, troque aqui)
      FIXED: {
        URGENCIA: "NORMAL",
        ETAPA: "AGUARDANDO",
        TIPO_TAREFA_TEXTO: "FOLLOW-UP",
      },
    },

    // ✅ Pipeline 0 (CONVERTIDOS) — Negócios Saúde
    PIPE0: {
      CATEGORY_ID: 0,
      UF_OPERADORA_FECHADA: "UF_CRM_1771388467",
      UF_DATA_FECHAMENTO: "UF_CRM_1731899421651",
      STAGES: [
        { id: "UC_32TLQM", name: "Negociação Quente" },
        { id: "NEW", name: "Aguardando documentos" },
        { id: "PREPARATION", name: "Em digitação de proposta" },
        { id: "PREPAYMENT_INVOICE", name: "Enviado para assinatura" },
        { id: "EXECUTING", name: "Aguardando entrevista médica" },
        { id: "FINAL_INVOICE", name: "Em análise" },
        { id: "UC_SGV5YD", name: "Pendência" },
        { id: "UC_9WOK6Y", name: "Aguardando pagamento" },
        { id: "WON", name: "Negócios Fechados" },
      ],
      // Etapas que exigem campos
      NEEDS_MONEY_FROM: new Set([
        "PREPARATION",
        "PREPAYMENT_INVOICE",
        "EXECUTING",
        "FINAL_INVOICE",
        "UC_SGV5YD",
        "UC_9WOK6Y",
        "WON",
      ]),
    },

    // ✅ Refresh
    REFRESH_MS: 120000, // 2 min

    // ✅ UI
    TITLE: "PAINEL DE LEADS - CGD CORRETORA",

    // ✅ Links GET (topo)
    GET_LINKS: [
      { label: "EQUIPE DELTA", url: "https://getcgdcorretora.bitrix24.site/equipedelta/" },
      { label: "EQUIPE ALPHA", url: "https://getcgdcorretora.bitrix24.site/equipealpha/" },
      { label: "EQUIPE BETA", url: "https://getcgdcorretora.bitrix24.site/equipebeta/" },
    ],
  };

  /* =============================
   * 1) ROOT + SENTINEL
   * ============================= */

  const ROOT_ID = "cgd-leads-root";
  const SENT_ID = "cgd-sentinel";

  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.appendChild(root);
  }

  let sentinel = document.getElementById(SENT_ID);
  function setSent(msg) {
    try {
      if (sentinel) sentinel.textContent = msg;
    } catch (_) {}
  }

  /* =============================
   * 2) HELPERS
   * ============================= */

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
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(
      d.getHours()
    )}:${pad2(d.getMinutes())}`;
  }

  function nowKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function getUserNameById(id) {
    const u = CFG.USERS.find((x) => Number(x.id) === Number(id));
    return u ? u.name : `ID ${id}`;
  }

  function stageLeadName(statusId) {
    const map = CFG.LEAD_STATUS;
    if (statusId === map.NEW) return "NOVO LEAD";
    if (statusId === map.IN_PROCESS) return "EM ATENDIMENTO";
    if (statusId === map.QUALIFIED) return "QUALIFICADO";
    if (statusId === map.LOST) return "PERDIDO";
    if (statusId === map.WON) return "CONVERTIDO";
    if (statusId === map.JUNK) return "DESCARTADO";
    return statusId;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* =============================
   * 3) BITRIX REST (via webhook)
   * ============================= */

  async function bx(method, params) {
    const url = `${CFG.WEBHOOK_BASE}/${method}.json`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params || {}),
      credentials: "omit",
    });

    const txt = await res.text();
    let data;
    try {
      data = JSON.parse(txt);
    } catch (e) {
      throw new Error(`Resposta inválida (${res.status}): ${txt.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${data?.error_description || data?.error || txt}`);
    }
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
    return data.result;
  }

  async function listLeads(filter, select, order, limit = 50) {
    let start = 0;
    const out = [];
    while (out.length < limit) {
      const batch = await bx("crm.lead.list", {
        order: order || { DATE_MODIFY: "DESC" },
        filter: filter || {},
        select:
          select ||
          [
            "ID",
            "TITLE",
            "STATUS_ID",
            "ASSIGNED_BY_ID",
            "DATE_CREATE",
            "DATE_MODIFY",
            "NAME",
            "LAST_NAME",
            "PHONE",
            "EMAIL",
            CFG.UF_OPERADORA,
            CFG.UF_DT_LEAD,
            CFG.UF_IDADE,
            CFG.UF_FONTE,
            CFG.UF_BAIRRO,
            CFG.LEAD_COMMENTS_FIELD,
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

  async function getLead(id) {
    return await bx("crm.lead.get", { id: Number(id) });
  }

  async function updateLead(id, fields) {
    return await bx("crm.lead.update", { id: Number(id), fields });
  }

  async function addLeadProductTag(leadId, tagText) {
    const lead = await getLead(leadId);
    const prev = String(lead[CFG.LEAD_COMMENTS_FIELD] || "");
    const stamp = fmtDT(new Date().toISOString());
    const add = `\n\n[TAG] ${tagText} • ${stamp}`;
    await updateLead(leadId, { [CFG.LEAD_COMMENTS_FIELD]: prev + add });
  }

  async function createDeal(fields) {
    return await bx("crm.deal.add", { fields });
  }

  async function updateDeal(id, fields) {
    return await bx("crm.deal.update", { id: Number(id), fields });
  }

  async function listDeals(categoryId, limit = 120, extraFilter = {}) {
    let start = 0;
    const out = [];
    while (out.length < limit) {
      const batch = await bx("crm.deal.list", {
        order: { DATE_MODIFY: "DESC" },
        filter: { CATEGORY_ID: Number(categoryId), ...extraFilter },
        select: [
          "ID",
          "TITLE",
          "STAGE_ID",
          "CATEGORY_ID",
          "ASSIGNED_BY_ID",
          "OPPORTUNITY",
          "CURRENCY_ID",
          "DATE_MODIFY",
          CFG.PIPE0.UF_OPERADORA_FECHADA,
          CFG.PIPE0.UF_DATA_FECHAMENTO,
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

  /* =============================
   * 4) STATE (fila + preferências)
   * ============================= */

  const LS = {
    QUEUE: "cgd_leads_queue_v1",
    HIDDEN_USERS: "cgd_leads_hidden_users_v1",
    AVAIL_USERS: "cgd_leads_avail_users_v1",
    SILENT: "cgd_leads_silent_v1",
  };

  function readJSON(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      if (!v) return fallback;
      return JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  function writeJSON(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (_) {}
  }

  let queue = readJSON(LS.QUEUE, []); // [userId...]
  let hiddenUsers = new Set(readJSON(LS.HIDDEN_USERS, [])); // userId
  let availUsers = new Set(readJSON(LS.AVAIL_USERS, CFG.USERS.map((u) => u.id))); // default tudo disponível
  let isSilent = !!readJSON(LS.SILENT, false);

  const today = nowKey();
  let dailyStats = {
    day: today,
    byUser: {},
  };

  function resetDailyIfNeeded() {
    const k = nowKey();
    if (dailyStats.day !== k) {
      dailyStats = { day: k, byUser: {} };
    }
  }

  function statUser(id) {
    resetDailyIfNeeded();
    const key = String(id);
    if (!dailyStats.byUser[key]) dailyStats.byUser[key] = { pulled: 0, last2: [] };
    return dailyStats.byUser[key];
  }

  function setQueue(newQ) {
    queue = newQ.slice();
    writeJSON(LS.QUEUE, queue);
  }

  function setHiddenUsers(set) {
    hiddenUsers = new Set(set);
    writeJSON(LS.HIDDEN_USERS, Array.from(hiddenUsers));
  }

  function setAvailUsers(set) {
    availUsers = new Set(set);
    writeJSON(LS.AVAIL_USERS, Array.from(availUsers));
  }

  function setSilent(v) {
    isSilent = !!v;
    writeJSON(LS.SILENT, isSilent);
  }

  function ensureQueueValid() {
    const allowed = new Set(Array.from(availUsers).map(Number));
    const q = queue.filter((id) => allowed.has(Number(id)));
    const seen = new Set();
    const out = [];
    for (const id of q) {
      const n = Number(id);
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    setQueue(out);
  }

  /* =============================
   * 5) UI (CSS)
   * ============================= */

  const style = document.createElement("style");
  style.textContent = `
#cgd-app{
  --bg:#f6f7fb;
  --card:#fff;
  --border: rgba(20,30,60,.12);
  --text:#0f172a;
  --muted: rgba(15,23,42,.65);
  --radius: 16px;
  --shadow: 0 10px 30px rgba(2,6,23,.08);

  min-height:100vh;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
}

#cgd-top{
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,.9);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
  display:flex;
  gap:10px;
  align-items:center;
  justify-content:space-between;
}

#cgd-title{
  font-weight: 950;
  letter-spacing:.2px;
  display:flex;
  align-items:center;
  gap:10px;
}
#cgd-title .dot{
  width:10px;height:10px;border-radius:999px;background:#111827;
}

#cgd-top .right{
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
}
.btn{
  border:1px solid var(--border);
  background: #fff;
  color: var(--text);
  padding: 8px 12px;
  border-radius: 12px;
  font-weight: 800;
  cursor:pointer;
}
.btn:hover{ box-shadow: 0 8px 18px rgba(2,6,23,.08); transform: translateY(-1px); }
.btn:active{ transform: translateY(0px); }
.btn.primary{
  background: #e8f0ff;
  border-color: rgba(59,130,246,.35);
}
.btn.danger{
  background: #ffecec;
  border-color: rgba(239,68,68,.35);
}
.btn.small{ padding:6px 10px; border-radius:10px; font-weight:900; font-size:12px; }

.badge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(2,6,23,.05);
  border:1px solid var(--border);
  font-weight: 900;
  font-size: 12px;
}

#cgd-wrap{
  display:grid;
  grid-template-columns: 35% 65%;
  gap: 12px;
  padding: 12px;
}

.panel{
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow:hidden;
}
.p-hdr{
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:10px;
}
.p-hdr > div:first-child{ flex:1; min-width:0; }
.p-hdr .h{
  font-weight: 950;
}
.p-hdr .sub{
  font-size: 12px;
  color: var(--muted);
  font-weight: 800;
  line-height: 1.25;
}
.p-body{ padding: 12px; }

.leadCard{
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 10px;
  background: #fff;
  display:flex;
  flex-direction:column;
  gap:8px;
  margin-bottom: 10px;
}
.leadTop{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
}
.leadName{ font-weight: 950; }
.pills{ display:flex; gap:6px; flex-wrap:wrap; }
.pill{
  font-size: 11px;
  font-weight: 950;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 8px;
  color: rgba(15,23,42,.9);
  background: rgba(2,6,23,.03);
}
.ctaRow{
  display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end;
}
.sel{
  border:1px solid var(--border);
  border-radius: 12px;
  padding: 8px 10px;
  font-weight: 900;
  background:#fff;
}

.small{ font-size: 12px; color: var(--muted); font-weight: 800; }
.muted{ color: var(--muted); }

.alertBox{
  border: 2px solid rgba(236,72,153,.25);
  background: rgba(236,72,153,.08);
  padding: 10px;
  border-radius: 14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:10px;
}
.alertBox .a{
  font-weight: 950;
}
.alertBox .b{
  font-size: 12px;
  font-weight: 900;
  color: rgba(15,23,42,.75);
}

#userGrid{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.userCard{
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 10px;
  background: #fff;
}
.userRow{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
}
.userName{ font-weight: 950; }
.kpis{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.kpi{ font-size: 11px; font-weight: 950; border:1px solid var(--border); border-radius:999px; padding:4px 8px; background: rgba(2,6,23,.03); }

.miniLead{
  border-top: 1px dashed rgba(20,30,60,.18);
  margin-top: 8px;
  padding-top: 8px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.miniLine{
  font-size: 12px;
  font-weight: 900;
  color: rgba(15,23,42,.88);
}
.miniLine span{ color: var(--muted); font-weight: 900; }

#cgd-bottom{
  position: sticky;
  bottom: 0;
  z-index: 40;
  padding: 10px 12px;
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--border);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
}
.queueBox{
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
}
.queueTag{
  display:inline-flex; align-items:center; gap:8px;
  padding: 8px 10px; border:1px solid var(--border); border-radius: 14px;
  background: #fff;
  font-weight: 950;
}
.queueTag .mini{ font-size:11px; font-weight: 950; color: var(--muted); }

.modalBack{
  position:fixed; inset:0; background: rgba(2,6,23,.55);
  display:flex; align-items:center; justify-content:center;
  z-index: 1000;
}
.modal{
  width:min(980px, calc(100vw - 22px));
  max-height: calc(100vh - 22px);
  overflow:auto;
  background:#fff;
  border-radius: 18px;
  border:1px solid rgba(255,255,255,.18);
  box-shadow: 0 30px 80px rgba(2,6,23,.35);
}
.modalHdr{
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display:flex; align-items:center; justify-content:space-between; gap:10px;
}
.modalHdr .t{ font-weight: 950; }
.modalBody{ padding: 14px; }
.field{ display:flex; flex-direction:column; gap:6px; margin-bottom: 10px; }
.field label{ font-size: 12px; font-weight: 950; color: rgba(15,23,42,.85); }
.input{
  border:1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
}
.sep{ border:none; border-top:1px solid var(--border); margin: 12px 0; }
.row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.tableLike{ display:flex; flex-direction:column; gap:10px; }
.selLeadRow{
  border:1px solid var(--border); border-radius: 14px; padding:10px;
  display:flex; gap:10px; align-items:center; justify-content:space-between;
}
.selLeadRow .left{ flex:1; min-width: 240px; }
.selLeadRow .right{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

@media (max-width: 1024px){
  #cgd-wrap{ grid-template-columns: 1fr; }
  #userGrid{ grid-template-columns: 1fr; }
}
  `;
  document.head.appendChild(style);

  /* =============================
   * 6) MODAL
   * ============================= */

  function closeModal() {
    const b = document.getElementById("cgd-modal-back");
    if (b) b.remove();
  }

  function openModal(title, html) {
    closeModal();
    const back = document.createElement("div");
    back.className = "modalBack";
    back.id = "cgd-modal-back";
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modalHdr">
          <div class="t">${esc(title)}</div>
          <div class="row">
            <button class="btn" id="cgd-modal-close">Fechar</button>
          </div>
        </div>
        <div class="modalBody">${html}</div>
      </div>
    `;
    back.addEventListener("click", (e) => {
      if (e.target === back) closeModal();
    });
    document.body.appendChild(back);
    back.querySelector("#cgd-modal-close").onclick = closeModal;
  }

  /* =============================
   * 7) CORE ACTIONS
   * ============================= */

  async function doPickLead(leadId, userId) {
    await updateLead(leadId, {
      ASSIGNED_BY_ID: Number(userId),
      STATUS_ID: CFG.LEAD_STATUS.IN_PROCESS,
    });

    ensureQueueValid();
    const q = queue.filter((x) => Number(x) !== Number(userId));
    q.push(Number(userId));
    setQueue(q);

    const lead = await getLead(leadId);
    const name = renderClientName(lead);
    const op = String(lead[CFG.UF_OPERADORA] || "-");
    const dt = String(lead[CFG.UF_DT_LEAD] || lead.DATE_CREATE || lead.DATE_MODIFY || "");
    const st = statUser(userId);
    st.pulled += 1;
    st.last2.unshift({ name, op, dt });
    st.last2 = st.last2.slice(0, 2);

    return lead;
  }

  async function doMoveLead(leadId, toStatus) {
    await updateLead(leadId, { STATUS_ID: String(toStatus) });
  }

  async function doDiscardLead(leadId) {
    await updateLead(leadId, { STATUS_ID: CFG.LEAD_STATUS.JUNK });
  }

  function renderClientName(lead) {
    const n = [lead.NAME, lead.LAST_NAME].filter(Boolean).join(" ").trim();
    if (n) return n;
    if (lead.TITLE) return String(lead.TITLE);
    return `Lead ${lead.ID}`;
  }

  function leadLine(lead) {
    const name = renderClientName(lead);
    const op = lead[CFG.UF_OPERADORA] || "-";
    const dt = lead[CFG.UF_DT_LEAD] || lead.DATE_CREATE || lead.DATE_MODIFY || "-";
    const idade = lead[CFG.UF_IDADE] || "-";
    const fonte = lead[CFG.UF_FONTE] || "-";
    const bairro = lead[CFG.UF_BAIRRO] || "-";
    return { name, op, dt, idade, fonte, bairro };
  }

  function stageOptionsHTML(current) {
    const s = CFG.LEAD_STATUS;
    const opts = [
      { id: s.NEW, name: "NOVO LEAD" },
      { id: s.IN_PROCESS, name: "EM ATENDIMENTO" },
      { id: s.QUALIFIED, name: "QUALIFICADO" },
      { id: s.LOST, name: "PERDIDO" },
      { id: s.WON, name: "CONVERTIDO" },
      { id: s.JUNK, name: "DESCARTADO" },
    ];
    return opts
      .map(
        (o) =>
          `<option value="${esc(o.id)}" ${String(current) === String(o.id) ? "selected" : ""}>${esc(
            o.name
          )}</option>`
      )
      .join("");
  }

  function getFrontUser() {
    ensureQueueValid();
    if (!queue.length) return null;
    return Number(queue[0]);
  }

  function beep() {
    if (isSilent) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.06;
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close().catch(() => {});
      }, 140);
    } catch (_) {}
  }

  /* =============================
   * 8) MODAL “GERENCIAR USUÁRIA”
   * ============================= */

  let currentUserId = null;

  function openUserManager(userId) {
    currentUserId = Number(userId);

    openModal(`USUÁRIA • ${getUserNameById(currentUserId)}`, `
      <div class="row" style="justify-content:space-between">
        <div class="small muted">
          Aqui você controla os <b>LEADS EM ANDAMENTO</b> da usuária (exceto “PERDIDO”) e cria <b>FOLLOW-UP</b> na Pipeline 17.
        </div>
        <div class="row">
          <button class="btn" id="umReload">Atualizar</button>
        </div>
      </div>

      <div class="field">
        <label>Buscar lead por palavra (nome do cliente)</label>
        <input class="input" id="umSearch" placeholder="Ex.: Maria, João, Carlos..." />
      </div>

      <div class="row" style="justify-content:space-between">
        <div class="badge" id="umCount">0 leads</div>
        <div class="row">
          <button class="btn primary" id="umBatchFollow">FOLLOW-UP em lote</button>
          <button class="btn" id="umConvertidos">CONVERTIDOS (Pipeline 0)</button>
        </div>
      </div>

      <hr class="sep" />

      <div id="umList" class="tableLike">
        <div class="small muted">Clique em “Atualizar”.</div>
      </div>

      <div class="small" id="umStatus"></div>
    `);

    const elReload = document.getElementById("umReload");
    const elSearch = document.getElementById("umSearch");
    const elList = document.getElementById("umList");
    const elCount = document.getElementById("umCount");
    const elStatus = document.getElementById("umStatus");

    let leads = [];

    async function load() {
      elStatus.textContent = "Carregando…";

      leads = await listLeads(
        {
          ASSIGNED_BY_ID: currentUserId,
          "!STATUS_ID": CFG.LEAD_STATUS.LOST,
          "!=STATUS_ID": CFG.LEAD_STATUS.JUNK,
        },
        null,
        { DATE_MODIFY: "DESC" },
        120
      );

      elStatus.textContent = `OK • ${leads.length} leads`;
      render();
    }

    function render() {
      const q = String(elSearch.value || "").trim().toLowerCase();
      const filtered = leads.filter((l) => renderClientName(l).toLowerCase().includes(q));

      elCount.textContent = `${filtered.length} leads`;

      elList.innerHTML =
        filtered
          .map((l) => {
            const L = leadLine(l);
            return `
            <div class="selLeadRow">
              <div class="left">
                <div style="font-weight:950">${esc(L.name)}</div>
                <div class="small muted">
                  Operadora: <b>${esc(L.op)}</b> • Data/Hora: <b>${esc(fmtDT(L.dt))}</b> • Status: <b>${esc(stageLeadName(l.STATUS_ID))}</b>
                  • ID ${esc(l.ID)}
                </div>
              </div>
              <div class="right">
                <button class="btn primary" data-q="${esc(l.ID)}">QUALIFICAR + TAG</button>
                <button class="btn danger" data-p="${esc(l.ID)}">PERDIDO</button>
                <button class="btn" data-c="${esc(l.ID)}">CONVERTIDO</button>
                <button class="btn" data-f="${esc(l.ID)}">FOLLOW-UP</button>
              </div>
            </div>
          `;
          })
          .join("") || `<div class="small muted">Nenhum lead para mostrar.</div>`;

      elList.querySelectorAll("button[data-q]").forEach((b) => {
        b.onclick = async () => {
          const id = Number(b.dataset.q);
          const tag = prompt("TAG a registrar no lead (ex.: QUALIFICADO)", "QUALIFICADO");
          if (tag === null) return;
          elStatus.textContent = "Qualificando…";
          await doMoveLead(id, CFG.LEAD_STATUS.QUALIFIED);
          await addLeadProductTag(id, String(tag || "QUALIFICADO"));
          await load();
        };
      });

      elList.querySelectorAll("button[data-p]").forEach((b) => {
        b.onclick = async () => {
          const id = Number(b.dataset.p);
          if (!confirm("Mover este lead para PERDIDO? Ele sairá do controle da usuária.")) return;
          elStatus.textContent = "Movendo para PERDIDO…";
          await doMoveLead(id, CFG.LEAD_STATUS.LOST);
          await load();
        };
      });

      elList.querySelectorAll("button[data-c]").forEach((b) => {
        b.onclick = async () => {
          const id = Number(b.dataset.c);
          if (!confirm("Mover este lead para CONVERTIDO?")) return;
          elStatus.textContent = "Movendo para CONVERTIDO…";
          await doMoveLead(id, CFG.LEAD_STATUS.WON);
          await load();
        };
      });

      elList.querySelectorAll("button[data-f]").forEach((b) => {
        b.onclick = async () => {
          const id = Number(b.dataset.f);
          await openFollowUpSingle(id, currentUserId);
        };
      });
    }

    elReload.onclick = load;
    elSearch.oninput = render;

    document.getElementById("umBatchFollow").onclick = () => openFollowUpBatch(currentUserId, leads);
    document.getElementById("umConvertidos").onclick = () => openConvertidos(currentUserId);

    load().catch((e) => (elStatus.textContent = `Erro: ${String(e.message || e)}`));
  }

  async function openFollowUpSingle(leadId, userId) {
    const lead = await getLead(leadId);
    const L = leadLine(lead);

    openModal(`FOLLOW-UP • ${getUserNameById(userId)}`, `
      <div class="small muted">
        Será criado um <b>NEGÓCIO</b> na Pipeline 17 na coluna da usuária, com os dados do lead em OBS.
      </div>

      <div class="field">
        <label>Nome do cliente</label>
        <input class="input" id="fuTitle" value="${esc(L.name)}" />
      </div>

      <div class="field">
        <label>Observação adicional (opcional)</label>
        <input class="input" id="fuExtra" placeholder="Digite aqui..." />
      </div>

      <div class="field">
        <label>Definir prazo (UF_CRM_1768175087)</label>
        <input class="input" id="fuPrazo" placeholder="YYYY-MM-DD ou data/hora do seu padrão" />
        <div class="small muted">Se o seu campo for data/hora, você pode usar: YYYY-MM-DD HH:MM</div>
      </div>

      <div class="row">
        <button class="btn primary" id="fuGo">Criar FOLLOW-UP</button>
      </div>

      <div class="small" id="fuStatus"></div>
    `);

    document.getElementById("fuGo").onclick = async () => {
      const st = document.getElementById("fuStatus");
      try {
        st.textContent = "Criando…";

        const title = String(document.getElementById("fuTitle").value || "").trim() || L.name;
        const extra = String(document.getElementById("fuExtra").value || "").trim();
        const prazo = String(document.getElementById("fuPrazo").value || "").trim();

        const obsBlock =
          `CLIENTE: ${L.name}\n` +
          `OPERADORA: ${L.op}\n` +
          `DATA/HORA: ${fmtDT(L.dt)}\n` +
          `IDADE: ${L.idade}\n` +
          `FONTE: ${L.fonte}\n` +
          `BAIRRO: ${L.bairro}\n` +
          `LEAD ID: ${lead.ID}\n` +
          (extra ? `\nOBS EXTRA: ${extra}\n` : "");

        const stage = CFG.PIPE17.STAGE_BY_USER[userId] || "C17:NEW";

        const fields = {
          TITLE: `${CFG.PIPE17.FIXED.TIPO_TAREFA_TEXTO} • ${title}`,
          CATEGORY_ID: CFG.PIPE17.CATEGORY_ID,
          STAGE_ID: stage,
          ASSIGNED_BY_ID: Number(userId),
          [CFG.PIPE17.UF_OBS]: obsBlock,
        };

        if (prazo) fields[CFG.PIPE17.UF_PRAZO] = prazo;
        if (CFG.PIPE17.UF_URGENCIA) fields[CFG.PIPE17.UF_URGENCIA] = CFG.PIPE17.FIXED.URGENCIA;
        if (CFG.PIPE17.UF_ETAPA_TAREFA) fields[CFG.PIPE17.UF_ETAPA_TAREFA] = CFG.PIPE17.FIXED.ETAPA;
        if (CFG.PIPE17.UF_COLAB) fields[CFG.PIPE17.UF_COLAB] = "";

        await createDeal(fields);

        st.textContent = "OK ✅ FOLLOW-UP criado na Pipeline 17.";
      } catch (e) {
        document.getElementById("fuStatus").textContent = `Erro: ${String(e.message || e)}`;
      }
    };
  }

  function openFollowUpBatch(userId, leadsInMemory) {
    openModal(`FOLLOW-UP EM LOTE • ${getUserNameById(userId)}`, `
      <div class="small muted">
        Selecione leads (da lista atual da usuária), defina data/hora e opcionalmente intervalo.
      </div>

      <div class="field">
        <label>Buscar lead (na lista)</label>
        <input class="input" id="fbSearch" placeholder="Digite..." />
      </div>

      <div class="field">
        <label>Prazo (UF_CRM_1768175087) base</label>
        <input class="input" id="fbPrazo" placeholder="YYYY-MM-DD HH:MM" />
      </div>

      <div class="field">
        <label>Intervalo entre criações (minutos)</label>
        <select class="sel" id="fbStep">
          <option value="0">Sem intervalo</option>
          <option value="5">5 em 5 min</option>
          <option value="10">10 em 10 min</option>
        </select>
      </div>

      <div class="row">
        <button class="btn primary" id="fbGo">Criar FOLLOW-UP para selecionados</button>
      </div>

      <hr class="sep" />

      <div id="fbList" class="tableLike"></div>
      <div class="small" id="fbStatus"></div>
    `);

    const elSearch = document.getElementById("fbSearch");
    const elList = document.getElementById("fbList");
    const elStatus = document.getElementById("fbStatus");

    let chosen = new Set();

    function render() {
      const q = String(elSearch.value || "").trim().toLowerCase();
      const items = (leadsInMemory || []).filter((l) => renderClientName(l).toLowerCase().includes(q));

      elList.innerHTML =
        items
          .map((l) => {
            const L = leadLine(l);
            const checked = chosen.has(Number(l.ID)) ? "checked" : "";
            return `
            <div class="selLeadRow">
              <div class="left">
                <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer">
                  <input type="checkbox" data-chk="${esc(l.ID)}" ${checked} />
                  <div>
                    <div style="font-weight:950">${esc(L.name)}</div>
                    <div class="small muted">Operadora: <b>${esc(L.op)}</b> • Data/Hora: <b>${esc(fmtDT(L.dt))}</b> • ID ${esc(l.ID)}</div>
                  </div>
                </label>
              </div>
            </div>
          `;
          })
          .join("") || `<div class="small muted">Nenhum lead.</div>`;

      elList.querySelectorAll("input[data-chk]").forEach((i) => {
        i.onchange = () => {
          const id = Number(i.dataset.chk);
          if (i.checked) chosen.add(id);
          else chosen.delete(id);
        };
      });
    }

    render();
    elSearch.oninput = render;

    document.getElementById("fbGo").onclick = async () => {
      try {
        const prazoBase = String(document.getElementById("fbPrazo").value || "").trim();
        if (!prazoBase) return (elStatus.textContent = "Preencha o prazo base (YYYY-MM-DD HH:MM).");

        const step = Number(document.getElementById("fbStep").value || 0);

        const ids = Array.from(chosen);
        if (!ids.length) return (elStatus.textContent = "Selecione ao menos 1 lead.");

        elStatus.textContent = `Criando ${ids.length} follow-ups…`;

        const base = new Date(prazoBase.replace(" ", "T"));
        const canParse = !isNaN(base.getTime());

        for (let idx = 0; idx < ids.length; idx++) {
          const lead = await getLead(ids[idx]);
          const L = leadLine(lead);

          let prazo = prazoBase;
          if (step && canParse) {
            const d = new Date(base.getTime() + idx * step * 60000);
            prazo = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
              d.getHours()
            )}:${pad2(d.getMinutes())}`;
          }

          const obsBlock =
            `CLIENTE: ${L.name}\n` +
            `OPERADORA: ${L.op}\n` +
            `DATA/HORA: ${fmtDT(L.dt)}\n` +
            `IDADE: ${L.idade}\n` +
            `FONTE: ${L.fonte}\n` +
            `BAIRRO: ${L.bairro}\n` +
            `LEAD ID: ${lead.ID}\n`;

          const stage = CFG.PIPE17.STAGE_BY_USER[userId] || "C17:NEW";

          const fields = {
            TITLE: `${CFG.PIPE17.FIXED.TIPO_TAREFA_TEXTO} • ${L.name}`,
            CATEGORY_ID: CFG.PIPE17.CATEGORY_ID,
            STAGE_ID: stage,
            ASSIGNED_BY_ID: Number(userId),
            [CFG.PIPE17.UF_OBS]: obsBlock,
            [CFG.PIPE17.UF_PRAZO]: prazo,
          };

          if (CFG.PIPE17.UF_URGENCIA) fields[CFG.PIPE17.UF_URGENCIA] = CFG.PIPE17.FIXED.URGENCIA;
          if (CFG.PIPE17.UF_ETAPA_TAREFA) fields[CFG.PIPE17.UF_ETAPA_TAREFA] = CFG.PIPE17.FIXED.ETAPA;
          if (CFG.PIPE17.UF_COLAB) fields[CFG.PIPE17.UF_COLAB] = "";

          await createDeal(fields);
          elStatus.textContent = `Criando… (${idx + 1}/${ids.length})`;
          await sleep(180);
        }

        elStatus.textContent = "OK ✅ Follow-ups criados.";
      } catch (e) {
        elStatus.textContent = `Erro: ${String(e.message || e)}`;
      }
    };
  }

  /* =============================
   * 9) CONVERTIDOS (Pipeline 0)
   * ============================= */

  function openConvertidos(userId /* opcional */) {
    const isPerUser = Number.isFinite(Number(userId));
    const userName = isPerUser ? getUserNameById(Number(userId)) : "GERAL";

    const stageName = (stageId) => {
      const hit = (CFG.PIPE0.STAGES || []).find((s) => s.id === stageId);
      return hit ? hit.name : stageId;
    };

    openModal(`CONVERTIDOS • PIPELINE 0 • ${userName}`, `
      <div class="small muted">
        ${
          isPerUser
            ? `Mostrando <b>NEGÓCIOS</b> da usuária <b>${esc(userName)}</b> na Pipeline 0 (exceto <b>Negócios Fechados</b>).`
            : `Mostrando <b>NEGÓCIOS</b> recentes da Pipeline 0 (exceto <b>Negócios Fechados</b>).`
        }
      </div>

      <div class="field">
        <label>Buscar (título)</label>
        <input class="input" id="cvSearch" placeholder="Digite..." />
      </div>

      <div class="field">
        <label>Mover para etapa</label>
        <select class="sel" id="cvStage">
          ${CFG.PIPE0.STAGES.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}
        </select>
        <div class="small muted">
          A partir de <b>Em digitação de proposta</b> pede Valor/Moeda e Operadora Fechada.
          Em <b>Negócios Fechados</b> pede Data de Fechamento (e o card some da lista).
        </div>
      </div>

      <div class="row">
        <button class="btn primary" id="cvLoad">Carregar negócios</button>
      </div>

      <hr class="sep" />

      <div id="cvList" class="tableLike"><div class="small muted">Clique em “Carregar negócios”.</div></div>
      <div class="small" id="cvStatus"></div>
    `);

    let deals = [];

    async function render() {
      const q = String(document.getElementById("cvSearch").value || "").trim().toLowerCase();
      const list = document.getElementById("cvList");
      const filtered = deals.filter((d) => String(d.TITLE || "").toLowerCase().includes(q));

      list.innerHTML =
        filtered
          .map(
            (d) => `
        <div class="selLeadRow">
          <div class="left">
            <div style="font-weight:950">${esc(d.TITLE || `Deal ${d.ID}`)}</div>
            <div class="small muted">
              Etapa: <b>${esc(stageName(d.STAGE_ID))}</b> • ID ${esc(d.ID)} • Resp: ${esc(getUserNameById(d.ASSIGNED_BY_ID))}
            </div>
            <div class="small muted">
              Valor: ${esc(d.OPPORTUNITY || "-")} ${esc(d.CURRENCY_ID || "")} • Última mod.: ${esc(fmtDT(d.DATE_MODIFY))}
            </div>
          </div>
          <div class="right">
            <button class="btn primary" data-move="${esc(d.ID)}">Mover</button>
          </div>
        </div>
      `
          )
          .join("") || `<div class="small muted">Nenhum negócio para mostrar.</div>`;

      list.querySelectorAll("button[data-move]").forEach((b) => {
        b.onclick = async () => {
          const id = Number(b.dataset.move);
          const toStage = String(document.getElementById("cvStage").value);
          const st = document.getElementById("cvStatus");

          try {
            const needsMoney = CFG.PIPE0.NEEDS_MONEY_FROM.has(toStage);
            const needsCloseDate = toStage === "WON";

            let val = null,
              cur = null,
              opFech = null,
              dtClose = null;

            if (needsMoney) {
              val = prompt("Valor (somente números). Cancelar = não move.", "");
              if (val === null) return;

              cur = prompt("Moeda (ex.: BRL). Cancelar = não move.", "BRL");
              if (cur === null) return;

              opFech = prompt("Operadora Fechada (texto). Cancelar = não move.", "");
              if (opFech === null) return;
            }

            if (needsCloseDate) {
              dtClose = prompt("Data de fechamento (YYYY-MM-DD). Cancelar = não move.", "");
              if (dtClose === null) return;
            }

            const fields = { STAGE_ID: toStage };

            if (needsMoney) {
              fields.OPPORTUNITY = String(val || "").replace(",", ".").trim();
              fields.CURRENCY_ID = String(cur || "BRL").trim();
              fields[CFG.PIPE0.UF_OPERADORA_FECHADA] = String(opFech || "").trim();
            }

            if (needsCloseDate) {
              fields[CFG.PIPE0.UF_DATA_FECHAMENTO] = String(dtClose || "").trim();
            }

            st.textContent = "Movendo…";
            await updateDeal(id, fields);

            st.textContent = "OK ✅ Recarregando…";

            const extraFilter = { "!STAGE_ID": "WON" };
            if (isPerUser) extraFilter.ASSIGNED_BY_ID = Number(userId);

            deals = await listDeals(CFG.PIPE0.CATEGORY_ID, 160, extraFilter);
            await render();

            st.textContent = "OK ✅";
          } catch (e) {
            st.textContent = `Erro: ${String(e.message || e)}`;
          }
        };
      });
    }

    document.getElementById("cvSearch").oninput = render;

    document.getElementById("cvLoad").onclick = async () => {
      const st = document.getElementById("cvStatus");
      try {
        st.textContent = "Carregando…";

        const extraFilter = { "!STAGE_ID": "WON" };
        if (isPerUser) extraFilter.ASSIGNED_BY_ID = Number(userId);

        deals = await listDeals(CFG.PIPE0.CATEGORY_ID, 160, extraFilter);
        st.textContent = `OK • ${deals.length} negócios`;
        await render();
      } catch (e) {
        st.textContent = `Erro: ${String(e.message || e)}`;
      }
    };
  }

  /* =============================
   * 10) FILA — modal disponível/indisponível
   * ============================= */

  function openQueueManager() {
    openModal("FILA • Disponibilidade", `
      <div class="small muted">
        Marque quem está <b>DISPONÍVEL</b>. Somente essas entram na fila.
        A fila roda em ordem e quem <b>PEGA</b> vai para o final automaticamente.
      </div>

      <hr class="sep"/>

      <div id="qmList" class="tableLike"></div>

      <hr class="sep"/>

      <div class="row">
        <button class="btn primary" id="qmSave">Salvar</button>
        <button class="btn" id="qmClear">Zerar fila</button>
      </div>

      <div class="small" id="qmStatus"></div>
    `);

    const box = document.getElementById("qmList");
    const status = document.getElementById("qmStatus");

    box.innerHTML = CFG.USERS.map((u) => {
      const chk = availUsers.has(Number(u.id)) ? "checked" : "";
      return `
        <div class="selLeadRow">
          <div class="left">
            <label style="display:flex; gap:10px; align-items:center; cursor:pointer">
              <input type="checkbox" data-av="${esc(u.id)}" ${chk}/>
              <div style="font-weight:950">${esc(u.name)} <span class="small muted">(${esc(u.id)})</span></div>
            </label>
          </div>
        </div>
      `;
    }).join("");

    document.getElementById("qmSave").onclick = () => {
      const set = new Set();
      box.querySelectorAll("input[data-av]").forEach((i) => {
        if (i.checked) set.add(Number(i.dataset.av));
      });
      setAvailUsers(set);
      ensureQueueValid();
      status.textContent = "OK ✅ Disponibilidade salva.";
      renderBottom();
      renderRightUsers();
    };

    document.getElementById("qmClear").onclick = () => {
      if (!confirm("Zerar a fila?")) return;
      setQueue([]);
      status.textContent = "Fila zerada ✅";
      renderBottom();
      renderRightUsers();
    };
  }

  /* =============================
   * 11) APP UI
   * ============================= */

  root.innerHTML = `
    <div id="cgd-app">
      <div id="cgd-top">
        <div id="cgd-title"><span class="dot"></span> <span>${esc(CFG.TITLE)}</span></div>
        <div class="right">
          <span class="badge" id="kpiDay">Leads do dia: 0</span>
          <span class="badge" id="kpiMonth">Leads do mês: 0</span>
          <button class="btn" id="btnGetLinks">GET (Equipes)</button>
          <button class="btn" id="btnUserManager">Gerenciar Usuária</button>
          <button class="btn" id="btnQueueMgr">Fila</button>
          <button class="btn" id="btnRefresh">Atualizar</button>
          <button class="btn" id="btnSilent">${isSilent ? "Som: OFF" : "Som: ON"}</button>
        </div>
      </div>

      <div id="cgd-wrap">
        <!-- LEFT -->
        <div class="panel">
          <div class="p-hdr">
            <div>
              <div class="h">NOVOS LEADS • PENDENTES</div>
              <div class="sub">Somente status: <b>NOVO LEAD</b></div>
            </div>
            <div class="row">
              <button class="btn primary" id="btnBatch">Transferir em lote</button>
              <button class="btn" id="btnLeftRefresh">Atualizar</button>
            </div>
          </div>
          <div class="p-body">
            <div class="alertBox" id="alertBox" style="display:none">
              <div>
                <div class="a">🎉 NOVO LEAD</div>
                <div class="b">Alerta sonoro + piscante (enquanto existir lead em “NOVO LEAD”).</div>
              </div>
              <button class="btn" id="btnSilenceAlert">Silenciar</button>
            </div>
            <div id="leadList"><div class="small muted">Carregando…</div></div>
          </div>
        </div>

        <!-- RIGHT -->
        <div class="panel">
          <div class="p-hdr">
            <div>
              <div class="h">QUEM PEGOU HOJE</div>
              <div class="sub">Cards por usuária (ordem: última que puxou → fila → fora da fila)</div>
            </div>
            <div class="row">
              <button class="btn" id="btnToggleHideUsers">Ocultar usuárias</button>
              <button class="btn" id="btnRightRefresh">Atualizar</button>
            </div>
          </div>
          <div class="p-body">
            <div id="userGrid"></div>
          </div>
        </div>
      </div>

      <div id="cgd-bottom">
        <div class="queueBox" id="queueBox"></div>
        <div class="row">
          <button class="btn" id="btnResetQueue">Resetar</button>
          <button class="btn primary" id="btnNextAvail">Próxima disponível</button>
        </div>
      </div>
    </div>
  `;

  if (sentinel) setSent("JS iniciou ✅");

  /* =============================
   * 12) EVENTS (delegation — Bitrix DOM-safe)
   * ============================= */

  function onDocClick(e) {
    const t = e.target;

    if (t.closest("#btnRefresh")) return refreshAll(true);
    if (t.closest("#btnLeftRefresh")) return refreshLeft(true);
    if (t.closest("#btnRightRefresh")) return refreshRight(true);

    if (t.closest("#btnSilent")) {
      setSilent(!isSilent);
      const b = document.getElementById("btnSilent");
      if (b) b.textContent = isSilent ? "Som: OFF" : "Som: ON";
      return;
    }

    if (t.closest("#btnSilenceAlert")) {
      setSilent(true);
      const b = document.getElementById("btnSilent");
      if (b) b.textContent = "Som: OFF";
      return;
    }

    if (t.closest("#btnQueueMgr")) return openQueueManager();

    if (t.closest("#btnGetLinks")) {
      openModal("GET • Equipes", `
        <div class="small muted">Abrir os painéis GET em nova aba.</div>
        <hr class="sep"/>
        <div class="tableLike">
          ${CFG.GET_LINKS.map(
            (x) => `
            <div class="selLeadRow">
              <div class="left">
                <div style="font-weight:950">${esc(x.label)}</div>
                <div class="small muted">${esc(x.url)}</div>
              </div>
              <div class="right">
                <a class="btn primary" href="${esc(x.url)}" target="_blank" rel="noopener">Abrir</a>
              </div>
            </div>
          `
          ).join("")}
        </div>
      `);
      return;
    }

    if (t.closest("#btnUserManager")) {
      openModal("Selecionar Usuária", `
        <div class="small muted">Escolha uma usuária para abrir o painel de ações (Item 8).</div>
        <hr class="sep"/>
        <div class="tableLike">
          ${CFG.USERS.map(
            (u) => `
            <div class="selLeadRow">
              <div class="left">
                <div style="font-weight:950">${esc(u.name)}</div>
                <div class="small muted">ID: ${esc(u.id)}</div>
              </div>
              <div class="right">
                <button class="btn primary" data-um="${esc(u.id)}">Abrir</button>
              </div>
            </div>
          `
          ).join("")}
        </div>
      `);
      return;
    }

    const umBtn = t.closest("button[data-um], button[data-openUm]");
    if (umBtn) return openUserManager(Number(umBtn.dataset.um || umBtn.dataset.openum));

    if (t.closest("#btnBatch")) return openBatchTransfer();
    if (t.closest("#btnToggleHideUsers")) return openHideUsers();

    if (t.closest("#btnResetQueue")) {
      if (!confirm("Resetar a fila?")) return;
      setQueue([]);
      renderBottom();
      renderRightUsers();
      return;
    }

    if (t.closest("#btnNextAvail")) {
      ensureQueueValid();
      if (!queue.length) {
        alert("Fila vazia. Abra FILA e marque usuárias disponíveis.");
        return;
      }
      const q = queue.slice();
      q.push(q.shift());
      setQueue(q);
      renderBottom();
      renderRightUsers();
      return;
    }
  }

  document.addEventListener("click", onDocClick, true);

  /* =============================
   * 13) HIDE USERS (cards do lado direito)
   * ============================= */

  function openHideUsers() {
    openModal("Ocultar usuárias (cards do lado direito)", `
      <div class="small muted">
        Marque para <b>ocultar</b> o card da usuária no painel da direita.
      </div>
      <hr class="sep"/>
      <div id="huList" class="tableLike"></div>
      <hr class="sep"/>
      <div class="row">
        <button class="btn primary" id="huSave">Salvar</button>
      </div>
    `);

    const box = document.getElementById("huList");
    box.innerHTML = CFG.USERS.map((u) => {
      const chk = hiddenUsers.has(Number(u.id)) ? "checked" : "";
      return `
        <div class="selLeadRow">
          <div class="left">
            <label style="display:flex; gap:10px; align-items:center; cursor:pointer">
              <input type="checkbox" data-hu="${esc(u.id)}" ${chk}/>
              <div style="font-weight:950">${esc(u.name)} <span class="small muted">(${esc(u.id)})</span></div>
            </label>
          </div>
        </div>
      `;
    }).join("");

    document.getElementById("huSave").onclick = () => {
      const set = new Set();
      box.querySelectorAll("input[data-hu]").forEach((i) => {
        if (i.checked) set.add(Number(i.dataset.hu));
      });
      setHiddenUsers(set);
      renderRightUsers();
      closeModal();
    };
  }

  /* =============================
   * 14) BATCH TRANSFER
   * ============================= */

  let cachedNewLeads = [];

  function openBatchTransfer() {
    if (!cachedNewLeads.length) {
      alert("Nenhum lead em NOVO LEAD para transferir.");
      return;
    }

    openModal("TRANSFERIR EM LOTE", `
      <div class="small muted">
        Selecione leads e escolha para quem transferir.
        <br/>Ao transferir: <b>ASSIGNED_BY_ID</b> muda e o lead vira <b>EM ATENDIMENTO</b>.
      </div>

      <hr class="sep"/>

      <div class="field">
        <label>Transferir para usuária</label>
        <select class="sel" id="btUser">
          ${CFG.USERS.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("")}
        </select>
      </div>

      <div class="row">
        <button class="btn primary" id="btGo">Transferir selecionados</button>
      </div>

      <hr class="sep"/>

      <div id="btList" class="tableLike"></div>
      <div class="small" id="btStatus"></div>
    `);

    const box = document.getElementById("btList");
    const status = document.getElementById("btStatus");
    let chosen = new Set();

    box.innerHTML = cachedNewLeads
      .map((l) => {
        const L = leadLine(l);
        return `
        <div class="selLeadRow">
          <div class="left">
            <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer">
              <input type="checkbox" data-bt="${esc(l.ID)}" />
              <div>
                <div style="font-weight:950">${esc(L.name)}</div>
                <div class="small
