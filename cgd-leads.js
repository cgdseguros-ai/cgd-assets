/*! cgd-leads.js — Painel de Leads CGD (externo, anti-sanitização) */
(function () {
  "use strict";

  // =========================
  // 0) CONFIG
  // =========================
  const CFG = {
    // ✅ Webhook REST (sem barra no final)
    WEBHOOK_BASE: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb",

    // ✅ Campos UF (ATUALIZADOS)
    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD: "UF_CRM_1771333014", // Data/Hora do Lead
    UF_IDADE: "UF_CRM_1771339221",   // Idade (texto)
    UF_BAIRRO: "UF_CRM_LEAD_1731909705398",
    UF_FONTE: "UF_CRM_1767285733843",

    // ✅ STATUS_ID do funil de LEADS (ENTITY_ID = STATUS) — já confirmado por você
    LEAD_STATUS: {
      NEW: "NEW",               // NOVO LEAD
      IN_PROCESS: "IN_PROCESS", // Em atendimento
      QUALIFIED: "UC_0NFA3H",   // Qualificado
      LOST: "UC_5IMTI4",        // Perdido
      WON: "UC_B3RQAF",         // Convertido
      JUNK: "JUNK",             // Lead descartado (system)
    },

    // ✅ Usuárias (fila + picks + KPI)
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

    // Refresh
    REFRESH_MS: 60 * 1000,
    PAGE_SIZE: 50,

    // Fila (persistência local — não depende de Lista Bitrix)
    QUEUE_LOCAL_KEY: "CGD_LEADS_QUEUE_V3",

    // UI links (GET)
    LINKS_GET: {
      DELTA: "https://getcgdcorretora.bitrix24.site/equipedelta/",
      ALPHA: "https://getcgdcorretora.bitrix24.site/equipealpha/",
      BETA: "https://getcgdcorretora.bitrix24.site/equipebeta/",
    },
  };

  // =========================
  // 1) SAFE HELPERS
  // =========================
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    const str = String(s ?? "");
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function isoLocalStartOfDay(d) { return `${ymd(d)}T00:00:00`; }
  function isoLocalStartOfMonth(d) {
    const m = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
    return `${ymd(m)}T00:00:00`;
  }

  function showSentinel(msg) {
    try {
      const s = document.getElementById("cgd-sentinel");
      if (s) s.textContent = msg;
    } catch (_) { }
  }

  function showFatal(err) {
    try {
      const root = document.getElementById("cgd-leads-root") || document.body;
      const e = err && (err.stack || err.message || err);
      root.innerHTML =
        `<div style="padding:14px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial">
          <div style="font-weight:950;font-size:14px;margin-bottom:8px">Falha ao carregar o painel</div>
          <pre style="white-space:pre-wrap;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:12px;max-width:1100px;overflow:auto">${esc(String(e))}</pre>
          <div style="font-size:12px;opacity:.7;margin-top:8px">Abra o console (F12) para mais detalhes.</div>
        </div>`;
    } catch (_) { }
  }

  window.addEventListener("error", (e) => showFatal(e.error || e.message || e));
  window.addEventListener("unhandledrejection", (e) => showFatal(e.reason || e));

  async function bx(method, params) {
    const url = `${CFG.WEBHOOK_BASE}/${method}.json`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.error) throw new Error(`${data.error}: ${data.error_description || ""}`.trim());
    return data.result;
  }

  async function bxListAll(method, params) {
    let start = 0;
    let all = [];
    while (true) {
      const r = await bx(method, { ...(params || {}), start });
      if (!Array.isArray(r)) return all;
      all = all.concat(r);
      if (r.length < CFG.PAGE_SIZE) break;
      start += CFG.PAGE_SIZE;
    }
    return all;
  }

  // =========================
  // 2) QUEUE (LOCAL)
  // =========================
  const Queue = {
    load() {
      try {
        const raw = localStorage.getItem(CFG.QUEUE_LOCAL_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const base = CFG.USERS.map((u) => ({ id: u.id, name: u.name, on: true }));
        if (!Array.isArray(parsed) || !parsed.length) return base;
        // merge + preserve order
        const byId = new Map(parsed.map((x) => [Number(x.id), { id: Number(x.id), name: String(x.name || ""), on: !!x.on }]));
        for (const u of CFG.USERS) {
          if (!byId.has(Number(u.id))) byId.set(Number(u.id), { id: u.id, name: u.name, on: true });
        }
        const order = parsed.map((x) => Number(x.id));
        const merged = Array.from(byId.values());
        merged.sort((a, b) => {
          const ia = order.indexOf(a.id);
          const ib = order.indexOf(b.id);
          return (ia === -1 ? 999999 : ia) - (ib === -1 ? 999999 : ib);
        });
        return merged;
      } catch (_) {
        return CFG.USERS.map((u) => ({ id: u.id, name: u.name, on: true }));
      }
    },
    save(q) {
      try { localStorage.setItem(CFG.QUEUE_LOCAL_KEY, JSON.stringify(q)); } catch (_) { }
    },
    next(q) {
      return (q || []).find((x) => x.on) || null;
    },
    rotateOnPick(q, pickedUserId) {
      const id = Number(pickedUserId);
      const idx = (q || []).findIndex((x) => Number(x.id) === id);
      if (idx === -1) return q;
      const item = q[idx];
      if (!item.on) return q;
      q.splice(idx, 1);
      q.push(item);
      return q;
    },
  };

  // =========================
  // 3) STATE
  // =========================
  const S = {
    mute: false,
    lastNewLeadId: null,
    pendingLeads: [],
    pickedTodayByUser: {}, // {userId:{user,count,last2}}
    queue: null,
    uiReady: false,
  };

  // =========================
  // 4) UI (HTML + CSS)
  // =========================
  function mountUI() {
    const root = document.getElementById("cgd-leads-root") || document.body;
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = `
      :root{
        --bgA:#f7f3ff; --bgB:#f3fbff; --bgC:#fff7fb;
        --border: rgba(30,40,70,.12);
        --text: rgba(18,26,40,.92);
        --muted: rgba(18,26,40,.60);
        --card: rgba(255,255,255,.92);
        --radius: 18px;
        --shadow: 0 14px 40px rgba(10,20,40,.10);
        --danger: #ff2e6a;
        --ok: #16a34a;
        --warn: #f59e0b;
      }
      .cgd-body{
        margin:0;
        font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
        color: var(--text);
        background:
          radial-gradient(900px 600px at 15% 20%, rgba(176,140,255,.25), transparent 55%),
          radial-gradient(900px 600px at 85% 20%, rgba(120,210,255,.25), transparent 55%),
          radial-gradient(900px 650px at 55% 95%, rgba(255,150,200,.18), transparent 60%),
          linear-gradient(135deg, var(--bgA), var(--bgB));
        min-height:100vh;
        padding-bottom: 78px;
      }
      .topbar{
        position: sticky; top:0; z-index: 30;
        display:flex; align-items:center; gap:12px;
        padding:10px 14px;
        backdrop-filter: blur(8px);
        background: rgba(255,255,255,.72);
        border-bottom: 1px solid var(--border);
      }
      .logo{
        height:36px; width:auto; border-radius:10px;
        background:#fff; padding:6px 10px; border:1px solid var(--border);
        box-shadow: 0 10px 20px rgba(0,0,0,.05);
      }
      .title{ font-weight:1000; letter-spacing:.2px; }
      .spacer{ flex:1; }
      .pill{
        display:flex; align-items:center; gap:10px;
        padding:10px 12px; border-radius:999px;
        background: rgba(255,255,255,.9);
        border:1px solid var(--border);
        box-shadow: 0 10px 20px rgba(0,0,0,.05);
        font-weight:850;
        white-space:nowrap;
      }
      .pill small{ font-weight:800; opacity:.75; }
      .pill b{ font-size:16px; }
      .getlinks{
        display:flex; gap:8px; flex-wrap:wrap;
        align-items:center;
      }
      .getlinks a{
        text-decoration:none;
        border:1px solid var(--border);
        background: rgba(255,255,255,.92);
        color: var(--text);
        padding: 8px 10px;
        border-radius: 999px;
        font-weight: 900;
        font-size: 12px;
      }

      /* ===== Layout: LEFT 35% / RIGHT 65% ===== */
      .wrap{
        display:grid;
        grid-template-columns: 35% 65%;
        gap: 12px;
        padding: 12px;
      }
      @media (max-width: 980px){
        .wrap{ grid-template-columns: 1fr; }
      }
      .panel{
        background: rgba(255,255,255,.65);
        border:1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        overflow:hidden;
      }
      .panel-h{
        display:flex; align-items:center; justify-content:space-between;
        padding: 12px 14px;
        border-bottom:1px solid var(--border);
        background: rgba(255,255,255,.75);
      }
      .panel-h h2{
        margin:0;
        font-size: 14px;
        letter-spacing:.2px;
        font-weight: 950;
      }
      .actions{ display:flex; gap:8px; flex-wrap:wrap; }
      .btn{
        border: 1px solid var(--border);
        background: rgba(255,255,255,.95);
        color: var(--text);
        padding: 9px 12px;
        border-radius: 12px;
        font-weight: 900;
        cursor:pointer;
      }
      .btn:hover{ transform: translateY(-1px); }
      .btn.primary{
        background: rgba(15,120,255,.10);
        border-color: rgba(15,120,255,.22);
      }
      .btn.danger{
        background: rgba(255,46,106,.10);
        border-color: rgba(255,46,106,.22);
        color: rgba(120,10,40,.95);
      }

      .alert{
        margin: 12px;
        border-radius: 18px;
        padding: 14px;
        border: 1px solid rgba(255,46,106,.25);
        background: rgba(255,46,106,.08);
        display:none;
        align-items:center; justify-content:space-between; gap:10px;
      }
      .alert .left{ display:flex; flex-direction:column; gap:4px; }
      .alert .title2{ font-size: 16px; font-weight: 1000; letter-spacing: .2px; }
      .alert .sub{ font-size: 12px; opacity:.8; font-weight: 800; }
      .blink{ animation: blink 1s infinite; }
      @keyframes blink{
        0%,100%{ filter: saturate(1); box-shadow: none; }
        50%{ filter: saturate(2); box-shadow: 0 0 0 6px rgba(255,46,106,.12); }
      }

      .cards{
        padding: 0 12px 12px 12px;
        display:flex; flex-direction:column; gap:10px;
      }
      .card{
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 12px;
        display:grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .name{ font-size: 13px; font-weight: 1000; }
      .row{
        display:flex; flex-wrap:wrap; gap:8px;
        font-size: 11px; font-weight: 850;
      }
      .tag{
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,.85);
      }
      .tag strong{ font-weight: 1000; }
      .muted{ opacity: .75; font-weight: 800; }
      .ctaRow{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

      /* RIGHT: Users */
      .users{
        padding: 12px;
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      @media (max-width: 980px){
        .users{ grid-template-columns: 1fr; }
      }
      .userbox{
        background: rgba(255,255,255,.92);
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow:hidden;
      }
      .uh{
        padding: 10px 12px;
        display:flex; align-items:center; justify-content:space-between;
        border-bottom: 1px solid var(--border);
        background: rgba(255,255,255,.8);
        font-weight: 950;
      }
      .uh small{ font-weight: 900; opacity:.75; }
      .mini{
        padding: 10px 12px;
        display:flex; flex-direction:column; gap:8px;
      }
      .mcard{
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 10px;
        background: rgba(255,255,255,.92);
      }
      .mcard .row{ font-size: 11px; }

      .footerHint{ padding: 0 14px 14px 14px; font-size: 12px; opacity:.75; font-weight: 850; }
      .ok{ color: var(--ok); font-weight: 1000; }
      .warn{ color: var(--warn); font-weight: 1000; }
      .dangerText{ color: var(--danger); font-weight: 1000; }

      /* Modal */
      .modal-backdrop{
        position: fixed; inset:0; z-index: 60;
        background: rgba(0,0,0,.35);
        display:none;
        align-items:center; justify-content:center;
        padding: 16px;
      }
      .modal{
        width: min(920px, 96vw);
        max-height: 88vh;
        overflow:auto;
        background: rgba(255,255,255,.96);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 30px 80px rgba(0,0,0,.25);
      }
      .mh{
        position: sticky; top:0;
        display:flex; align-items:center; justify-content:space-between;
        gap:10px;
        padding: 12px 14px;
        border-bottom:1px solid var(--border);
        background: rgba(255,255,255,.96);
      }
      .mh h3{ margin:0; font-size: 14px; font-weight: 1000; }
      .mb{ padding: 14px; display:flex; flex-direction:column; gap:12px; }
      .grid2{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
      @media (max-width: 820px){ .grid2{ grid-template-columns: 1fr; } }
      .field label{ display:block; font-weight: 950; font-size: 12px; margin-bottom:6px; opacity:.85; }
      select, input{
        width:100%;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,.95);
        font-weight: 850;
      }
      table{
        width:100%;
        border-collapse: collapse;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(255,255,255,.92);
        overflow:hidden;
      }
      th, td{
        padding: 10px 10px;
        border-bottom: 1px solid var(--border);
        font-size: 12px;
        vertical-align: top;
      }
      th{
        text-align:left;
        font-weight: 1000;
        background: rgba(255,255,255,.85);
      }
      tr:last-child td{ border-bottom: none; }
      .chk{ width:18px; height:18px; }

      /* Bottom queue bar */
      .bottombar{
        position: fixed; left:0; right:0; bottom:0;
        z-index: 40;
        display:flex; align-items:center; gap:12px;
        padding: 10px 12px;
        background: rgba(255,255,255,.80);
        backdrop-filter: blur(10px);
        border-top: 1px solid var(--border);
      }
      .qb-left{ display:flex; flex-direction:column; gap:2px; min-width: 220px; }
      .qb-title{ font-weight: 1000; }
      .qb-sub{ font-size: 12px; opacity:.75; font-weight: 850; }
      .qb-list{
        flex: 1;
        display:flex;
        gap: 10px;
        overflow:auto;
        padding: 2px 2px;
      }
      .qb-item{
        display:flex; align-items:center; gap:8px;
        padding: 8px 10px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,.92);
        min-width: 220px;
      }
      .qb-name{ font-weight: 1000; font-size: 13px; }
      .qb-meta{ font-size: 11px; opacity:.75; font-weight: 900; }
      .qb-col{ display:flex; flex-direction:column; gap:2px; }
      .qb-controls{ margin-left:auto; display:flex; align-items:center; gap:8px; }
      .qb-toggle{
        display:flex; align-items:center; gap:6px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,.95);
        cursor:pointer;
        font-weight: 1000;
        font-size: 12px;
        white-space: nowrap;
      }
      .qb-toggle.off{ opacity: .55; text-decoration: line-through; }
      .qb-arrows{ display:flex; flex-direction:column; gap:4px; }
      .qb-arrows button{
        width: 28px; height: 24px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,.95);
        cursor:pointer;
        font-weight: 1000;
      }
    `;

    const app = document.createElement("div");
    app.className = "cgd-body";
    app.innerHTML = `
      <div class="topbar">
        <img class="logo" alt="CGD" src="https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=5ox8rtwqtdfv"/>
        <div class="title">PAINEL DE LEADS - CGD CORRETORA</div>
        <div class="spacer"></div>

        <div class="getlinks" title="GET das equipes">
          <a href="${esc(CFG.LINKS_GET.DELTA)}" target="_blank" rel="noopener">GET • DELTA</a>
          <a href="${esc(CFG.LINKS_GET.ALPHA)}" target="_blank" rel="noopener">GET • ALPHA</a>
          <a href="${esc(CFG.LINKS_GET.BETA)}" target="_blank" rel="noopener">GET • BETA</a>
        </div>

        <div class="pill" title="Leads puxados hoje (por vendedoras), via DATE_MODIFY">
          <small>Leads do dia</small> <b id="kpi-day">0</b>
        </div>
        <div class="pill" title="Leads puxados no mês (por vendedoras), via DATE_MODIFY">
          <small>Leads do mês</small> <b id="kpi-month">0</b>
        </div>
      </div>

      <div class="wrap">
        <!-- LEFT -->
        <div class="panel">
          <div class="panel-h">
            <h2>NOVOS LEADS • PENDENTES</h2>
            <div class="actions">
              <button class="btn primary" id="btn-batch">Transferir em lote</button>
              <button class="btn" id="btn-refresh">Atualizar</button>
            </div>
          </div>

          <div id="newLeadAlert" class="alert">
            <div class="left">
              <div class="title2 blink">🚨 NOVO LEAD</div>
              <div class="sub">Alerta sonoro + piscante (enquanto existir lead em “NOVO LEAD”).</div>
            </div>
            <button class="btn danger" id="btn-mute">Silenciar</button>
          </div>

          <div class="cards" id="highlight"></div>
          <div class="cards" id="pending"></div>
          <div class="footerHint" id="hint"></div>
        </div>

        <!-- RIGHT -->
        <div class="panel">
          <div class="panel-h">
            <h2>QUEM PEGOU HOJE</h2>
            <div class="actions">
              <button class="btn" id="btn-refresh-right">Atualizar</button>
            </div>
          </div>
          <div class="users" id="users"></div>
          <div class="footerHint">
            Contagem “puxados” = leads atribuídos/movidos hoje (aprox. via <b>DATE_MODIFY</b>).
          </div>
        </div>
      </div>

      <!-- MODAL: PEGAR -->
      <div class="modal-backdrop" id="modalPickBack">
        <div class="modal">
          <div class="mh">
            <h3>Transferir Lead</h3>
            <button class="btn" id="btn-pick-close">Fechar</button>
          </div>
          <div class="mb">
            <div class="grid2">
              <div class="field">
                <label>Vendedora (responsável)</label>
                <select id="pickUser"></select>
              </div>
              <div class="field">
                <label>Etapa ao pegar</label>
                <input id="pickStage" disabled/>
                <div class="footerHint" style="padding:6px 0 0 0;margin:0;">
                  Ao “pegar”, o lead vira <b>Em atendimento</b>.
                </div>
              </div>
            </div>
            <div id="pickLeadPreview" class="footerHint" style="padding:0;margin:0;"></div>
            <button class="btn primary" id="btn-confirm-pick">Confirmar transferência</button>
            <div class="footerHint" id="pickStatus" style="padding:0;margin:0;"></div>
          </div>
        </div>
      </div>

      <!-- MODAL: LOTE -->
      <div class="modal-backdrop" id="modalBatchBack">
        <div class="modal">
          <div class="mh">
            <h3>Transferência em lote</h3>
            <button class="btn" id="btn-batch-close">Fechar</button>
          </div>
          <div class="mb">
            <div class="grid2">
              <div class="field">
                <label>Vendedora (responsável)</label>
                <select id="batchUser"></select>
              </div>
              <div class="field">
                <label>Ordenar por</label>
                <select id="batchSort">
                  <option value="DT_DESC">DIA E HORA (mais novo primeiro)</option>
                  <option value="DT_ASC">DIA E HORA (mais antigo primeiro)</option>
                  <option value="OP_ASC">OPERADORA (A→Z)</option>
                  <option value="OP_DESC">OPERADORA (Z→A)</option>
                </select>
              </div>
            </div>

            <div class="footerHint" style="padding:0;margin:0;">
              Selecione vários leads pendentes e clique em <b>Transferir selecionados</b>.
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn" id="btn-batch-selectall">Selecionar todos</button>
              <button class="btn" id="btn-batch-clear">Limpar seleção</button>
              <button class="btn primary" id="btn-batch-transfer">Transferir selecionados</button>
            </div>

            <div id="batchStatus" class="footerHint" style="padding:0;margin:0;"></div>

            <table>
              <thead>
                <tr>
                  <th style="width:42px;"></th>
                  <th>DIA E HORA</th>
                  <th>NOME</th>
                  <th>TELEFONE</th>
                  <th>BAIRRO</th>
                  <th>IDADE</th>
                  <th>OPERADORA</th>
                  <th>LEAD FONTE</th>
                </tr>
              </thead>
              <tbody id="batchTbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- BOTTOM: FILA -->
      <div class="bottombar" id="queueBar">
        <div class="qb-left">
          <div class="qb-title">Fila de atendimento</div>
          <div class="qb-sub" id="queueHint">Carregando fila...</div>
        </div>
        <div class="qb-list" id="queueList"></div>
        <div style="display:flex; gap:8px;">
          <button class="btn" id="btn-queue-reset">Resetar</button>
          <button class="btn primary" id="btn-queue-next">Próxima disponível</button>
        </div>
      </div>
    `;

    root.appendChild(style);
    root.appendChild(app);
  }

  // =========================
  // 5) SOUND + ALERT
  // =========================
  function beep() {
    if (S.mute) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 180);
    } catch (_) { }
  }

  // =========================
  // 6) RENDER HELPERS
  // =========================
  function renderLeadLine(lead) {
    const nm = esc(lead.NAME || lead.TITLE || "—");
    const op = esc(lead[CFG.UF_OPERADORA] || "—");
    const dt = esc(lead[CFG.UF_DT_LEAD] || lead.DATE_CREATE || "—");
    return `
      <div class="name">${nm}</div>
      <div class="row">
        <div class="tag"><strong>OPERADORA:</strong> ${op}</div>
        <div class="tag"><strong>DATA/HORA:</strong> ${dt}</div>
      </div>
    `;
  }

  function renderLeadDetailsCompact(lead) {
    const nm = esc(lead.NAME || lead.TITLE || "—");
    const op = esc(lead[CFG.UF_OPERADORA] || "—");
    const dt = esc(lead[CFG.UF_DT_LEAD] || lead.DATE_CREATE || "—");
    const age = esc(lead[CFG.UF_IDADE] || "—");
    const bairro = esc(lead[CFG.UF_BAIRRO] || "—");
    const fonte = esc(lead[CFG.UF_FONTE] || "—");
    return `
      <div><b>${nm}</b></div>
      <div class="row">
        <div class="tag"><strong>OPERADORA:</strong> ${op}</div>
        <div class="tag"><strong>DATA/HORA:</strong> ${dt}</div>
        <div class="tag"><strong>IDADE:</strong> ${age}</div>
        <div class="tag"><strong>FONTE:</strong> ${fonte}</div>
        <div class="tag"><strong>BAIRRO:</strong> ${bairro}</div>
        <div class="tag"><strong>ID:</strong> ${esc(lead.ID)}</div>
      </div>
    `;
  }

  function fillUserSelects() {
    const opts = CFG.USERS
      .map((u) => `<option value="${u.id}">${esc(u.name)} (ID ${u.id})</option>`)
      .join("");
    $("#pickUser").innerHTML = `<option value="">Selecione...</option>` + opts;
    $("#batchUser").innerHTML = `<option value="">Selecione...</option>` + opts;
  }

  // =========================
  // 7) DATA (LEADS)
  // =========================
  async function fetchPendingLeads() {
    const select = [
      "ID", "TITLE", "NAME", "ASSIGNED_BY_ID", "STATUS_ID", "DATE_CREATE", "DATE_MODIFY",
      CFG.UF_OPERADORA, CFG.UF_DT_LEAD, CFG.UF_IDADE, CFG.UF_BAIRRO, CFG.UF_FONTE,
      "PHONE",
    ];

    const leads = await bxListAll("crm.lead.list", {
      order: { "ID": "DESC" },
      filter: { "STATUS_ID": CFG.LEAD_STATUS.NEW },
      select,
    });

    // ordena por Data/Hora do Lead (UF), se existir, senão por DATE_CREATE
    leads.sort((a, b) => {
      const da = String(a[CFG.UF_DT_LEAD] || a.DATE_CREATE || "");
      const db = String(b[CFG.UF_DT_LEAD] || b.DATE_CREATE || "");
      return db.localeCompare(da);
    });

    S.pendingLeads = leads;
    return leads;
  }

  async function fetchPickedKPIs() {
    const today = new Date();
    const startDay = isoLocalStartOfDay(today);
    const startMonth = isoLocalStartOfMonth(today);

    let dayTotal = 0, monthTotal = 0;
    const perUser = {};

    for (const u of CFG.USERS) {
      // Hoje: atribuídos a u, modificados hoje e NÃO estão mais em NOVO LEAD
      const listToday = await bxListAll("crm.lead.list", {
        order: { "DATE_MODIFY": "DESC" },
        filter: {
          "ASSIGNED_BY_ID": u.id,
          ">=DATE_MODIFY": startDay,
          "!STATUS_ID": CFG.LEAD_STATUS.NEW,
        },
        select: ["ID", "TITLE", "NAME", "DATE_MODIFY", CFG.UF_OPERADORA, CFG.UF_DT_LEAD],
      });

      if (listToday.length) {
        perUser[u.id] = { user: u, count: listToday.length, last2: listToday.slice(0, 2) };
        dayTotal += listToday.length;
      }

      const listMonth = await bxListAll("crm.lead.list", {
        order: { "DATE_MODIFY": "DESC" },
        filter: {
          "ASSIGNED_BY_ID": u.id,
          ">=DATE_MODIFY": startMonth,
          "!STATUS_ID": CFG.LEAD_STATUS.NEW,
        },
        select: ["ID"],
      });

      monthTotal += listMonth.length;
    }

    S.pickedTodayByUser = perUser;
    $("#kpi-day").textContent = String(dayTotal);
    $("#kpi-month").textContent = String(monthTotal);
  }

  // =========================
  // 8) ACTIONS (LEADS)
  // =========================
  async function pickLeadToUser(leadId, userId) {
    await bx("crm.lead.update", {
      id: leadId,
      fields: { ASSIGNED_BY_ID: Number(userId), STATUS_ID: CFG.LEAD_STATUS.IN_PROCESS },
    });
  }

  async function discardLead(leadId) {
    // ✅ “Excluir o card” = mover o Lead para "Lead descartado" (JUNK) e ele some do NOVO LEAD
    await bx("crm.lead.update", {
      id: leadId,
      fields: { STATUS_ID: CFG.LEAD_STATUS.JUNK },
    });
  }

  async function batchTransfer(ids, userId) {
    const statusEl = $("#batchStatus");
    statusEl.textContent = `Transferindo ${ids.length} lead(s)...`;

    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        await bx("crm.lead.update", {
          id,
          fields: { ASSIGNED_BY_ID: Number(userId), STATUS_ID: CFG.LEAD_STATUS.IN_PROCESS },
        });
        ok++;
      } catch (_) {
        fail++;
      }
    }
    statusEl.innerHTML = `<span class="ok">OK: ${ok}</span> • <span class="dangerText">Falhas: ${fail}</span>`;
  }

  // =========================
  // 9) RENDER (LEFT/RIGHT)
  // =========================
  function renderCard(lead, highlight) {
    const d = document.createElement("div");
    d.className = "card" + (highlight ? " blink" : "");
    d.innerHTML = `
      <div>${renderLeadLine(lead)}</div>
      <div class="ctaRow">
        <button class="btn primary" data-act="pick">PEGAR</button>
        <button class="btn danger" data-act="discard">DESCARTAR</button>
        <span class="muted" style="font-size:12px;">ID: ${esc(lead.ID)}</span>
      </div>
    `;

    d.querySelector('[data-act="pick"]').addEventListener("click", () => UI.openPick(lead));
    d.querySelector('[data-act="discard"]').addEventListener("click", async () => {
      const ok = confirm("Descartar este lead? (Ele sairá de NOVO LEAD e irá para 'Lead descartado')");
      if (!ok) return;
      try {
        $("#hint").innerHTML = `Descartando lead <b>${esc(lead.ID)}</b>...`;
        await discardLead(lead.ID);
        await refreshAll();
      } catch (e) {
        $("#hint").innerHTML = `<span class="dangerText">Erro ao descartar:</span> ${esc(e.message || e)}`;
      }
    });

    return d;
  }

  function renderLeft(leads) {
    $("#highlight").innerHTML = "";
    $("#pending").innerHTML = "";

    const hasNew = leads && leads.length;
    const alertEl = $("#newLeadAlert");
    if (alertEl) alertEl.style.display = hasNew ? "flex" : "none";

    if (!hasNew) {
      $("#hint").innerHTML = `Sem leads em <b>NOVO LEAD</b> agora.`;
      return;
    }

    const top = leads[0];
    $("#highlight").appendChild(renderCard(top, true));
    for (const lead of leads.slice(1)) $("#pending").appendChild(renderCard(lead, false));

    const newId = String(top.ID || "");
    if (newId && S.lastNewLeadId !== newId) {
      S.lastNewLeadId = newId;
      beep();
    }

    $("#hint").innerHTML = `Total pendentes: <b>${leads.length}</b> • Atualiza a cada <b>${Math.round(CFG.REFRESH_MS / 1000)}s</b>.`;
  }

  function renderUsers() {
    const root = $("#users");
    root.innerHTML = "";

    const entries = Object.values(S.pickedTodayByUser || {});
    if (!entries.length) {
      root.innerHTML = `<div class="footerHint" style="grid-column:1/-1;">Nenhuma usuária puxou lead hoje ainda.</div>`;
      return;
    }

    // Ordena: quem puxou mais recentemente primeiro (usa DATE_MODIFY do last2[0] se houver)
    entries.sort((a, b) => {
      const da = String((a.last2 && a.last2[0] && (a.last2[0][CFG.UF_DT_LEAD] || a.last2[0].DATE_MODIFY)) || "");
      const db = String((b.last2 && b.last2[0] && (b.last2[0][CFG.UF_DT_LEAD] || b.last2[0].DATE_MODIFY)) || "");
      return db.localeCompare(da);
    });

    for (const it of entries) {
      const box = document.createElement("div");
      box.className = "userbox";
      box.innerHTML = `
        <div class="uh">
          <div>${esc(it.user.name)} <small>(ID ${it.user.id})</small></div>
          <div><small>Puxados hoje:</small> <b>${it.count}</b></div>
        </div>
        <div class="mini"></div>
      `;
      const mini = $(".mini", box);
      for (const lead of it.last2) {
        const m = document.createElement("div");
        m.className = "mcard";
        m.innerHTML = renderLeadLine(lead);
        mini.appendChild(m);
      }
      root.appendChild(box);
    }
  }

  // =========================
  // 10) BATCH TABLE
  // =========================
  function renderBatchTable() {
    const tbody = $("#batchTbody");
    tbody.innerHTML = "";

    const sort = $("#batchSort").value;
    const arr = [...(S.pendingLeads || [])];

    arr.sort((a, b) => {
      const dta = String(a[CFG.UF_DT_LEAD] || a.DATE_CREATE || "");
      const dtb = String(b[CFG.UF_DT_LEAD] || b.DATE_CREATE || "");
      const opa = String(a[CFG.UF_OPERADORA] || "");
      const opb = String(b[CFG.UF_OPERADORA] || "");
      if (sort === "DT_ASC") return dta.localeCompare(dtb);
      if (sort === "DT_DESC") return dtb.localeCompare(dta);
      if (sort === "OP_ASC") return opa.localeCompare(opb);
      if (sort === "OP_DESC") return opb.localeCompare(opa);
      return 0;
    });

    for (const lead of arr) {
      const phone =
        (lead.PHONE && lead.PHONE[0] && lead.PHONE[0].VALUE) ? lead.PHONE[0].VALUE : "";
      const tr = document.createElement("tr");
      tr.dataset.id = lead.ID;
      tr.innerHTML = `
        <td><input class="chk" type="checkbox"/></td>
        <td>${esc(lead[CFG.UF_DT_LEAD] || lead.DATE_CREATE || "—")}</td>
        <td>${esc(lead.NAME || lead.TITLE || "—")}</td>
        <td>${esc(phone || "—")}</td>
        <td>${esc(lead[CFG.UF_BAIRRO] || "—")}</td>
        <td>${esc(lead[CFG.UF_IDADE] || "—")}</td>
        <td>${esc(lead[CFG.UF_OPERADORA] || "—")}</td>
        <td>${esc(lead[CFG.UF_FONTE] || "—")}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function getSelectedBatchIds() {
    const ids = [];
    $$("#batchTbody tr").forEach((r) => {
      const chk = $('input[type="checkbox"]', r);
      if (chk && chk.checked) ids.push(r.dataset.id);
    });
    return ids;
  }

  // =========================
  // 11) QUEUE RENDER
  // =========================
  function applyNextToPickModal() {
    const next = Queue.next(S.queue);
    if (!next) return false;
    const sel = $("#pickUser");
    if (!sel) return false;
    sel.value = String(next.id);
    return true;
  }

  function renderQueue() {
    const root = $("#queueList");
    root.innerHTML = "";

    const q = S.queue || [];
    q.forEach((item, idx) => {
      const div = document.createElement("div");
      div.className = "qb-item";
      div.innerHTML = `
        <div class="qb-col">
          <div class="qb-name">${esc(item.name)}</div>
          <div class="qb-meta">ID ${esc(item.id)} • #${idx + 1}</div>
        </div>
        <div class="qb-controls">
          <div class="qb-arrows">
            <button title="Subir" data-act="up">↑</button>
            <button title="Descer" data-act="down">↓</button>
          </div>
          <button class="qb-toggle ${item.on ? "" : "off"}" data-act="toggle">
            ${item.on ? "Disponível" : "Indisponível"}
          </button>
        </div>
      `;

      $$("button", div).forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = btn.dataset.act;
          if (act === "up" && idx > 0) {
            [q[idx - 1], q[idx]] = [q[idx], q[idx - 1]];
            Queue.save(q); renderQueue();
          }
          if (act === "down" && idx < q.length - 1) {
            [q[idx + 1], q[idx]] = [q[idx], q[idx + 1]];
            Queue.save(q); renderQueue();
          }
          if (act === "toggle") {
            q[idx].on = !q[idx].on;
            Queue.save(q); renderQueue();
          }
        });
      });

      root.appendChild(div);
    });

    const next = Queue.next(q);
    const hint = $("#queueHint");
    hint.textContent = next
      ? `Próxima disponível: ${next.name} (ID ${next.id}).`
      : `Nenhuma disponível. Ative alguém na fila.`;
  }

  // =========================
  // 12) MODALS + UI API
  // =========================
  const UI = {
    _pickLead: null,
    openPick(lead) {
      this._pickLead = lead;
      $("#pickStage").value = "Em atendimento";
      $("#pickLeadPreview").innerHTML = renderLeadDetailsCompact(lead);
      $("#pickStatus").textContent = "";
      $("#modalPickBack").style.display = "flex";
      applyNextToPickModal();
    },
    closePick() {
      $("#modalPickBack").style.display = "none";
      this._pickLead = null;
    },
    openBatch() {
      $("#batchStatus").textContent = "";
      $("#modalBatchBack").style.display = "flex";
      renderBatchTable();
    },
    closeBatch() {
      $("#modalBatchBack").style.display = "none";
    },
  };

  // =========================
  // 13) REFRESH
  // =========================
  async function refreshRight() {
    try {
      await fetchPickedKPIs();
      renderUsers();
    } catch (e) {
      console.warn(e);
    }
  }

  async function refreshAll() {
    try {
      $("#hint").textContent = "Atualizando...";
      const leads = await fetchPendingLeads();
      renderLeft(leads);
      await refreshRight();
    } catch (e) {
      $("#hint").innerHTML = `<span class="dangerText">Erro:</span> ${esc(e.message || e)}`;
    }
  }

  // =========================
  // 14) EVENTS
  // =========================
  function wire() {
    fillUserSelects();

    $("#btn-refresh").addEventListener("click", refreshAll);
    $("#btn-refresh-right").addEventListener("click", refreshRight);

    $("#btn-mute").addEventListener("click", () => {
      S.mute = !S.mute;
      $("#btn-mute").textContent = S.mute ? "Ativar som" : "Silenciar";
    });

    $("#btn-batch").addEventListener("click", () => UI.openBatch());
    $("#batchSort").addEventListener("change", renderBatchTable);

    $("#btn-batch-selectall").addEventListener("click", () => {
      $$("#batchTbody input[type=checkbox]").forEach((c) => (c.checked = true));
    });
    $("#btn-batch-clear").addEventListener("click", () => {
      $$("#batchTbody input[type=checkbox]").forEach((c) => (c.checked = false));
    });
    $("#btn-batch-transfer").addEventListener("click", async () => {
      const userId = $("#batchUser").value;
      const ids = getSelectedBatchIds();
      if (!userId) return ($("#batchStatus").innerHTML = `<span class="warn">Selecione a vendedora.</span>`);
      if (!ids.length) return ($("#batchStatus").innerHTML = `<span class="warn">Selecione ao menos 1 lead.</span>`);
      await batchTransfer(ids, userId);
      await refreshAll();
    });

    $("#btn-pick-close").addEventListener("click", () => UI.closePick());
    $("#btn-batch-close").addEventListener("click", () => UI.closeBatch());

    $("#modalPickBack").addEventListener("click", (e) => { if (e.target.id === "modalPickBack") UI.closePick(); });
    $("#modalBatchBack").addEventListener("click", (e) => { if (e.target.id === "modalBatchBack") UI.closeBatch(); });

    $("#btn-confirm-pick").addEventListener("click", async () => {
      const lead = UI._pickLead;
      const userId = $("#pickUser").value;
      if (!lead) return;
      if (!userId) return ($("#pickStatus").innerHTML = `<span class="warn">Selecione a vendedora.</span>`);
      $("#pickStatus").textContent = "Transferindo...";
      try {
        await pickLeadToUser(lead.ID, userId);

        // ✅ ao pegar: move a vendedora para o final da fila automaticamente
        S.queue = Queue.rotateOnPick(S.queue, userId);
        Queue.save(S.queue);
        renderQueue();

        $("#pickStatus").innerHTML = `<span class="ok">Transferido com sucesso.</span>`;
        setTimeout(() => UI.closePick(), 450);
        await refreshAll();
      } catch (e) {
        $("#pickStatus").innerHTML = `<span class="dangerText">Erro:</span> ${esc(e.message || e)}`;
      }
    });

    // queue bar
    $("#btn-queue-reset").addEventListener("click", () => {
      S.queue = CFG.USERS.map((u) => ({ id: u.id, name: u.name, on: true }));
      Queue.save(S.queue);
      renderQueue();
      applyNextToPickModal();
    });
    $("#btn-queue-next").addEventListener("click", () => {
      applyNextToPickModal();
      renderQueue();
    });
  }

  // =========================
  // 15) INIT (DOM SAFE)
  // =========================
  async function init() {
    showSentinel("JS iniciou ✅");
    mountUI();

    S.queue = Queue.load();
    Queue.save(S.queue);
    renderQueue();

    wire();
    await refreshAll();
    setInterval(refreshAll, CFG.REFRESH_MS);
  }

  // DOM ready (garante que modais/botões existam)
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  } catch (e) {
    showFatal(e);
  }
})();
