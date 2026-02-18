/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - Sem localStorage/sessionStorage
   - Fila multi-PC via QUEUE_JSON (Pipeline 27 / Stage QUEUE_JSON)
   - Layout preservado (não mexer na estética)
*/
(function () {
  "use strict";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    // Painel de LEADS (Categoria/Pipeline)
    LEADS_CATEGORY_ID: 17,

    // Campos do lead (mostrar no card)
    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD: "UF_CRM_1771333014",     // Data/Hora do Lead
    UF_IDADE: "UF_CRM_1771339221",       // Idade (texto)
    UF_BAIRRO: "UF_CRM_LEAD_1731909705398",
    UF_FONTE: "UF_CRM_1767285733843",

    // Follow-up
    UF_PRAZO: "UF_CRM_1768175087",

    // STAGES (⚠️ PREENCHA com os STAGE_ID reais do Bitrix na categoria 17)
    STAGES: {
      NOVO: "C17:NEW",                 // <-- seu stage “NOVO LEAD”
      EM_ATENDIMENTO: "C17:IN_WORK",   // <-- seu stage “EM ATENDIMENTO”
      PERDIDO: "C17:LOSE",             // <-- seu stage “PERDIDO”
      QUALIFICADO: "C17:QUALIFIED",    // <-- seu stage “QUALIFICADO”
      CONVERTIDO: "C17:WON"            // <-- seu stage “CONVERTIDO”
    },

    // Fila multi-PC via PIPELINE 27 (controle)
    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",          // QUEUE_JSON → C27:UC_SVUYIO
      UF_QUEUE_JSON: "UF_CRM_1771293519", // QUEUE_JSON (campo)
      TITLE_KEY: "__QUEUE__CGD__"
    },

    // Logo
    LOGO_URL:
      "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=e6lxlp1bz9nz",

    // Refresh
    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 7000,
    REFRESH_QUEUE_MS: 2500,

    // Limites
    LIMIT_NEW: 30,
    LIMIT_USER_HISTORY: 35,

    // Usuárias (as do painel)
    USERS: [
      { name: "ALINE", id: 15 },
      { name: "ADRIANA", id: 19 },
      { name: "ANDREYNA", id: 17 },
      { name: "MARIANA", id: 23 },
      { name: "JOSIANE", id: 811 },
      { name: "BRUNA LUISA", id: 3081 },
      { name: "FERNANDA SILVA", id: 3083 },
      { name: "LIVIA ALVES", id: 3079 },
      { name: "NICOLLE BELMONTE", id: 3085 },
      { name: "ANNA CLARA", id: 3389 },
      { name: "GABRIEL", id: 815 },
      { name: "BEATRIZ", id: 3387 }
    ]
  };

  // =========================
  // Helpers DOM
  // =========================
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function nowBRTime() {
    try { return new Date().toLocaleTimeString("pt-BR"); } catch (_) { return ""; }
  }
  function todayISOStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}T00:00:00`;
  }
  function monthISOStart() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01T00:00:00`;
  }
  function isoFromLocalInput(v) {
    if (!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return "";
    const y = +m[1], mo = +m[2] - 1, d = +m[3], hh = +m[4], mi = +m[5];
    const dt = new Date(y, mo, d, hh, mi, 0, 0);
    if (Number.isNaN(dt.getTime())) return "";
    // Bitrix aceita ISO; manter padrão
    return dt.toISOString();
  }

  // =========================
  // Bitrix webhook client
  // =========================
  function toPairs(prefix, obj, out) {
    out = out || [];
    if (obj === null || obj === undefined) return out;

    if (typeof obj === "object" && !Array.isArray(obj)) {
      for (const k of Object.keys(obj)) {
        const key = prefix ? `${prefix}[${k}]` : k;
        toPairs(key, obj[k], out);
      }
      return out;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const key = prefix ? `${prefix}[${i}]` : String(i);
        toPairs(key, obj[i], out);
      }
      return out;
    }
    out.push([prefix, String(obj)]);
    return out;
  }

  async function bx(method, params = {}) {
    const pairs = toPairs("", params, []);
    const body = new URLSearchParams();
    for (const [k, v] of pairs) if (k) body.append(k, v);

    const resp = await fetch(CONFIG.WEBHOOK + method, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${method}`);
    if (data && data.error) throw new Error(data.error_description || data.error);
    return data.result;
  }

  async function bxListAll(method, params, max = 120) {
    let start = 0;
    let out = [];
    while (true) {
      const r = await bx(method, { ...params, start });
      if (Array.isArray(r)) {
        out = out.concat(r);
        break;
      }
      if (r && Array.isArray(r.items)) {
        out = out.concat(r.items);
        if (!r.next) break;
        start = r.next;
      } else {
        break;
      }
      if (out.length >= max) break;
    }
    return out.slice(0, max);
  }

  // =========================
  // Audio — 3 bipes (mantido)
  // =========================
  function tripleBeep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const t0 = ctx.currentTime;
      const make = (t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.20);
      };
      make(t0 + 0.00);
      make(t0 + 0.28);
      make(t0 + 0.56);
      setTimeout(() => { try { ctx.close(); } catch (_) {} }, 1200);
    } catch (_) {}
  }

  // =========================
  // UI / CSS (preservado)
  // =========================
  function injectCSS() {
    const css = `
#cgdApp{
  --radius:18px;
  --border: rgba(30,40,70,.12);
  --text: rgba(18,26,40,.92);
  --muted: rgba(18,26,40,.62);
  --card: rgba(255,255,255,.82);
  --card2: rgba(255,255,255,.92);
  --shadow: 0 10px 30px rgba(20,30,60,.10);

  min-height: calc(100vh - 60px);
  padding: 10px 12px 90px;
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
  color: var(--text);
  background:
    radial-gradient(900px 600px at 15% 20%, rgba(176,140,255,.18), transparent 55%),
    radial-gradient(900px 600px at 85% 20%, rgba(120,210,255,.14), transparent 55%),
    radial-gradient(900px 650px at 55% 95%, rgba(255,150,200,.12), transparent 60%),
    linear-gradient(135deg, #f7f3ff, #f3fbff 50%, #fff7fb);
}

.cgdTop{
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,.72);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  box-shadow: var(--shadow);
}
.cgdTopLeft{ display:flex; align-items:center; gap:10px; min-width: 280px; }
.cgdLogo{
  width: 53px; height: 53px; /* +30% em cima do que estava */
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.10);
  object-fit: cover;
  background: #fff;
}
.cgdTitle{ font-weight: 950; letter-spacing:.2px; font-size: 13px; white-space: nowrap; }
.cgdTopRight{ display:flex; gap:8px; align-items:center; flex-wrap: wrap; justify-content: flex-end; }
.cgdPill{
  border: 1px solid var(--border);
  background: rgba(255,255,255,.78);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 900;
}
.cgdBtn{
  cursor:pointer;
  border: 1px solid rgba(30,40,70,.14);
  background: rgba(255,255,255,.86);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 950;
}
.cgdBtn:active{ transform: translateY(1px); }

