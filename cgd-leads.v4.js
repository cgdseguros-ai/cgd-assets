/*! cgd-leads.v4.js — Painel de Leads CGD (GitHub/Bitrix friendly) */
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

      UF_OBS: "UF_CRM_691385BE7D33D",
      UF_PRAZO: "UF_CRM_1768175087",
      UF_URGENCIA: "UF_CRM_1768174982",
      UF_ETAPA_TAREFA: "UF_CRM_1768179977089",
      UF_COLAB: "UF_CRM_1770327799",

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

    // ✅ Fila persistida no Bitrix (Pipeline 27)
    QUEUE_STORE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO", // QUEUE_JSON
      UF_QUEUE_JSON: "UF_CRM_1771293519",
      DEAL_TITLE: "QUEUE_JSON",
    },

    // ✅ UI
    TITLE: "PAINEL DE LEADS - CGD CORRETORA",
    LOGO_URL:
      "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=e6lxlp1bz9nz",

    GET_LINKS: [
      { label: "EQUIPE DELTA", url: "https://getcgdcorretora.bitrix24.site/equipedelta/" },
      { label: "EQUIPE ALPHA", url: "https://getcgdcorretora.bitrix24.site/equipealpha/" },
      { label: "EQUIPE BETA", url: "https://getcgdcorretora.bitrix24.site/equipebeta/" },
    ],

    // ✅ Atualização mais rápida (10s)
    REFRESH_MS: 10000,
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
    (document.body || document.documentElement).appendChild(root);
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

  function toBRDateTimeLocalValue(isoOrAny) {
    // retorna "YYYY-MM-DDTHH:MM" (para <input type="datetime-local">)
    if (!isoOrAny) return "";
    const d = new Date(isoOrAny);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
      d.getHours()
    )}:${pad2(d.getMinutes())}`;
  }

  function toBitrixDateTimeFromLocal(localValue) {
    // localValue: "YYYY-MM-DDTHH:MM"
    if (!localValue) return "";
    const m = String(localValue).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return "";
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:00`;
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
      cache: "no-store",
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
          CFG.QUEUE_STORE.UF_QUEUE_JSON,
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
   * 4) STATE (SEM localStorage)
   *  - fila persiste no Bitrix (QUEUE_JSON)
   *  - stats são por sessão (memória)
   * ============================= */

  let queue = []; // ordem da fila
  let availUsers = new Set(CFG.USERS.map((u) => Number(u.id))); // disponíveis
  let hiddenUsers = new Set(); // cards ocultos
  let isSilent = false;

  const todayKey = nowKey();
  let dailyStats = { day: todayKey, byUser: {} };

  function resetDailyIfNeeded() {
    const k = nowKey();
    if (dailyStats.day !== k) dailyStats = { day: k, byUser: {} };
  }

  function statUser(id) {
    resetDailyIfNeeded();
    const key = String(id);
    if (!dailyStats.byUser[key]) dailyStats.byUser[key] = { pulled: 0, last2: [] };
    return dailyStats.byUser[key];
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
    queue = out;
  }

  /* ====== QUEUE_JSON (Pipeline 27) ====== */

  let queueDealId = null;

  async function ensureQueueDeal() {
    if (queueDealId) return queueDealId;

    // busca um deal na categoria 27 com STAGE_ID da coluna QUEUE_JSON e título QUEUE_JSON
    const deals = await listDeals(CFG.QUEUE_STORE.CATEGORY_ID, 40, {
      STAGE_ID: CFG.QUEUE_STORE.STAGE_ID,
    });

    const found =
      (deals || []).find((d) => String(d.TITLE || "").trim().toUpperCase() === CFG.QUEUE_STORE.DEAL_TITLE) ||
      (deals || [])[0];

    if (found && found.ID) {
      queueDealId = Number(found.ID);
      return queueDealId;
    }

    // cria
    const id = await createDeal({
      TITLE: CFG.QUEUE_STORE.DEAL_TITLE,
      CATEGORY_ID: CFG.QUEUE_STORE.CATEGORY_ID,
      STAGE_ID: CFG.QUEUE_STORE.STAGE_ID,
      [CFG.QUEUE_STORE.UF_QUEUE_JSON]: JSON.stringify({
        v: 1,
        queue: [],
        avail: CFG.USERS.map((u) => Number(u.id)),
        hidden: [],
        updatedAt: new Date().toISOString(),
      }),
    });

    queueDealId = Number(id);
    return queueDealId;
  }

  async function loadQueueFromBitrix() {
    try {
      const id = await ensureQueueDeal();
      const d = (await bx("crm.deal.get", { id })) || {};
      const raw = d[CFG.QUEUE_STORE.UF_QUEUE_JSON];
      let obj = null;
      try {
        obj = raw ? JSON.parse(String(raw)) : null;
      } catch (_) {
        obj = null;
      }

      if (obj && typeof obj === "object") {
        const q = Array.isArray(obj.queue) ? obj.queue.map(Number) : [];
        const av = Array.isArray(obj.avail) ? obj.avail.map(Number) : CFG.USERS.map((u) => Number(u.id));
        const hid = Array.isArray(obj.hidden) ? obj.hidden.map(Number) : [];
        queue = q;
        availUsers = new Set(av);
        hiddenUsers = new Set(hid);
      } else {
        queue = [];
        availUsers = new Set(CFG.USERS.map((u) => Number(u.id)));
        hiddenUsers = new Set();
      }

      ensureQueueValid();
    } catch (e) {
      console.warn("Falha ao carregar QUEUE_JSON:", e);
      // fallback: tudo disponível, fila vazia
      queue = [];
      availUsers = new Set(CFG.USERS.map((u) => Number(u.id)));
      hiddenUsers = new Set();
    }
  }

  async function saveQueueToBitrix() {
    try {
      const id = await ensureQueueDeal();
      const payload = {
        v: 1,
        queue: queue.slice(),
        avail: Array.from(availUsers),
        hidden: Array.from(hiddenUsers),
        updatedAt: new Date().toISOString(),
      };
      await updateDeal(id, {
        STAGE_ID: CFG.QUEUE_STORE.STAGE_ID,
        [CFG.QUEUE_STORE.UF_QUEUE_JSON]: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn("Falha ao salvar QUEUE_JSON:", e);
    }
  }

  /* =============================
   * 5) UI (CSS)
   * ============================= */

  const style = document.createElement("style");
  style.textContent = `
#cgd-app, #cgd-app *{ box-sizing: border-box; }

#cgd-app{
  --bg:#f6f7fb;
  --card:#fff;
  --border: rgba(20,30,60,.12);
  --text:#0f172a;
  --muted: rgba(15,23,42,.65);
  --radius: 18px;
  --shadow: 0 14px 34px rgba(2,6,23,.10);

  width:100%;
  min-height:100vh;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;

  display:flex;
  flex-direction:column;
}

#cgd-top{
  position: sticky;
  top: 0;
  z-index: 60;
  background: rgba(255,255,255,.90);
  backdrop-filter: blur(10px);
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
  min-width: 260px;
}
#cgd-title .logo{
  width: 44px; height: 44px;          /* ✅ +70% (era ~26) */
  border-radius: 999px;
  border: 1px solid rgba(20,30,60,.12);
  box-shadow: 0 10px 22px rgba(2,6,23,.10);
  object-fit: cover;
  background: #fff;
}
#cgd-title .dot{ width:10px;height:10px;border-radius:999px;background:#111827; }

#cgd-top .right{
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
}
.btn{
  border:1px solid var(--border);
  background: #fff;
  color: var(--text);
  padding: 8px 12px;
  border-radius: 12px;
  font-weight: 900;
  cursor:pointer;
}
.btn:hover{ box-shadow: 0 10px 22px rgba(2,6,23,.10); transform: translateY(-1px); }
.btn:active{ transform: translateY(0px); }
.btn.primary{ background: #e8f0ff; border-color: rgba(59,130,246,.35); }
.btn.danger{ background: #ffecec; border-color: rgba(239,68,68,.35); }
.btn.small{ padding:6px 10px; border-radius:10px; font-weight:950; font-size:12px; }

.badge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(2,6,23,.05);
  border:1px solid var(--border);
  font-weight: 950;
  font-size: 12px;
}

#cgd-wrap{
  width:100%;
  flex: 1 1 auto;
  display:grid;
  grid-template-columns: minmax(360px, 35%) 1fr;
  gap: 12px;
  padding: 12px;
  align-items:start;

  padding-bottom: 86px; /* espaço pra barra inferior */
}

.panel{
  width:100%;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow:hidden;
}
.p-hdr{
  padding: 12px 12px;
  border-bottom: 1px solid var(--border);
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:10px;
}
.p-hdr .left{
  flex: 1 1 auto;
  min-width: 220px;
}
.p-hdr .h{ font-weight: 950; line-height: 1.15; width:100%; }
.p-hdr .sub{ font-size: 12px; color: var(--muted); font-weight: 900; margin-top:4px; }
.p-body{ padding: 12px; width:100%; }

.leadCard{
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px;
  background: #fff;
  display:flex;
  flex-direction:column;
  gap:10px;
  margin-bottom: 10px;
}
.leadTop{ display:flex; flex-direction:column; gap:8px; }
.leadName{
  font-weight: 980;
  font-size: 15px;
  line-height: 1.2;
  white-space: normal;
  word-break: break-word;
}
.pills{ display:flex; gap:6px; flex-wrap:wrap; }
.pill{
  font-size: 11px;
  font-weight: 950;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 5px 9px;
  color: rgba(15,23,42,.9);
  background: rgba(2,6,23,.03);
}
.ctaRow{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; }
.sel{
  border:1px solid var(--border);
  border-radius: 12px;
  padding: 8px 10px;
  font-weight: 900;
  background:#fff;
}

.small{ font-size: 12px; color: var(--muted); font-weight: 900; }
.muted{ color: var(--muted); }

.alertBox{
  border: 2px solid rgba(236,72,153,.30);
  background: linear-gradient(135deg, rgba(236,72,153,.16), rgba(59,130,246,.10));
  padding: 12px;
  border-radius: 16px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:12px;
  box-shadow: 0 10px 28px rgba(236,72,153,.14);
}
.alertBox .a{ font-weight: 980; font-size: 13px; }
.alertBox .b{ font-size: 12px; font-weight: 950; color: rgba(15,23,42,.78); }

#userGrid{
  width:100%;
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.userCard{
  width:100%;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px;
  background: #fff;
}
.userRow{ display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
.userName{ font-weight: 980; line-height:1.15; }
.kpis{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; justify-content:flex-end; }
.kpi{ font-size: 11px; font-weight: 950; border:1px solid var(--border); border-radius:999px; padding:5px 9px; background: rgba(2,6,23,.03); }

.miniLead{
  border-top: 1px dashed rgba(20,30,60,.18);
  margin-top: 10px;
  padding-top: 10px;
  display:flex;
  flex-direction:column;
  gap:8px;
}
.miniLine{ font-size: 12px; font-weight: 950; color: rgba(15,23,42,.88); }
.miniLine span{ color: var(--muted); font-weight: 950; }

#cgd-bottom{
  position: fixed;        /* ✅ volta pra linha inferior */
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 55;

  padding: 10px 12px;
  background: rgba(255,255,255,.94);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--border);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
}
.queueBox{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.queueTag{
  display:inline-flex; align-items:center; gap:8px;
  padding: 8px 10px; border:1px solid var(--border); border-radius: 14px;
  background: #fff;
  font-weight: 980;
}
.queueTag .mini{ font-size:11px; font-weight: 950; color: var(--muted); }

.modalHdr{
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  background: linear-gradient(135deg, rgba(59,130,246,.10), rgba(236,72,153,.08));
}
.modalHdr .t{ font-weight: 980; display:flex; gap:10px; align-items:center; }
.modalBody{ padding: 14px; }
.field{ display:flex; flex-direction:column; gap:6px; margin-bottom: 10px; }
.field label{ font-size: 12px; font-weight: 980; color: rgba(15,23,42,.85); }
.input{ border:1px solid var(--border); border-radius: 12px; padding: 10px 12px; font-weight: 900; }
.sep{ border:none; border-top:1px solid var(--border); margin: 12px 0; }
.row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.tableLike{ display:flex; flex-direction:column; gap:10px; }
.selLeadRow{
  border:1px solid var(--border); border-radius: 16px; padding:12px;
  display:flex; gap:10px; align-items:flex-start; justify-content:space-between;
  background: #fff;
}
.selLeadRow .left{ flex:1; min-width: 240px; }
.selLeadRow .right{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }

@media (max-width: 1024px){
  #cgd-wrap{ grid-template-columns: 1fr; }
  #userGrid{ grid-template-columns: 1fr; }
}
  `;
  document.head.appendChild(style);

  /* =============================
   * 6) MODAL (BLINDADO + MODERN)
   * ============================= */

  const MODAL_Z = 2147483647;

  function closeModal() {
    const b = document.getElementById("cgd-modal-back");
    if (b) b.remove();
  }

  function openModal(title, html, icon = "✨") {
    closeModal();

    const back = document.createElement("div");
    back.id = "cgd-modal-back";

    back.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "right:0",
      "bottom:0",
      "inset:0",
      "background:rgba(2,6,23,.60)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `z-index:${MODAL_Z}`,
      "padding:14px",
    ].join(";");

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.style.cssText = [
      "width:min(1040px, calc(100vw - 22px))",
      "max-height:calc(100vh - 22px)",
      "overflow:auto",
      "background:linear-gradient(180deg, #ffffff, #fbfbff)",
      "border-radius:20px",
      "border:1px solid rgba(255,255,255,.22)",
      "box-shadow:0 34px 100px rgba(2,6,23,.45)",
    ].join(";");

    modal.innerHTML = `
      <div class="modalHdr">
        <div class="t"><span style="font-size:16px">${esc(icon)}</span> <span>${esc(title)}</span></div>
        <div class="row">
          <button class="btn" id="cgd-modal-close">Fechar</button>
        </div>
      </div>
      <div class="modalBody">${html}</div>
    `;

    back.addEventListener("click", (e) => {
      if (e.target === back) closeModal();
    });

    back.appendChild(modal);

    const host = document.body || document.documentElement;
    host.appendChild(back);

    const btn = modal.querySelector("#cgd-modal-close");
    if (btn) btn.onclick = closeModal;
  }

  // debug manual
  window.cgdModalTest = function () {
    openModal("TESTE MODAL", `<div class="badge">Se você está vendo isso, modal OK ✅</div>`, "🧪");
  };

  /* =============================
   * 7) CORE ACTIONS
   * ============================= */

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

  async function doPickLead(leadId, userId) {
    await updateLead(leadId, {
      ASSIGNED_BY_ID: Number(userId),
      STATUS_ID: CFG.LEAD_STATUS.IN_PROCESS,
    });

    // fila: quem pegou vai pro final
    ensureQueueValid();
    const q = queue.filter((x) => Number(x) !== Number(userId));
    q.push(Number(userId));
    queue = q;
    await saveQueueToBitrix();

    // stats (sessão)
    const lead = await getLead(leadId);
    const L = leadLine(lead);
    const st = statUser(userId);
    st.pulled += 1;
    st.last2.unshift({ name: L.name, op: L.op, dt: L.dt });
    st.last2 = st.last2.slice(0, 2);

    return lead;
  }

  async function doTransferLead(leadId, fromUserId, toUserId) {
    if (Number(fromUserId) === Number(toUserId)) return;

    await updateLead(leadId, {
      ASSIGNED_BY_ID: Number(toUserId),
      STATUS_ID: CFG.LEAD_STATUS.IN_PROCESS,
    });

    // stats sessão: ajusta contagem
    const from = statUser(fromUserId);
    const to = statUser(toUserId);
    if (from.pulled > 0) from.pulled -= 1;
    to.pulled += 1;

    // atualiza últimos (melhor esforço)
    try {
      const lead = await getLead(leadId);
      const L = leadLine(lead);
      to.last2.unshift({ name: L.name, op: L.op, dt: L.dt });
      to.last2 = to.last2.slice(0, 2);
    } catch (_) {}
  }

  async function doMoveLead(leadId, toStatus) {
    await updateLead(leadId, { STATUS_ID: String(toStatus) });
  }

  async function doDiscardLead(leadId) {
    await updateLead(leadId, { STATUS_ID: CFG.LEAD_STATUS.JUNK });
  }

  async function addLeadProductTag(leadId, tagText) {
    const lead = await getLead(leadId);
    const prev = String(lead[CFG.LEAD_COMMENTS_FIELD] || "");
    const stamp = fmtDT(new Date().toISOString());
    const add = `\n\n[TAG] ${tagText} • ${stamp}`;
    await updateLead(leadId, { [CFG.LEAD_COMMENTS_FIELD]: prev + add });
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

  /* =============================
   * 8) ALARME NOVO LEAD (mais chamativo)
   * ============================= */

  let alertTimer = null;
  let sirenTimer = null;

  function playSirenBurst() {
    if (isSilent) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "square";

      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t0);

      // sirene (2.5s) alternando freq
      const dur = 2.5;
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const t = t0 + (dur * i) / steps;
        const freq = i % 2 === 0 ? 980 : 520;
        o.frequency.setValueAtTime(freq, t);
      }

      g.gain.linearRampToValueAtTime(0.08, t0 + 0.05);
      g.gain.linearRampToValueAtTime(0.05, t0 + dur - 0.2);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);

      o.start(t0);
      o.stop(t0 + dur + 0.05);

      setTimeout(() => {
        ctx.close().catch(() => {});
      }, (dur + 0.2) * 1000);
    } catch (_) {}
  }

  function setAlertOn(hasNew) {
    const box = document.getElementById("alertBox");
    if (!box) return;

    if (hasNew) {
      box.style.display = "flex";

      if (!alertTimer) {
        alertTimer = setInterval(() => {
          box.style.opacity = box.style.opacity === "0.55" ? "1" : "0.55";
        }, 260);
      }

      // toca sirene a cada 6s enquanto houver lead novo (até silenciar)
      if (!sirenTimer) {
        playSirenBurst();
        sirenTimer = setInterval(() => playSirenBurst(), 6000);
      }
    } else {
      box.style.display = "none";
      box.style.opacity = "1";
      if (alertTimer) {
        clearInterval(alertTimer);
        alertTimer = null;
      }
      if (sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
      }
    }
  }

  /* =============================
   * 9) MODAL: FILA (modernizado + Bitrix)
   * ============================= */

  function openQueueManager() {
    openModal(
      "FILA • Disponibilidade",
      `
      <div class="small muted">
        Marque quem está <b>DISPONÍVEL</b>. Somente essas entram na fila.
        <br/>A fila é gravada no Bitrix (Pipeline 27 • QUEUE_JSON).
      </div>

      <hr class="sep"/>

      <div class="tableLike" id="qmList"></div>

      <hr class="sep"/>

      <div class="row" style="justify-content:space-between">
        <div class="small muted" id="qmStatus">—</div>
        <div class="row">
          <button class="btn" id="qmReload">Recarregar do Bitrix</button>
          <button class="btn primary" id="qmSave">Salvar</button>
          <button class="btn" id="qmBuild">Montar fila (com disponíveis)</button>
          <button class="btn danger" id="qmClear">Zerar fila</button>
        </div>
      </div>
    `,
      "🧩"
    );

    const box = document.getElementById("qmList");
    const status = document.getElementById("qmStatus");

    function render() {
      box.innerHTML = CFG.USERS.map((u) => {
        const chk = availUsers.has(Number(u.id)) ? "checked" : "";
        return `
          <div class="selLeadRow">
            <div class="left">
              <label style="display:flex; gap:10px; align-items:center; cursor:pointer">
                <input type="checkbox" data-av="${esc(u.id)}" ${chk}/>
                <div style="font-weight:980">${esc(u.name)} <span class="small muted">(${esc(u.id)})</span></div>
              </label>
            </div>
          </div>
        `;
      }).join("");
    }

    function getCheckedSet() {
      const set = new Set();
      box.querySelectorAll("input[data-av]").forEach((i) => {
        if (i.checked) set.add(Number(i.dataset.av));
      });
      return set;
    }

    document.getElementById("qmReload").onclick = async () => {
      status.textContent = "Recarregando do Bitrix…";
      await loadQueueFromBitrix();
      render();
      renderBottom();
      renderRightUsers();
      status.textContent = "OK ✅";
    };

    document.getElementById("qmSave").onclick = async () => {
      const set = getCheckedSet();
      availUsers = new Set(set);
      ensureQueueValid();
      await saveQueueToBitrix();
      status.textContent = "OK ✅ Disponibilidade salva.";
      renderBottom();
      renderRightUsers();
    };

    document.getElementById("qmBuild").onclick = async () => {
      const set = getCheckedSet();
      availUsers = new Set(set);
      const arr = Array.from(set).map(Number);
      queue = arr;
      ensureQueueValid();
      await saveQueueToBitrix();
      status.textContent = "OK ✅ Fila montada com as disponíveis.";
      renderBottom();
      renderRightUsers();
    };

    document.getElementById("qmClear").onclick = async () => {
      if (!confirm("Zerar a fila?")) return;
      queue = [];
      await saveQueueToBitrix();
      status.textContent = "Fila zerada ✅";
      renderBottom();
      renderRightUsers();
    };

    render();
  }

  /* =============================
   * 10) MODAL: OCULTAR USUÁRIAS (modernizado + Bitrix)
   * ============================= */

  function openHideUsers() {
    openModal(
      "Ocultar usuárias (cards à direita)",
      `
      <div class="small muted">
        Marque para <b>ocultar</b> o card da usuária no painel da direita.
        <br/>Isso também fica salvo no Bitrix (QUEUE_JSON).
      </div>
      <hr class="sep"/>
      <div id="huList" class="tableLike"></div>
      <hr class="sep"/>
      <div class="row" style="justify-content:space-between">
        <div class="small muted" id="huStatus">—</div>
        <button class="btn primary" id="huSave">Salvar</button>
      </div>
    `,
      "🙈"
    );

    const box = document.getElementById("huList");
    const st = document.getElementById("huStatus");

    box.innerHTML = CFG.USERS.map((u) => {
      const chk = hiddenUsers.has(Number(u.id)) ? "checked" : "";
      return `
        <div class="selLeadRow">
          <div class="left">
            <label style="display:flex; gap:10px; align-items:center; cursor:pointer">
              <input type="checkbox" data-hu="${esc(u.id)}" ${chk}/>
              <div style="font-weight:980">${esc(u.name)} <span class="small muted">(${esc(u.id)})</span></div>
            </label>
          </div>
        </div>
      `;
    }).join("");

    document.getElementById("huSave").onclick = async () => {
      const set = new Set();
      box.querySelectorAll("input[data-hu]").forEach((i) => {
        if (i.checked) set.add(Number(i.dataset.hu));
      });
      hiddenUsers = set;
      await saveQueueToBitrix();
      renderRightUsers();
      st.textContent = "OK ✅";
      closeModal();
    };
  }

  /* =============================
   * 11) MODAL: GET EQUIPES (modernizado)
   * ============================= */

  function openGetLinks() {
    openModal(
      "GET • Equipes",
      `
      <div class="small muted">Abrir os painéis GET em nova aba.</div>
      <hr class="sep"/>
      <div class="tableLike">
        ${CFG.GET_LINKS.map(
          (x) => `
          <div class="selLeadRow">
            <div class="left">
              <div style="font-weight:980">${esc(x.label)}</div>
              <div class="small muted">${esc(x.url)}</div>
            </div>
            <div class="right">
              <a class="btn primary" href="${esc(x.url)}" target="_blank" rel="noopener">Abrir</a>
            </div>
          </div>
        `
        ).join("")}
      </div>
    `,
      "🧭"
    );
  }

  /* =============================
   * 12) MODAL: ABRIR (CARD DA USER) — lista leads reais da usuária
   * ============================= */

  async function openUserQuick(userId) {
    const uid = Number(userId);
    const name = getUserNameById(uid);

    openModal(
      `USUÁRIA • ${name}`,
      `
      <div class="small muted">
        Lista de leads <b>atuais</b> atribuídos para <b>${esc(name)}</b> (exceto PERDIDO/DESCARTADO).
      </div>

      <div class="row" style="justify-content:space-between; margin-top:10px">
        <div class="badge" id="uqCount">—</div>
        <div class="row">
          <button class="btn" id="uqReload">Atualizar</button>
          <button class="btn primary" id="uqBatch">FOLLOW-UP em lote</button>
        </div>
      </div>

      <hr class="sep"/>

      <div class="field">
        <label>Buscar lead (nome/título)</label>
        <input class="input" id="uqSearch" placeholder="Digite..." />
      </div>

      <div id="uqList" class="tableLike"><div class="small muted">Carregando…</div></div>
      <div class="small" id="uqStatus"></div>
    `,
      "👤"
    );

    const elCount = document.getElementById("uqCount");
    const elSearch = document.getElementById("uqSearch");
    const elList = document.getElementById("uqList");
    const elStatus = document.getElementById("uqStatus");

    let leads = [];

    async function load() {
      elStatus.textContent = "Carregando…";

      // ✅ filtro correto (não usar chaves duplicadas)
      leads = await listLeads(
        {
          ASSIGNED_BY_ID: uid,
          "!STATUS_ID": [CFG.LEAD_STATUS.LOST, CFG.LEAD_STATUS.JUNK],
        },
        null,
        { DATE_MODIFY: "DESC" },
        150
      );

      elStatus.textContent = `OK • ${leads.length} leads`;
      render();
    }

    function render() {
      const q = String(elSearch.value || "").trim().toLowerCase();
      const filtered = (leads || []).filter((l) => renderClientName(l).toLowerCase().includes(q));

      elCount.textContent = `${filtered.length} leads`;

      elList.innerHTML =
        filtered
          .map((l) => {
            const L = leadLine(l);
            return `
              <div class="selLeadRow">
                <div class="left">
                  <div style="font-weight:980">${esc(L.name)}</div>
                  <div class="small muted">
                    Operadora: <b>${esc(L.op)}</b> • Data/Hora: <b>${esc(fmtDT(L.dt))}</b> • Status: <b>${esc(
              stageLeadName(l.STATUS_ID)
            )}</b> • ID ${esc(l.ID)}
                  </div>
                </div>
                <div class="right">
                  <button class="btn" data-tx="${esc(l.ID)}">Transferir</button>
                  <button class="btn primary" data-fu="${esc(l.ID)}">FOLLOW-UP</button>
                </div>
              </div>
            `;
          })
          .join("") || `<div class="small muted">Nenhum lead para mostrar.</div>`;

      // transferir
      elList.querySelectorAll("button[data-tx]").forEach((b) => {
        b.onclick = async () => {
          const leadId = Number(b.dataset.tx);
          const opts = CFG.USERS.map((u) => `${u.id} — ${u.name}`).join("\n");
          const pick = prompt(`Transferir para qual usuária?\n\n${opts}\n\nDigite apenas o ID:`, "");
          if (pick === null) return;
          const toId = Number(String(pick).trim());
          if (!CFG.USERS.some((u) => Number(u.id) === toId)) return alert("ID inválido.");
          elStatus.textContent = "Transferindo…";
          await doTransferLead(leadId, uid, toId);
          await refreshAll(true);
          await load();
        };
      });

      // follow-up
      elList.querySelectorAll("button[data-fu]").forEach((b) => {
        b.onclick = async () => {
          const id = Number(b.dataset.fu);
          await openFollowUpSingle(id, uid);
        };
      });
    }

    document.getElementById("uqReload").onclick = load;
    elSearch.oninput = render;

    document.getElementById("uqBatch").onclick = () => openFollowUpBatch(uid, leads);

    load().catch((e) => (elStatus.textContent = `Erro: ${String(e.message || e)}`));
  }

  /* =============================
   * 13) GERENCIAR USUÁRIA (modernizado)
   * ============================= */

  let currentUserId = null;

  function openUserManagerPicker() {
    openModal(
      "Selecionar Usuária",
      `
      <div class="small muted">Escolha uma usuária para abrir o painel de ações.</div>
      <hr class="sep"/>
      <div class="tableLike">
        ${CFG.USERS.map(
          (u) => `
          <div class="selLeadRow">
            <div class="left">
              <div style="font-weight:980">${esc(u.name)}</div>
              <div class="small muted">ID: ${esc(u.id)}</div>
            </div>
            <div class="right">
              <button class="btn primary" data-um="${esc(u.id)}">Abrir</button>
            </div>
          </div>
        `
        ).join("")}
      </div>
    `,
      "🛠️"
    );

    document.querySelectorAll("button[data-um]").forEach((b) => {
      b.onclick = () => openUserManager(Number(b.dataset.um));
    });
  }

  function openUserManager(userId) {
    currentUserId = Number(userId);

    openModal(
      `GERENCIAR • ${getUserNameById(currentUserId)}`,
      `
      <div class="small muted">
        Controle de <b>LEADS EM ANDAMENTO</b> da usuária (exceto PERDIDO/DESCARTADO) e criação de <b>FOLLOW-UP</b> na Pipeline 17.
      </div>

      <div class="row" style="justify-content:space-between; margin-top:10px">
        <div class="row">
          <button class="btn" id="umReload">Atualizar</button>
          <button class="btn" id="umConvertidos">CONVERTIDOS (Pipeline 0)</button>
          <button class="btn primary" id="umBatchFollow">FOLLOW-UP em lote</button>
        </div>
        <div class="badge" id="umCount">—</div>
      </div>

      <hr class="sep"/>

      <div class="field">
        <label>Buscar lead por palavra (nome/título)</label>
        <input class="input" id="umSearch" placeholder="Ex.: Maria, João, Carlos..." />
      </div>

      <div id="umList" class="tableLike">
        <div class="small muted">Clique em “Atualizar”.</div>
      </div>

      <div class="small" id="umStatus"></div>
    `,
      "🧰"
    );

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
          "!STATUS_ID": [CFG.LEAD_STATUS.LOST, CFG.LEAD_STATUS.JUNK],
        },
        null,
        { DATE_MODIFY: "DESC" },
        160
      );

      elStatus.textContent = `OK • ${leads.length} leads`;
      render();
    }

    function render() {
      const q = String(elSearch.value || "").trim().toLowerCase();
      const filtered = (leads || []).filter((l) => renderClientName(l).toLowerCase().includes(q));

      elCount.textContent = `${filtered.length} leads`;

      elList.innerHTML =
        filtered
          .map((l) => {
            const L = leadLine(l);
            return `
            <div class="selLeadRow">
              <div class="left">
                <div style="font-weight:980">${esc(L.name)}</div>
                <div class="small muted">
                  Operadora: <b>${esc(L.op)}</b> • Data/Hora: <b>${esc(fmtDT(L.dt))}</b> • Status: <b>${esc(
              stageLeadName(l.STATUS_ID)
            )}</b> • ID ${esc(l.ID)}
                </div>
              </div>
              <div class="right">
                <button class="btn" data-tx="${esc(l.ID)}">Transferir</button>
                <button class="btn primary" data-q="${esc(l.ID)}">QUALIFICAR + TAG</button>
                <button class="btn danger" data-p="${esc(l.ID)}">PERDIDO</button>
                <button class="btn" data-c="${esc(l.ID)}">CONVERTIDO</button>
                <button class="btn primary" data-f="${esc(l.ID)}">FOLLOW-UP</button>
              </div>
            </div>
          `;
          })
          .join("") || `<div class="small muted">Nenhum lead para mostrar.</div>`;

      // transferir
      elList.querySelectorAll("button[data-tx]").forEach((b) => {
        b.onclick = async () => {
          const leadId = Number(b.dataset.tx);
          const opts = CFG.USERS.map((u) => `${u.id} — ${u.name}`).join("\n");
          const pick = prompt(`Transferir para qual usuária?\n\n${opts}\n\nDigite apenas o ID:`, "");
          if (pick === null) return;
          const toId = Number(String(pick).trim());
          if (!CFG.USERS.some((u) => Number(u.id) === toId)) return alert("ID inválido.");
          elStatus.textContent = "Transferindo…";
          await doTransferLead(leadId, currentUserId, toId);
          await refreshAll(true);
          await load();
        };
      });

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

  /* =============================
   * 14) FOLLOW-UP (prazo com datetime-local)
   * ============================= */

  async function openFollowUpSingle(leadId, userId) {
    const lead = await getLead(leadId);
    const L = leadLine(lead);

    openModal(
      `FOLLOW-UP • ${getUserNameById(userId)}`,
      `
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
        <label>Prazo (UF_CRM_1768175087)</label>
        <input class="input" type="datetime-local" id="fuPrazo" />
        <div class="small muted">Escolha data e hora. O sistema envia no formato <b>YYYY-MM-DD HH:MM:SS</b>.</div>
      </div>

      <div class="row">
        <button class="btn primary" id="fuGo">Criar FOLLOW-UP</button>
      </div>

      <div class="small" id="fuStatus"></div>
    `,
      "📌"
    );

    document.getElementById("fuGo").onclick = async () => {
      const st = document.getElementById("fuStatus");
      try {
        st.textContent = "Criando…";

        const title = String(document.getElementById("fuTitle").value || "").trim() || L.name;
        const extra = String(document.getElementById("fuExtra").value || "").trim();
        const prazoLocal = String(document.getElementById("fuPrazo").value || "").trim();
        const prazo = toBitrixDateTimeFromLocal(prazoLocal);

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
        st.textContent = `Erro: ${String(e.message || e)}`;
      }
    };
  }

  function openFollowUpBatch(userId, leadsInMemory) {
    openModal(
      `FOLLOW-UP EM LOTE • ${getUserNameById(userId)}`,
      `
      <div class="small muted">
        Selecione leads (da lista atual), defina prazo base e opcionalmente intervalo.
      </div>

      <div class="field">
        <label>Buscar lead (na lista)</label>
        <input class="input" id="fbSearch" placeholder="Digite..." />
      </div>

      <div class="field">
        <label>Prazo base (UF_CRM_1768175087)</label>
        <input class="input" type="datetime-local" id="fbPrazo" />
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
    `,
      "📦"
    );

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
                    <div style="font-weight:980">${esc(L.name)}</div>
                    <div class="small muted">Operadora: <b>${esc(L.op)}</b> • Data/Hora: <b>${esc(fmtDT(L.dt))}</b> • ID ${esc(
              l.ID
            )}</div>
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
        const prazoLocal = String(document.getElementById("fbPrazo").value || "").trim();
        if (!prazoLocal) return (elStatus.textContent = "Preencha o prazo base (data e hora).");

        const prazoBase = toBitrixDateTimeFromLocal(prazoLocal);
        if (!prazoBase) return (elStatus.textContent = "Prazo inválido.");

        const step = Number(document.getElementById("fbStep").value || 0);

        const ids = Array.from(chosen);
        if (!ids.length) return (elStatus.textContent = "Selecione ao menos 1 lead.");

        elStatus.textContent = `Criando ${ids.length} follow-ups…`;

        const baseDT = new Date(prazoLocal);

        for (let idx = 0; idx < ids.length; idx++) {
          const lead = await getLead(ids[idx]);
          const L = leadLine(lead);

          let prazo = prazoBase;
          if (step && !isNaN(baseDT.getTime())) {
            const d = new Date(baseDT.getTime() + idx * step * 60000);
            const local = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
              d.getHours()
            )}:${pad2(d.getMinutes())}`;
            prazo = toBitrixDateTimeFromLocal(local);
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
   * 15) CONVERTIDOS (Pipeline 0)
   * ============================= */

  function openConvertidos(userId) {
    const isPerUser = Number.isFinite(Number(userId));
    const userName = isPerUser ? getUserNameById(Number(userId)) : "GERAL";

    const stageName = (stageId) => {
      const hit = (CFG.PIPE0.STAGES || []).find((s) => s.id === stageId);
      return hit ? hit.name : stageId;
    };

    openModal(
      `CONVERTIDOS • PIPELINE 0 • ${userName}`,
      `
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
    `,
      "✅"
    );

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
            <div style="font-weight:980">${esc(d.TITLE || `Deal ${d.ID}`)}</div>
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
   * 16) APP UI
   * ============================= */

  root.innerHTML = `
    <div id="cgd-app">
      <div id="cgd-top">
        <div id="cgd-title">
          <img class="logo" src="${esc(CFG.LOGO_URL)}" alt="CGD" onerror="this.style.display='none'"/>
          <span class="dot"></span>
          <span>${esc(CFG.TITLE)}</span>
        </div>
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
        <div class="panel">
          <div class="p-hdr">
            <div class="left">
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
                <div class="a">🚨 NOVO LEAD</div>
                <div class="b">Alarme sonoro + alerta piscante (enquanto existir lead em “NOVO LEAD”).</div>
              </div>
              <div class="row">
                <button class="btn" id="btnSilenceAlert">Silenciar</button>
              </div>
            </div>
            <div id="leadList"><div class="small muted">Carregando…</div></div>
          </div>
        </div>

        <div class="panel">
          <div class="p-hdr">
            <div class="left">
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
          <button class="btn danger" id="btnResetQueue">Resetar</button>
          <button class="btn primary" id="btnNextAvail">Próxima disponível</button>
        </div>
      </div>
    </div>
  `;

  if (sentinel) setSent("JS iniciou ✅");

  /* =============================
   * 17) EVENTS
   * ============================= */

  document.getElementById("btnRefresh").onclick = () => refreshAll(true);
  document.getElementById("btnLeftRefresh").onclick = () => refreshLeft(true);
  document.getElementById("btnRightRefresh").onclick = () => refreshRight(true);

  document.getElementById("btnSilent").onclick = () => {
    isSilent = !isSilent;
    document.getElementById("btnSilent").textContent = isSilent ? "Som: OFF" : "Som: ON";
    if (isSilent && sirenTimer) {
      clearInterval(sirenTimer);
      sirenTimer = null;
    }
  };

  document.getElementById("btnSilenceAlert").onclick = () => {
    isSilent = true;
    document.getElementById("btnSilent").textContent = "Som: OFF";
    if (sirenTimer) {
      clearInterval(sirenTimer);
      sirenTimer = null;
    }
  };

  document.getElementById("btnQueueMgr").onclick = openQueueManager;
  document.getElementById("btnUserManager").onclick = openUserManagerPicker;
  document.getElementById("btnGetLinks").onclick = openGetLinks;

  document.getElementById("btnBatch").onclick = () => openBatchTransfer();
  document.getElementById("btnToggleHideUsers").onclick = () => openHideUsers();

  document.getElementById("btnResetQueue").onclick = async () => {
    if (!confirm("Resetar a fila?")) return;
    queue = [];
    await saveQueueToBitrix();
    renderBottom();
    renderRightUsers();
  };

  document.getElementById("btnNextAvail").onclick = async () => {
    ensureQueueValid();
    if (!queue.length) {
      alert("Fila vazia. Abra FILA e clique em “Montar fila (com disponíveis)”.");
      return;
    }
    const q = queue.slice();
    q.push(q.shift());
    queue = q;
    await saveQueueToBitrix();
    renderBottom();
    renderRightUsers();
  };

  // quando voltar pra aba, força refresh
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshAll(true).catch(() => {});
  });

  /* =============================
   * 18) BATCH TRANSFER (filtro operadora + contagem)
   * ============================= */

  let cachedNewLeads = [];

  function openBatchTransfer() {
    if (!cachedNewLeads.length) {
      alert("Nenhum lead em NOVO LEAD para transferir.");
      return;
    }

    const ops = Array.from(
      new Set(
        cachedNewLeads.map((l) => String(l[CFG.UF_OPERADORA] || "").trim()).filter((x) => x)
      )
    ).sort((a, b) => a.localeCompare(b));

    openModal(
      "TRANSFERIR EM LOTE",
      `
      <div class="small muted">
        Selecione leads e escolha para quem transferir.
        <br/>Ao transferir: <b>ASSIGNED_BY_ID</b> muda e o lead vira <b>EM ATENDIMENTO</b>.
      </div>

      <hr class="sep"/>

      <div class="row" style="justify-content:space-between">
        <div class="field" style="flex:1; min-width:220px">
          <label>Transferir para usuária</label>
          <select class="sel" id="btUser" style="width:100%">
            ${CFG.USERS.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("")}
          </select>
        </div>

        <div class="field" style="flex:1; min-width:220px">
          <label>Filtrar por operadora</label>
          <select class="sel" id="btOp" style="width:100%">
            <option value="">(Todas)</option>
            ${ops.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}
          </select>
        </div>

        <div class="badge" id="btCount">—</div>
      </div>

      <div class="row">
        <button class="btn primary" id="btGo">Transferir selecionados</button>
      </div>

      <hr class="sep"/>

      <div id="btList" class="tableLike"></div>
      <div class="small" id="btStatus"></div>
    `,
      "📤"
    );

    const box = document.getElementById("btList");
    const status = document.getElementById("btStatus");
    const count = document.getElementById("btCount");
    const opSel = document.getElementById("btOp");
    let chosen = new Set();

    function renderList() {
      const op = String(opSel.value || "").trim();
      const list = op ? cachedNewLeads.filter((l) => String(l[CFG.UF_OPERADORA] || "").trim() === op) : cachedNewLeads;

      count.textContent = `${list.length} leads listados`;

      box.innerHTML = list
        .map((l) => {
          const L = leadLine(l);
          const checked = chosen.has(Number(l.ID)) ? "checked" : "";
          return `
          <div class="selLeadRow">
            <div class="left">
              <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer">
                <input type="checkbox" data-bt="${esc(l.ID)}" ${checked}/>
                <div>
                  <div style="font-weight:980">${esc(L.name)}</div>
                  <div class="small muted">
                    Operadora: <b>${esc(L.op)}</b> • Data/Hora: <b>${esc(fmtDT(L.dt))}</b> • ID ${esc(l.ID)}
                  </div>
                </div>
              </label>
            </div>
          </div>
        `;
        })
        .join("");

      box.querySelectorAll("input[data-bt]").forEach((i) => {
        i.onchange = () => {
          const id = Number(i.dataset.bt);
          if (i.checked) chosen.add(id);
          else chosen.delete(id);
        };
      });
    }

    opSel.onchange = renderList;
    renderList();

    document.getElementById("btGo").onclick = async () => {
      try {
        const userId = Number(document.getElementById("btUser").value);
        const ids = Array.from(chosen);
        if (!ids.length) return (status.textContent = "Selecione ao menos 1 lead.");

        status.textContent = `Transferindo ${ids.length}…`;

        for (let idx = 0; idx < ids.length; idx++) {
          await doPickLead(ids[idx], userId);
          status.textContent = `Transferindo… (${idx + 1}/${ids.length})`;
          await sleep(150);
        }

        status.textContent = "OK ✅ Transferência em lote concluída.";
        await refreshAll(true);
      } catch (e) {
        status.textContent = `Erro: ${String(e.message || e)}`;
      }
    };
  }

  /* =============================
   * 19) RENDER LEFT
   * ============================= */

  function renderLeadCard(lead) {
    const L = leadLine(lead);
    const id = Number(lead.ID);
    const canMove = String(lead.STATUS_ID) !== String(CFG.LEAD_STATUS.NEW);

    return `
      <div class="leadCard" data-lead="${esc(id)}">
        <div class="leadTop">
          <div class="leadName">${esc(L.name)}</div>
          <div class="pills">
            <span class="pill">OPERADORA: ${esc(L.op)}</span>
            <span class="pill">DATA/HORA: ${esc(fmtDT(L.dt))}</span>
            <span class="pill">IDADE: ${esc(L.idade)}</span>
            <span class="pill">FONTE: ${esc(L.fonte)}</span>
            <span class="pill">BAIRRO: ${esc(L.bairro)}</span>
          </div>
        </div>

        <div class="ctaRow">
          <button class="btn danger" data-discard="${esc(id)}">DESCARTAR</button>
          <button class="btn primary" data-pick="${esc(id)}">PEGAR</button>

          ${
            canMove
              ? `
              <select class="sel" data-moveSel="${esc(id)}">
                ${stageOptionsHTML(lead.STATUS_ID)}
              </select>
              <button class="btn" data-moveBtn="${esc(id)}">MOVER PARA</button>
            `
              : ``
          }

          <span class="small muted">ID: ${esc(id)}</span>
        </div>
      </div>
    `;
  }

  async function bindLeftActions() {
    const box = document.getElementById("leadList");

    box.querySelectorAll("button[data-discard]").forEach((b) => {
      b.onclick = async () => {
        const id = Number(b.dataset.discard);
        if (!confirm("Descartar este lead? (vai para Lead descartado/JUNK)")) return;
        try {
          b.disabled = true;
          await doDiscardLead(id);
          await refreshAll(true);
        } catch (e) {
          alert(`Erro: ${String(e.message || e)}`);
        } finally {
          b.disabled = false;
        }
      };
    });

    box.querySelectorAll("button[data-pick]").forEach((b) => {
      b.onclick = async () => {
        const leadId = Number(b.dataset.pick);
        try {
          const front = getFrontUser();
          if (!front) {
            alert("Fila vazia. Clique em FILA e depois em “Montar fila (com disponíveis)”.");
            return;
          }

          const uName = getUserNameById(front);
          const lead = await getLead(leadId);
          const L = leadLine(lead);

          // ✅ modal PEGAR modernizado
          openModal(
            `PEGAR • ${uName}`,
            `
            <div class="badge">Lead: ${esc(L.name)} • ID ${esc(leadId)}</div>

            <div class="small muted" style="margin-top:10px">
              Operadora: <b>${esc(L.op)}</b> • Data/Hora: <b>${esc(fmtDT(L.dt))}</b>
            </div>

            <hr class="sep"/>

            <div class="small muted">
              Ao confirmar, o lead será atribuído para <b>${esc(uName)}</b> e mudará para <b>EM ATENDIMENTO</b>.
              <br/>A usuária vai automaticamente para o <b>final da fila</b>.
            </div>

            <div class="row" style="margin-top:12px; justify-content:flex-end">
              <button class="btn primary" id="pkGo">Confirmar transferência</button>
            </div>

            <div class="small" id="pkStatus"></div>
          `,
            "🎯"
          );

          document.getElementById("pkGo").onclick = async () => {
            const st = document.getElementById("pkStatus");
            try {
              st.textContent = "Transferindo…";
              await doPickLead(leadId, front);
              st.textContent = "OK ✅";
              closeModal();
              await refreshAll(true);
            } catch (e) {
              st.textContent = `Erro: ${String(e.message || e)}`;
            }
          };
        } catch (e) {
          alert(`Erro: ${String(e.message || e)}`);
        }
      };
    });

    box.querySelectorAll("button[data-moveBtn]").forEach((b) => {
      b.onclick = async () => {
        const leadId = Number(b.dataset.moveBtn);
        const sel = box.querySelector(`select[data-moveSel="${String(leadId).replace(/"/g, '\\"')}"]`);
        const to = sel ? String(sel.value) : null;
        if (!to) return;

        try {
          b.disabled = true;
          await doMoveLead(leadId, to);
          await refreshAll(true);
        } catch (e) {
          alert(`Erro: ${String(e.message || e)}`);
        } finally {
          b.disabled = false;
        }
      };
    });
  }

  /* =============================
   * 20) RENDER RIGHT
   * ============================= */

  function computeUserOrder() {
    resetDailyIfNeeded();

    const pulled = [];
    const never = [];

    for (const u of CFG.USERS) {
      const st = dailyStats.byUser[String(u.id)];
      if (st && st.pulled > 0) pulled.push({ id: u.id, last: st.last2[0]?.dt || "" });
      else never.push({ id: u.id });
    }

    pulled.sort((a, b) => {
      const da = new Date(a.last).getTime();
      const db = new Date(b.last).getTime();
      return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
    });

    ensureQueueValid();
    const q = queue.slice();
    const inQueueSet = new Set(q.map(Number));
    const pulledIds = new Set(pulled.map((x) => Number(x.id)));

    const out = [];
    for (const p of pulled) out.push(Number(p.id));
    for (const id of q) if (!pulledIds.has(Number(id))) out.push(Number(id));
    for (const n of never) {
      if (!pulledIds.has(Number(n.id)) && !inQueueSet.has(Number(n.id))) out.push(Number(n.id));
    }
    return out;
  }

  function renderRightUsers() {
    const grid = document.getElementById("userGrid");
    const order = computeUserOrder();

    grid.innerHTML =
      order
        .filter((id) => !hiddenUsers.has(Number(id)))
        .map((id) => {
          const u = CFG.USERS.find((x) => Number(x.id) === Number(id));
          if (!u) return "";
          const st = statUser(id);
          const l1 = st.last2[0];
          const l2 = st.last2[1];

          return `
          <div class="userCard">
            <div class="userRow">
              <div class="userName">${esc(u.name)} <span class="small muted">(${esc(u.id)})</span></div>
              <div class="kpis">
                <span class="kpi">puxados hoje: ${esc(st.pulled)}</span>
                <button class="btn small primary" data-openQuick="${esc(u.id)}">Abrir</button>
              </div>
            </div>

            <div class="miniLead">
              <div class="miniLine">
                <span>Último:</span> ${esc(l1 ? l1.name : "-")}
                <span>•</span> ${esc(l1 ? l1.op : "-")}
                <span>•</span> ${esc(l1 ? fmtDT(l1.dt) : "-")}
              </div>
              <div class="miniLine">
                <span>Anterior:</span> ${esc(l2 ? l2.name : "-")}
                <span>•</span> ${esc(l2 ? l2.op : "-")}
                <span>•</span> ${esc(l2 ? fmtDT(l2.dt) : "-")}
              </div>
            </div>
          </div>
        `;
        })
        .join("") || `<div class="small muted">Sem cards.</div>`;

    grid.querySelectorAll("button[data-openQuick]").forEach((b) => {
      b.onclick = () => openUserQuick(Number(b.dataset.openQuick));
    });
  }

  /* =============================
   * 21) RENDER BOTTOM
   * ============================= */

  function renderBottom() {
    ensureQueueValid();

    const box = document.getElementById("queueBox");
    const q = queue.slice();

    if (!q.length) {
      box.innerHTML = `
        <span class="badge">Fila de atendimento</span>
        <span class="small muted">
          Fila vazia. Clique em <b>Fila</b> e depois em <b>Montar fila (com disponíveis)</b>.
        </span>
      `;
      return;
    }

    box.innerHTML = `
      <span class="badge">Fila de atendimento</span>
      ${q
        .map((id, idx) => {
          const u = getUserNameById(id);
          const pos = idx === 0 ? "PRÓXIMA" : `#${idx + 1}`;
          return `
            <span class="queueTag">
              ${esc(u)}
              <span class="mini">${esc(pos)}</span>
            </span>
          `;
        })
        .join("")}
    `;
  }

  /* =============================
   * 22) REFRESH (rápido + confiável)
   * ============================= */

  async function refreshLeft(force) {
    const leadBox = document.getElementById("leadList");
    leadBox.innerHTML = `<div class="small muted">Carregando…</div>`;

    const leads = await listLeads({ STATUS_ID: CFG.LEAD_STATUS.NEW }, null, { DATE_CREATE: "DESC" }, 120);

    cachedNewLeads = leads;
    setAlertOn(leads.length > 0);

    leadBox.innerHTML =
      leads.map(renderLeadCard).join("") || `<div class="small muted">Sem novos leads.</div>`;

    await bindLeftActions();
  }

  async function refreshRight(force) {
    renderRightUsers();
    renderBottom();

    resetDailyIfNeeded();
    const dayTotal = Object.values(dailyStats.byUser).reduce((a, x) => a + (x.pulled || 0), 0);
    document.getElementById("kpiDay").textContent = `Leads do dia: ${dayTotal}`;
    document.getElementById("kpiMonth").textContent = `Leads do mês: 0`;
  }

  async function refreshAll(force) {
    try {
      ensureQueueValid();
      await refreshLeft(force);
      await refreshRight(force);
    } catch (e) {
      console.error(e);
      const leadBox = document.getElementById("leadList");
      if (leadBox) leadBox.innerHTML = `<div class="small muted">Erro: ${esc(String(e.message || e))}</div>`;
    }
  }

  /* =============================
   * 23) START
   * ============================= */

  async function start() {
    // 1) carrega fila do Bitrix
    await loadQueueFromBitrix();

    // 2) render inicial
    ensureQueueValid();
    renderBottom();
    renderRightUsers();

    // 3) primeira carga
    await refreshAll(true);

    // 4) auto refresh mais rápido
    setInterval(() => {
      refreshAll(false).catch(console.error);
    }, CFG.REFRESH_MS);
  }

  start().catch(console.error);
})();