.cgdGrid{
  margin-top: 12px;
  display:grid;
  grid-template-columns: 1.05fr 1.95fr;
  gap: 12px;
}
.cgdCol{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255,255,255,.62);
  box-shadow: var(--shadow);
  overflow: hidden;
  min-height: 68vh;
  display:flex;
  flex-direction: column;
}
.cgdColHead{
  padding: 10px 12px;
  background: rgba(255,255,255,.78);
  border-bottom: 1px solid var(--border);
  display:flex;
  align-items:flex-start;
  justify-content: space-between;
  gap: 10px;
}
.cgdColHead .hTitle{
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.3px;
  text-transform: uppercase;
  line-height: 1.25;
  width: 100%;
}
.cgdColHead .hSub{
  font-size: 11px;
  color: var(--muted);
  font-weight: 800;
  margin-top: 2px;
  width: 100%;
}
.cgdColHead .hActions{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }

.cgdList{
  padding: 10px;
  display:flex;
  flex-direction: column;
  gap: 10px;
  overflow:auto;
  min-height: 0;
}
.cgdCard{
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card2);
  box-shadow: 0 8px 20px rgba(20,30,60,.08);
  padding: 10px 10px 10px;
}
.cgdCardRow{
  display:flex;
  align-items:flex-start;
  justify-content: space-between;
  gap:10px;
}
.cgdLeadName{
  font-weight: 950;
  font-size: 14px;
  line-height: 1.2;
  word-break: break-word;
  flex: 1 1 auto;
}
.cgdBadges{
  display:flex;
  gap:6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.cgdBadge{
  font-size: 10px;
  font-weight: 950;
  border: 1px solid rgba(30,40,70,.12);
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,.9);
}
.cgdActions{
  margin-top: 10px;
  display:flex;
  gap:8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.cgdMiniBtn{
  cursor:pointer;
  border: 1px solid rgba(30,40,70,.14);
  background: rgba(255,255,255,.92);
  border-radius: 12px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 950;
}
.cgdMiniBtn.primary{ background: rgba(120,210,255,.25); }
.cgdMiniBtn.danger{ background: rgba(255,80,120,.16); border-color: rgba(255,80,120,.30); }

.cgdAlertBox{
  border: 1px solid rgba(255,80,140,.35);
  border-radius: 16px;
  padding: 12px;
  background: linear-gradient(135deg, rgba(255,210,230,.75), rgba(220,240,255,.70));
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}
.cgdAlertBox .txt{
  font-weight: 950;
  font-size: 12px;
  line-height: 1.25;
  width: 100%;
}
.cgdAlertBox .txt small{
  display:block;
  margin-top: 4px;
  font-size: 11px;
  color: rgba(18,26,40,.70);
  font-weight: 900;
}

.cgdBottom{
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 80;
  background: rgba(255,255,255,.76);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(30,40,70,.14);
  padding: 10px 12px;
  display:flex;
  flex-direction: column;
  gap: 10px;
}
.cgdQueueRow{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.cgdQueueChip{
  border: 1px solid rgba(30,40,70,.14);
  background: rgba(255,255,255,.9);
  border-radius: 999px;
  padding: 7px 10px;
  font-weight: 950;
  font-size: 12px;
}
.cgdStatusLine{
  font-size: 11px;
  color: rgba(18,26,40,.60);
  font-weight: 900;
}

/* ===== Modals modernos ===== */
.cgdModalOverlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.28);
  backdrop-filter: blur(4px);
  z-index: 200;
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 16px;
}
.cgdModal{
  width: min(980px, 96vw);
  max-height: min(88vh, 900px);
  background: rgba(255,255,255,.94);
  border: 1px solid rgba(30,40,70,.16);
  border-radius: 20px;
  box-shadow: 0 24px 70px rgba(20,30,60,.22);
  overflow:hidden;
  display:flex;
  flex-direction: column;
}
.cgdModalHead{
  padding: 12px 14px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgba(30,40,70,.12);
  background: rgba(255,255,255,.75);
}
.cgdModalTitle{ font-weight: 950; font-size: 13px; }
.cgdModalBody{
  padding: 12px 14px;
  overflow: auto;
  min-height: 0;
}
.cgdModalFoot{
  padding: 12px 14px;
  border-top: 1px solid rgba(30,40,70,.12);
  display:flex;
  gap: 10px;
  justify-content:flex-end;
  flex-wrap: wrap;
  background: rgba(255,255,255,.75);
}
.cgdInput, .cgdSelect{
  border: 1px solid rgba(30,40,70,.18);
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
  font-size: 12px;
  background: rgba(255,255,255,.95);
}
.cgdRow{
  display:flex; gap:10px; align-items:center; flex-wrap:wrap;
}
.cgdTable{
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(30,40,70,.12);
}
.cgdTable th, .cgdTable td{
  padding: 10px 10px;
  border-bottom: 1px solid rgba(30,40,70,.10);
  font-size: 12px;
}
.cgdTable th{ text-align:left; font-weight: 950; background: rgba(245,248,255,.8); }
.cgdTable tr:last-child td{ border-bottom: 0; }

/* ===== Forçar rodapé do Bitrix no final ===== */
.bitrix-footer{
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  top: auto !important;
  z-index: 5 !important;
}
body{ padding-bottom: 90px !important; }

@media (max-width: 1100px){
  .cgdGrid{ grid-template-columns: 1fr; }
  .cgdTopLeft{ min-width: unset; }
}
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  // =========================
  // Modal system
  // =========================
  function openModal(title, bodyHTML, footHTML) {
    closeModal();
    const ov = document.createElement("div");
    ov.className = "cgdModalOverlay";
    ov.innerHTML = `
      <div class="cgdModal" role="dialog" aria-modal="true">
        <div class="cgdModalHead">
          <div class="cgdModalTitle">${esc(title)}</div>
          <button class="cgdBtn" data-close-modal>Fechar</button>
        </div>
        <div class="cgdModalBody">${bodyHTML || ""}</div>
        <div class="cgdModalFoot">${footHTML || `<button class="cgdBtn" data-close-modal>Fechar</button>`}</div>
      </div>
    `;
    ov.addEventListener("click", (e) => {
      if (e.target === ov) closeModal();
      const c = e.target.closest("[data-close-modal]");
      if (c) closeModal();
    });
    document.body.appendChild(ov);
    document.addEventListener("keydown", escClose, { capture: true });
  }
  function escClose(e) { if (e.key === "Escape") closeModal(); }
  function closeModal() {
    const ov = $(".cgdModalOverlay");
    if (ov) ov.remove();
    document.removeEventListener("keydown", escClose, { capture: true });
  }

  // =========================
  // State (somente RAM)
  // =========================
  const state = {
    soundOn: true,
    lastNewLeadId: null,
    newLeads: [],
    stats: { day: 0, month: 0 },
    userStats: {},
    queue: { order: [], updatedAt: 0, dealId: null },
    hiddenUsers: new Set(), // RAM (sem storage)
    busyNext: false
  };

  function setStatus(txt) {
    const el = $("#statusLine");
    if (el) el.textContent = txt;
  }

  // =========================
  // Mount
  // =========================
  function mount() {
    let root = document.getElementById("cgd-leads-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "cgd-leads-root";
      document.body.prepend(root);
    }

    root.innerHTML = `
      <div id="cgdApp">
        <div class="cgdTop">
          <div class="cgdTopLeft">
            <img class="cgdLogo" src="${esc(CONFIG.LOGO_URL)}" alt="CGD" />
            <div class="cgdTitle">PAINEL DE LEADS • CGD CORRETORA</div>
          </div>
          <div class="cgdTopRight">
            <div class="cgdPill" id="pillDay">Leads do dia: 0</div>
            <div class="cgdPill" id="pillMonth">Leads do mês: 0</div>
            <button class="cgdBtn" id="btnManage">Gerenciar Usuária</button>
            <button class="cgdBtn" id="btnRefresh">Atualizar</button>
            <button class="cgdBtn" id="btnSound">Som: ON</button>
          </div>
        </div>

        <div class="cgdGrid">
          <section class="cgdCol" id="colNew">
            <div class="cgdColHead">
              <div style="width:100%">
                <div class="hTitle">NOVOS LEADS • PENDENTES</div>
                <div class="hSub">Somente status: <b>NOVO LEAD</b></div>
              </div>
              <div class="hActions">
                <button class="cgdBtn" id="btnBatch">Transferir em lote</button>
                <button class="cgdBtn" id="btnRefreshNew">Atualizar</button>
              </div>
            </div>
            <div class="cgdList" id="listNew">
              <div class="cgdAlertBox" id="alertNew" style="display:none">
                <div class="txt">
                  🚨 <b>NOVO LEAD</b>
                  <small>Alarme sonoro (3 bipes) enquanto existir lead em “NOVO LEAD”.</small>
                </div>
                <button class="cgdBtn" id="btnSilence">Silenciar</button>
                <button class="cgdBtn" id="btnUnsilence">Ligar som</button>
              </div>
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>

          <section class="cgdCol" id="colWho">
            <div class="cgdColHead">
              <div style="width:100%">
                <div class="hTitle">QUEM PEGOU HOJE</div>
                <div class="hSub">Cards por usuária (ordem: última que puxou → fila → fora da fila)</div>
              </div>
              <div class="hActions">
                <button class="cgdBtn" id="btnHideUsers">Ocultar usuárias</button>
                <button class="cgdBtn" id="btnRefreshWho">Atualizar</button>
              </div>
            </div>
            <div class="cgdList" id="listWho">
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>
        </div>

        <div class="cgdBottom">
          <div class="cgdQueueRow" id="queueRow">
            <div class="cgdQueueChip"><b>Fila de atendimento</b></div>
            <button class="cgdBtn" id="btnQueueBottom">Fila</button>
            <div class="cgdQueueChip" id="queueHint">Fila vazia. Clique em Fila e depois em Montar fila.</div>
          </div>
          <div class="cgdQueueRow">
            <button class="cgdBtn" id="btnQueueReset">Resetar</button>
            <button class="cgdBtn" id="btnNext">Próxima disponível</button>
            <div class="cgdStatusLine" id="statusLine">Atualizado: —</div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================
  // Data: NEW LEADS (stage NOVO)
  // =========================
  async function fetchNewLeads() {
    const items = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        STAGE_ID: CONFIG.STAGES.NOVO
      },
      order: { ID: "DESC" },
      select: [
        "ID","TITLE","DATE_CREATE","DATE_MODIFY","ASSIGNED_BY_ID","STAGE_ID",
        CONFIG.UF_OPERADORA,
        CONFIG.UF_DT_LEAD,
        CONFIG.UF_IDADE,
        CONFIG.UF_BAIRRO,
        CONFIG.UF_FONTE
      ]
    }, CONFIG.LIMIT_NEW);

    return items || [];
  }

  // =========================
  // Data: STATS (puxados) = stage EM_ATENDIMENTO modificado no dia/mês
  // =========================
  async function fetchStatsPulled() {
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    const dayItems = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        STAGE_ID: CONFIG.STAGES.EM_ATENDIMENTO,
        ">DATE_MODIFY": startToday
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID"]
    }, 500);

    const monthItems = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        STAGE_ID: CONFIG.STAGES.EM_ATENDIMENTO,
        ">DATE_MODIFY": startMonth
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID"]
    }, 2000);

    return { day: (dayItems || []).length, month: (monthItems || []).length };
  }

  // =========================
  // Data: User history (puxados hoje + últimos)
  // =========================
  async function fetchUserHistory(userId) {
    const startToday = todayISOStart();

    const today = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        ASSIGNED_BY_ID: String(userId),
        STAGE_ID: CONFIG.STAGES.EM_ATENDIMENTO,
        ">DATE_MODIFY": startToday
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","DATE_MODIFY","STAGE_ID","ASSIGNED_BY_ID"]
    }, 200);

    const last = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        ASSIGNED_BY_ID: String(userId)
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","DATE_MODIFY","STAGE_ID","ASSIGNED_BY_ID"]
    }, CONFIG.LIMIT_USER_HISTORY);

    return { pulledToday: (today || []).length, last: (last || []) };
  }

  // =========================
  // Queue JSON via Pipeline 27
  // =========================
  async function ensureQueueDeal() {
    const items = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        "%TITLE": CONFIG.QUEUE.TITLE_KEY
      },
      order: { ID: "DESC" },
      select: ["ID","TITLE", CONFIG.QUEUE.UF_QUEUE_JSON, "DATE_MODIFY"]
    }, 5);

    if (items && items[0]) return items[0];

    const id = await bx("crm.deal.add", {
      fields: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        TITLE: `${CONFIG.QUEUE.TITLE_KEY} FILA ATENDIMENTO`,
        [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify({ v: 1, order: [], updatedAt: Date.now() })
      }
    });

    const created = await bx("crm.deal.get", { id: String(id) });
    return created;
  }

  function parseQueue(json) {
    try {
      const o = JSON.parse(json || "{}");
      return {
        order: Array.isArray(o.order) ? o.order : [],
        updatedAt: +o.updatedAt || 0
      };
    } catch (_) {
      return { order: [], updatedAt: 0 };
    }
  }

  async function fetchQueue() {
    const deal = await ensureQueueDeal();
    const raw = deal && deal[CONFIG.QUEUE.UF_QUEUE_JSON];
    return { dealId: String(deal.ID), ...parseQueue(raw) };
  }

  async function saveQueue(dealId, order) {
    const payload = { v: 1, order: order || [], updatedAt: Date.now() };
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify(payload) }
    });
  }

  // =========================
  // Render
  // =========================
  function fmt(v) {
    const s = String(v ?? "").trim();
    return s || "—";
  }
  function renderNewLeads(items) {
    const list = $("#listNew");
    if (!list) return;

    const alert = $("#alertNew");
    list.innerHTML = "";
    if (alert) list.appendChild(alert);

    const has = (items || []).length > 0;
    if (alert) alert.style.display = has ? "flex" : "none";

    if (!has) {
      const empty = document.createElement("div");
      empty.style.opacity = ".75";
      empty.style.fontWeight = "900";
      empty.textContent = "Nenhum lead para mostrar.";
      list.appendChild(empty);
      return;
    }

    (items || []).forEach((it) => {
      const id = String(it.ID || "");
      const title = String(it.TITLE || "").trim() || `Lead #${id}`;

      const operadora = it[CONFIG.UF_OPERADORA];
      const dtLead = it[CONFIG.UF_DT_LEAD];
      const idade = it[CONFIG.UF_IDADE];
      const bairro = it[CONFIG.UF_BAIRRO];
      const fonte = it[CONFIG.UF_FONTE];

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div class="cgdLeadName">${esc(title)}</div>
          <div style="font-weight:950; font-size:12px; opacity:.7">ID: ${esc(id)}</div>
        </div>

        <div class="cgdBadges">
          <span class="cgdBadge">OPERADORA: ${esc(fmt(operadora))}</span>
          <span class="cgdBadge">DATA/HORA: ${esc(fmt(dtLead))}</span>
          <span class="cgdBadge">IDADE: ${esc(fmt(idade))}</span>
          <span class="cgdBadge">BAIRRO: ${esc(fmt(bairro))}</span>
          <span class="cgdBadge">FONTE: ${esc(fmt(fonte))}</span>
        </div>

        <div class="cgdActions">
          <button class="cgdMiniBtn danger" data-discard="${esc(id)}">DESCARTAR</button>
          <button class="cgdMiniBtn primary" data-grab="${esc(id)}">PEGAR</button>
        </div>
      `;
      list.appendChild(card);
    });
  }

  function renderStats(stats) {
    $("#pillDay").textContent = `Leads do dia: ${stats.day || 0}`;
    $("#pillMonth").textContent = `Leads do mês: ${stats.month || 0}`;
  }

  function renderWho(users) {
    const list = $("#listWho");
    if (!list) return;
    list.innerHTML = "";

    // ordem: última que puxou (por DATE_MODIFY do último item), depois em fila, depois fora
    const queueSet = new Set((state.queue.order || []).map(String));

    const enriched = users
      .filter(u => !state.hiddenUsers.has(String(u.id)))
      .map(u => {
        const us = state.userStats[u.id] || { pulledToday: 0, last: [] };
        const lastModify = us.last && us.last[0] && us.last[0].DATE_MODIFY ? us.last[0].DATE_MODIFY : "";
        return { u, us, lastModify };
      });

    enriched.sort((a, b) => {
      // 1) quem tem lastModify mais recente
      const ta = a.lastModify ? Date.parse(a.lastModify) || 0 : 0;
      const tb = b.lastModify ? Date.parse(b.lastModify) || 0 : 0;
      if (tb !== ta) return tb - ta;

      // 2) quem está na fila
      const qa = queueSet.has(String(a.u.id)) ? 0 : 1;
      const qb = queueSet.has(String(b.u.id)) ? 0 : 1;
      if (qa !== qb) return qa - qb;

      // 3) por nome
      return String(a.u.name).localeCompare(String(b.u.name), "pt-BR");
    });

    enriched.forEach(({ u, us }) => {
      const last1 = us.last && us.last[0]
        ? `Último: ${us.last[0].TITLE || ("#" + us.last[0].ID)}`
        : "Último: —";
      const last2 = us.last && us.last[1]
        ? `Anterior: ${us.last[1].TITLE || ("#" + us.last[1].ID)}`
        : "Anterior: —";

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div style="font-weight:950">${esc(u.name)} <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></div>
          <div style="display:flex; gap:8px; align-items:center">
            <span class="cgdBadge">puxados hoje: ${esc(us.pulledToday || 0)}</span>
            <button class="cgdMiniBtn" data-open-user="${esc(u.id)}">Abrir</button>
          </div>
        </div>
        <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">${esc(last1)}</div>
        <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">${esc(last2)}</div>
      `;
      list.appendChild(card);
    });
  }

  function renderQueue() {
    const row = $("#queueRow");
    const hint = $("#queueHint");
    if (!row || !hint) return;

    const keep = row.firstElementChild; // “Fila de atendimento”
    const filaBtn = $("#btnQueueBottom");
    row.innerHTML = "";
    if (keep) row.appendChild(keep);
    if (filaBtn) row.appendChild(filaBtn);

    const order = state.queue.order || [];
    if (order.length === 0) {
      hint.textContent = "Fila vazia. Clique em Fila e depois em Montar fila.";
      row.appendChild(hint);
      return;
    }

    hint.textContent = "";
    row.appendChild(hint);

    order.forEach((id, idx) => {
      const u = CONFIG.USERS.find((x) => String(x.id) === String(id));
      const chip = document.createElement("div");
      chip.className = "cgdQueueChip";
      chip.innerHTML = `<b>${esc(u ? u.name : ("USER " + id))}</b> <span style="opacity:.65">#${idx + 1}</span>`;
      row.appendChild(chip);
    });
  }

  // =========================
  // Actions
  // =========================
  async function actionAssignAndMove(dealId, userId) {
    // PEGAR: muda responsável e vai para EM_ATENDIMENTO
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: {
        ASSIGNED_BY_ID: String(userId),
        STAGE_ID: CONFIG.STAGES.EM_ATENDIMENTO
      }
    });
  }

  async function actionDiscard(dealId) {
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: {
        STAGE_ID: CONFIG.STAGES.PERDIDO
      }
    });
  }

  async function actionSetPrazoVerified(dealId, iso) {
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { [CONFIG.UF_PRAZO]: iso }
    });

    // confere gravou de verdade (sem “parece que gravou”)
    const d = await bx("crm.deal.get", { id: String(dealId) });
    const got = d ? d[CONFIG.UF_PRAZO] : null;
    if (!got) throw new Error("Follow-up não ficou gravado no Bitrix (campo UF vazio).");
    return true;
  }

  async function addFireEmojiIfNeeded(dealId) {
    const d = await bx("crm.deal.get", { id: String(dealId) });
    const title = String(d && d.TITLE ? d.TITLE : "").trim();
    if (title.startsWith("🔥")) return;
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { TITLE: `🔥 ${title || ("Lead " + dealId)}` }
    });
  }

  // =========================
  // Modals
  // =========================
  async function modalQueue() {
    const q = await fetchQueue();
    const current = new Set((q.order || []).map(String));

    const body = `
      <div style="font-weight:950; margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:10px">
        <button class="cgdBtn" id="qBuildBtn">Montar fila (todas)</button>
        <button class="cgdBtn" id="qClearBtn">Esvaziar fila</button>
      </div>

      <table class="cgdTable">
        <thead><tr><th>Na fila</th><th>Usuária</th></tr></thead>
        <tbody id="qTbody">
          ${CONFIG.USERS.map(u=>{
            const checked = current.has(String(u.id)) ? "checked" : "";
            return `
              <tr>
                <td><input type="checkbox" data-q-check="${esc(u.id)}" ${checked} /></td>
                <td><b>${esc(u.name)}</b> <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      <div style="margin-top:10px;font-size:11px;font-weight:900;opacity:.7">
        Atualizado: ${q.updatedAt ? new Date(q.updatedAt).toLocaleString("pt-BR") : "—"}
      </div>
    `;

    openModal("FILA", body, `
      <button class="cgdBtn" data-close-modal>Fechar</button>
      <button class="cgdBtn" id="qSaveBtn">Salvar fila</button>
    `);

    $("#qBuildBtn")?.addEventListener("click", ()=>{
      $$("#qTbody input[type=checkbox]").forEach(ch => { ch.checked = true; });
    });

    $("#qClearBtn")?.addEventListener("click", ()=>{
      $$("#qTbody input[type=checkbox]").forEach(ch => { ch.checked = false; });
    });

    $("#qSaveBtn")?.addEventListener("click", async ()=>{
      try{
        const selected = $$("#qTbody input[type=checkbox][data-q-check]")
          .filter(ch => ch.checked)
          .map(ch => String(ch.getAttribute("data-q-check")));
        await saveQueue(q.dealId, selected);
        closeModal();
        await refreshQueue(); // já atualiza na hora
        await refreshUsers();
        setStatus(`Fila salva: ${nowBRTime()}`);
      }catch(err){
        console.error(err);
        setStatus("Falha ao salvar fila (ver console).");
      }
    });
  }

  async function modalPickLead(dealId) {
    const uops = CONFIG.USERS.map(u => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    openModal("PEGAR LEAD", `
      <div style="font-weight:950;margin-bottom:10px">Escolha a ação</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="pickNext">Pegar para a próxima da fila</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <label style="font-weight:950">Ou selecionar usuária:</label>
        <select class="cgdSelect" id="pickUser">${uops}</select>
        <button class="cgdBtn" id="pickGo">Confirmar</button>
      </div>

      <div style="font-size:11px;font-weight:900;opacity:.75">
        Ao pegar, o lead muda responsável e vai automaticamente para <b>EM ATENDIMENTO</b>.
      </div>
    `);

    $("#pickNext")?.addEventListener("click", async ()=>{
      try{
        const q = await fetchQueue();
        const order = (q.order || []).slice();
        if(order.length === 0){
          setStatus("Fila vazia: selecione usuária.");
          return;
        }
        const nextId = String(order[0]); // não consome aqui; só pega para próxima “fluida”
        await actionAssignAndMove(dealId, nextId);
        // agora sim consome a fila
        order.shift();
        saveQueue(q.dealId, order).catch(()=>{});
        closeModal();
        // atualiza rápido sem travar
        refreshQueue(); refreshNewLeads(); refreshUsers(); refreshStats();
        setStatus(`Pego para ${nextId} • ${nowBRTime()}`);
      }catch(err){
        console.error(err);
        setStatus("Falha ao pegar (ver console).");
      }
    });

    $("#pickGo")?.addEventListener("click", async ()=>{
      try{
        const uid = $("#pickUser").value;
        await actionAssignAndMove(dealId, uid);
        closeModal();
        refreshNewLeads(); refreshUsers(); refreshStats();
        setStatus(`Pego para ${uid} • ${nowBRTime()}`);
      }catch(err){
        console.error(err);
        setStatus("Falha ao pegar (ver console).");
      }
    });
  }

  async function modalManageUser(userId) {
    const u = CONFIG.USERS.find(x => String(x.id) === String(userId));
    if (!u) return;

    let hist;
    try{
      hist = await fetchUserHistory(u.id);
    }catch(err){
      console.error(err);
      openModal(`GERENCIAR USUÁRIA • ${u.name}`, `<div style="font-weight:900;color:#a00">Falha ao carregar agora.</div>`);
      return;
    }

    const rows = (hist.last || []).map(it=>{
      const id = String(it.ID);
      const title = String(it.TITLE || ("Lead #" + id));
      const dm = (it.DATE_MODIFY || "").replace("T"," ").slice(0,19);

      return `<tr data-row="${esc(id)}">
        <td style="vertical-align:top">
          <label style="display:flex;gap:8px;align-items:flex-start">
            <input type="checkbox" data-sel="${esc(id)}" />
            <div>
              <b class="t">${esc(title)}</b>
              <div style="opacity:.7;font-weight:900;font-size:11px">ID: ${esc(id)} • ${esc(dm||"—")}</div>
            </div>
          </label>
        </td>

        <td style="vertical-align:top">
          <div class="cgdRow">
            <input class="cgdInput" type="datetime-local" data-prazo="${esc(id)}" />
            <button class="cgdBtn" data-save-prazo="${esc(id)}">Salvar prazo</button>
          </div>
        </td>

        <td style="vertical-align:top">
          <div class="cgdRow" style="margin-bottom:8px">
            <button class="cgdBtn" data-move-stage="${esc(id)}" data-stage="QUALIFICADO">Mover: QUALIFICADO 🔥</button>
            <button class="cgdBtn" data-move-stage="${esc(id)}" data-stage="PERDIDO">Mover: PERDIDO</button>
            <button class="cgdBtn" data-move-stage="${esc(id)}" data-stage="CONVERTIDO">Mover: CONVERTIDO</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    const body = `
      <div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:950">FOLLOW-UP + ações em lote</div>
        <div class="cgdRow">
          <input class="cgdInput" id="muSearch" placeholder="Buscar..." />
          <button class="cgdBtn" id="muRefresh">Atualizar</button>
        </div>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Puxados hoje: <b>${esc(hist.pulledToday||0)}</b></div>
        <div class="cgdBadge">Últimos encontrados: <b>${esc((hist.last||[]).length)}</b></div>
        <button class="cgdBtn" id="muBulkQual">QUALIFICAR selecionados 🔥</button>
        <button class="cgdBtn" id="muBulkLost">PERDIDO selecionados</button>
        <button class="cgdBtn" id="muBulkWon">CONVERTIDO selecionados</button>
      </div>

      <table class="cgdTable" id="muTable">
        <thead>
          <tr>
            <th>Lead</th>
            <th>FOLLOW-UP (prazo)</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody id="muTbody">
          ${rows || `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`}
        </tbody>
      </table>
    `;

    openModal(`GERENCIAR USUÁRIA • ${u.name} (${u.id})`, body);

    $("#muRefresh")?.addEventListener("click", async ()=>{
      closeModal();
      await modalManageUser(userId);
    });

    $("#muSearch")?.addEventListener("input", (e)=>{
      const q = String(e.target.value || "").toLowerCase();
      $$("#muTbody tr").forEach(tr=>{
        const t = (tr.querySelector("b.t")?.textContent || "").toLowerCase();
        tr.style.display = t.includes(q) ? "" : "none";
      });
    });

    async function bulkMove(stageKey){
      const ids = $$(`#muTbody input[type=checkbox][data-sel]`)
        .filter(ch => ch.checked)
        .map(ch => String(ch.getAttribute("data-sel")));
      if(ids.length === 0) { setStatus("Selecione pelo menos 1 lead."); return; }

      const stageId =
        stageKey === "QUALIFICADO" ? CONFIG.STAGES.QUALIFICADO :
        stageKey === "PERDIDO" ? CONFIG.STAGES.PERDIDO :
        CONFIG.STAGES.CONVERTIDO;

      try{
        setStatus(`Movendo ${ids.length}…`);
        for(const id of ids){
          await bx("crm.deal.update", { id, fields: { STAGE_ID: stageId } });
          if(stageKey === "QUALIFICADO"){
            await addFireEmojiIfNeeded(id);
            // 🔥 também na lista imediatamente
            const b = document.querySelector(`tr[data-row="${CSS.escape(id)}"] b.t`);
            if(b && !b.textContent.trim().startsWith("🔥")) b.textContent = `🔥 ${b.textContent}`;
          }
          await sleep(80);
        }
        setStatus(`Movidos ✅ ${nowBRTime()}`);
        refreshUsers(); refreshStats();
      }catch(err){
        console.error(err);
        setStatus("Falha ao mover em lote (ver console).");
      }
    }

    $("#muBulkQual")?.addEventListener("click", ()=> bulkMove("QUALIFICADO"));
    $("#muBulkLost")?.addEventListener("click", ()=> bulkMove("PERDIDO"));
    $("#muBulkWon")?.addEventListener("click", ()=> bulkMove("CONVERTIDO"));

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const sp = e.target.closest("[data-save-prazo]");
      const mv = e.target.closest("[data-move-stage]");

      try{
        if(sp){
          const dealId = sp.getAttribute("data-save-prazo");
          const inp = document.querySelector(`input[data-prazo="${CSS.escape(dealId)}"]`);
          const iso = isoFromLocalInput(inp?.value || "");
          if(!iso){ setStatus("Preencha data/hora do follow-up."); return; }

          sp.disabled = true;
          await actionSetPrazoVerified(dealId, iso);
          setStatus(`FOLLOW-UP gravado ✅ ${nowBRTime()}`);
          refreshUsers();
        }

        if(mv){
          const dealId = mv.getAttribute("data-move-stage");
          const stageKey = mv.getAttribute("data-stage");
          const stageId =
            stageKey === "QUALIFICADO" ? CONFIG.STAGES.QUALIFICADO :
            stageKey === "PERDIDO" ? CONFIG.STAGES.PERDIDO :
            CONFIG.STAGES.CONVERTIDO;

          mv.disabled = true;
          await bx("crm.deal.update", { id: dealId, fields: { STAGE_ID: stageId } });
          if(stageKey === "QUALIFICADO"){
            await addFireEmojiIfNeeded(dealId);
            const b = document.querySelector(`tr[data-row="${CSS.escape(dealId)}"] b.t`);
            if(b && !b.textContent.trim().startsWith("🔥")) b.textContent = `🔥 ${b.textContent}`;
          }
          setStatus(`Movido ✅ ${nowBRTime()}`);
          refreshUsers(); refreshStats();
        }
      }catch(err){
        console.error(err);
        setStatus(`Falha ao salvar/mover (ver console).`);
      }finally{
        if(sp) sp.disabled = false;
        if(mv) mv.disabled = false;
      }
    });
  }

  function modalHideUsers() {
    const body = `
      <div style="font-weight:950;margin-bottom:10px">Ocultar/mostrar cards de usuárias</div>
      <table class="cgdTable">
        <thead><tr><th>Mostrar</th><th>Usuária</th></tr></thead>
        <tbody>
          ${CONFIG.USERS.map(u=>{
            const shown = !state.hiddenUsers.has(String(u.id));
            return `
              <tr>
                <td><input type="checkbox" data-hu="${esc(u.id)}" ${shown ? "checked" : ""} /></td>
                <td><b>${esc(u.name)}</b> <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    openModal("OCULTAR USUÁRIAS", body, `
      <button class="cgdBtn" data-close-modal>Fechar</button>
      <button class="cgdBtn" id="huSave">Aplicar</button>
    `);

    $("#huSave")?.addEventListener("click", ()=>{
      const checks = $$(`input[type=checkbox][data-hu]`);
      state.hiddenUsers = new Set(
        checks.filter(ch => !ch.checked).map(ch => String(ch.getAttribute("data-hu")))
      );
      closeModal();
      renderWho(CONFIG.USERS);
    });
  }

  // =========================
  // Refresh
  // =========================
  async function refreshNewLeads() {
    try {
      const items = await fetchNewLeads();

      // beep só quando surge lead novo
      const newest = items && items[0] ? String(items[0].ID) : null;
      if (newest && newest !== state.lastNewLeadId) {
        state.lastNewLeadId = newest;
        if (state.soundOn) tripleBeep();
      }

      state.newLeads = items || [];
      renderNewLeads(state.newLeads);
    } catch (err) {
      // sem banner “sem conexão” (você pediu oculto)
      console.warn("new leads fetch failed", err);
      setStatus("Conexão oscilando… mantendo tela. (sem travar)");
    }
  }

  async function refreshStats() {
    try {
      const s = await fetchStatsPulled();
      state.stats = s;
      renderStats(s);
    } catch (err) {
      console.warn("stats failed", err);
    }
  }

  async function refreshUsers() {
    try {
      await Promise.all(CONFIG.USERS.map(async (u) => {
        state.userStats[u.id] = await fetchUserHistory(u.id);
      }));
      renderWho(CONFIG.USERS);
    } catch (err) {
      console.warn("user stats failed", err);
    }
  }

  async function refreshQueue() {
    try {
      const q = await fetchQueue();
      state.queue = { order: q.order || [], updatedAt: q.updatedAt || 0, dealId: q.dealId };
      renderQueue();
    } catch (err) {
      console.warn("queue failed", err);
    }
  }

  async function hardRefreshAll() {
    setStatus(`Atualizando… (${nowBRTime()})`);
    await Promise.allSettled([refreshNewLeads(), refreshStats(), refreshUsers(), refreshQueue()]);
    setStatus(`Atualizado: ${nowBRTime()}`);
  }

  // =========================
  // Events
  // =========================
  function wire() {
    $("#btnSound")?.addEventListener("click", () => {
      state.soundOn = !state.soundOn;
      $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;
    });

    $("#btnSilence")?.addEventListener("click", () => {
      state.soundOn = false;
      $("#btnSound").textContent = "Som: OFF";
    });

    $("#btnUnsilence")?.addEventListener("click", () => {
      state.soundOn = true;
      $("#btnSound").textContent = "Som: ON";
    });

    $("#btnRefresh")?.addEventListener("click", hardRefreshAll);
    $("#btnRefreshNew")?.addEventListener("click", refreshNewLeads);
    $("#btnRefreshWho")?.addEventListener("click", refreshUsers);

    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);

    $("#btnManage")?.addEventListener("click", () => {
      const opts = CONFIG.USERS
        .map(u => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`)
        .join("");
      openModal("GERENCIAR USUÁRIA", `
        <div class="cgdRow">
          <label style="font-weight:950">Selecione:</label>
          <select class="cgdSelect" id="muSel">${opts}</select>
          <button class="cgdBtn" id="muOpen">Abrir</button>
        </div>
      `);
      $("#muOpen")?.addEventListener("click", () => {
        const id = $("#muSel").value;
        closeModal();
        modalManageUser(id);
      });
    });

    $("#btnQueueBottom")?.addEventListener("click", modalQueue);

    $("#btnNext")?.addEventListener("click", async () => {
      if(state.busyNext) return;
      state.busyNext = true;
      try {
        // “fluido”: troca a fila imediatamente (sem alert)
        const q = state.queue.dealId ? { ...state.queue } : await fetchQueue();
        const order = (q.order || []).slice();
        if (order.length === 0) { setStatus("Fila vazia."); return; }

        order.shift();
        // UI instantânea
        state.queue.order = order;
        renderQueue();
        setStatus(`Próxima atualizada • ${nowBRTime()}`);

        // sincroniza no Bitrix sem travar
        saveQueue(q.dealId || state.queue.dealId, order)
          .then(()=> refreshQueue())
          .catch(()=> setStatus("Falha ao sincronizar fila (tentará no próximo refresh)."));
      } catch (err) {
        console.error(err);
        setStatus("Falha ao trocar próxima (ver console).");
      } finally {
        state.busyNext = false;
      }
    });

    $("#btnQueueReset")?.addEventListener("click", async () => {
      try {
        const q = await fetchQueue();
        await saveQueue(q.dealId, []);
        await refreshQueue();
        setStatus(`Fila resetada • ${nowBRTime()}`);
      } catch (err) {
        console.error(err);
        setStatus("Falha ao resetar fila (ver console).");
      }
    });

    // Delegação botões dos cards
    document.addEventListener("click", async (e) => {
      const g = e.target.closest("[data-grab]");
      const d = e.target.closest("[data-discard]");
      const ou = e.target.closest("[data-open-user]");

      try{
        if (g) {
          const id = g.getAttribute("data-grab");
          modalPickLead(id);
        }
        if (d) {
          const id = d.getAttribute("data-discard");
          // remove da UI imediatamente (fluido)
          state.newLeads = (state.newLeads || []).filter(x => String(x.ID) !== String(id));
          renderNewLeads(state.newLeads);

          // sync
          actionDiscard(id)
            .then(()=>{ refreshStats(); refreshUsers(); })
            .catch((err)=>{ console.error(err); setStatus("Falha ao descartar (ver console)."); refreshNewLeads(); });
        }
        if (ou) {
          const uid = ou.getAttribute("data-open-user");
          modalManageUser(uid);
        }
      }catch(err){
        console.error(err);
        setStatus("Falha (ver console).");
      }
    });
  }

  // =========================
  // Start
  // =========================
  async function start() {
    if (!CONFIG.WEBHOOK) return;

    injectCSS();
    mount();
    wire();

    $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;

    await hardRefreshAll();

    setInterval(refreshNewLeads, CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
