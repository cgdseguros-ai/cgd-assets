(function(){
  "use strict";

  // =========================
  // CONFIG
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    UF_PRAZO: "UF_CRM_1768175087",

    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD:   "UF_CRM_1771333014",
    UF_IDADE:     "UF_CRM_1771339221",
    UF_BAIRRO:    "UF_CRM_LEAD_1731909705398",
    UF_FONTE_TXT: "UF_CRM_1767285733843",

    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",
      UF_QUEUE_JSON: "UF_CRM_1771293519",
      TITLE_KEY: "__QUEUE__CGD__"
    },

    DEAL_PIPELINE17: {
      CATEGORY_ID: 17,
      STAGE_BY_USER: {
        "15":   "C17:UC_FQ8UPI",
        "19":   "C17:UC_1HXNTB",
        "17":   "C17:UC_RRQKAQ",
        "23":   "C17:UC_4HQGI1",
        "811":  "C17:UC_8Y4R4V",
        "3081": "C17:EXECUTING",
        "3083": "C17:UC_8O5UFO",
        "3079": "C17:UC_P1P9RJ",
        "3085": "C17:UC_U8AAGB",
        "3389": "C17:UC_A6LSS8",
        "815":  "C17:UC_ZT6WEB",
        "3387": "C17:UC_RXISLQ"
      }
    },

    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=e6lxlp1bz9nz",

    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 9000,
    REFRESH_QUEUE_MS: 2500,
    REFRESH_WHO_MS: 9000,

    LIMIT_NEW_DISPLAY: 30,
    LIMIT_NEW_FETCH_MAX: 4000,     // pode subir se precisar
    LIMIT_USER_HISTORY_PAGE: 40,   // para ABRIR abrir rápido

    USERS: [
      { name:"ALINE", id:15 },
      { name:"ADRIANA", id:19 },
      { name:"ANDREYNA", id:17 },
      { name:"MARIANA", id:23 },
      { name:"JOSIANE", id:811 },
      { name:"BRUNA LUISA", id:3081 },
      { name:"FERNANDA SILVA", id:3083 },
      { name:"LIVIA ALVES", id:3079 },
      { name:"NICOLLE BELMONTE", id:3085 },
      { name:"ANNA CLARA", id:3389 },
      { name:"GABRIEL", id:815 },
      { name:"BEATRIZ", id:3387 }
    ],

    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      QUALIFICADO: "UC_0NFA3H",
      PERDIDO: "UC_5IMTI4",
      CONVERTIDO: "UC_B3RQAF"
    },

    LEAD_STATUS_NAME: {
      "NEW": "NOVO LEAD",
      "IN_PROCESS": "EM ATENDIMENTO",
      "UC_0NFA3H": "QUALIFICADO",
      "UC_5IMTI4": "PERDIDO",
      "UC_B3RQAF": "CONVERTIDO",
      "CONVERTED": "LEAD CONVERTIDO",
      "JUNK": "DESCARTADO"
    },

    LEAD_SELECT: [
      "ID","TITLE","NAME","LAST_NAME","SECOND_NAME",
      "STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
      "PHONE","EMAIL",
      "UF_CRM_1771282782",
      "UF_CRM_1771333014",
      "UF_CRM_1771339221",
      "UF_CRM_LEAD_1731909705398",
      "UF_CRM_1767285733843",
      "UF_*"
    ],

    HOT_EMOJI: "🔥",

    // ✅ URLs corretas
    GET_LINKS: [
      { label: "EQ. DELTA", url: "https://getcgdcorretora.bitrix24.site/equipedelta/" },
      { label: "EQ. BETA",  url: "https://getcgdcorretora.bitrix24.site/equipebeta/" },
      { label: "EQ. ALPHA", url: "https://getcgdcorretora.bitrix24.site/equipeALPHA/" }
    ]
  };

  // =========================
  // Helpers
  // =========================
  const $ = (q, el=document)=> el.querySelector(q);
  const $$ = (q, el=document)=> Array.from(el.querySelectorAll(q));
  const esc = (s)=> String(s??"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
  const pad2 = (n)=> String(n).padStart(2,"0");
  const nowBR = ()=> { try{ return new Date().toLocaleTimeString("pt-BR"); }catch(_){ return ""; } };

  function todayISOStart(){
    const d = new Date();
    d.setHours(0,0,0,0);
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T00:00:00`;
  }
  function monthISOStart(){
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-01T00:00:00`;
  }

  function isoFromLocalInput(v){
    if(!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!m) return "";
    const dt = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], 0, 0);
    if(Number.isNaN(dt.getTime())) return "";
    return dt.toISOString();
  }

  function parseLeadDateAny(v){
    const s = String(v||"").trim();
    if(!s) return null;
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if(m){
      const dd=+m[1], mm=+m[2]-1, yy=+m[3], hh=+(m[4]||"0"), mi=+(m[5]||"0");
      const dt = new Date(yy, mm, dd, hh, mi, 0, 0);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const t = Date.parse(s);
    if(Number.isFinite(t)){
      const dt = new Date(t);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    return null;
  }
  function formatBRDate(dt){
    if(!dt) return "";
    return `${pad2(dt.getDate())}/${pad2(dt.getMonth()+1)}/${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  }
  function dayKey(dt){
    if(!dt) return "";
    return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
  }

  function leadDisplayName(it){
    const n = [it.NAME, it.LAST_NAME].filter(Boolean).map(String).join(" ").trim();
    if(n) return n;
    const t = String(it.TITLE||"").trim();
    if(t) return t;
    return `Lead #${it.ID}`;
  }

  function getUF(it, key){ return it ? it[key] : null; }

  // =========================
  // Bitrix client — FIX PAGINAÇÃO (CRÍTICO)
  // =========================
  function toPairs(prefix, obj, out){
    out = out || [];
    if(obj === null || obj === undefined) return out;
    if(typeof obj === "object" && !Array.isArray(obj)){
      for(const k of Object.keys(obj)){
        const key = prefix ? `${prefix}[${k}]` : k;
        toPairs(key, obj[k], out);
      }
      return out;
    }
    if(Array.isArray(obj)){
      for(let i=0;i<obj.length;i++){
        const key = prefix ? `${prefix}[${i}]` : String(i);
        toPairs(key, obj[i], out);
      }
      return out;
    }
    out.push([prefix, String(obj)]);
    return out;
  }

  async function bxRaw(method, params={}){
    const pairs = toPairs("", params, []);
    const body = new URLSearchParams();
    for(const [k,v] of pairs){ if(k) body.append(k, v); }

    const resp = await fetch(CONFIG.WEBHOOK + method, {
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},
      body
    });

    const data = await resp.json().catch(()=> ({}));
    if(!resp.ok) throw new Error(`HTTP ${resp.status} em ${method}`);
    if(data && data.error) throw new Error(data.error_description || data.error);
    return data; // <- devolve TUDO (result/total/next)
  }

  async function bx(method, params={}){
    const data = await bxRaw(method, params);
    return data.result;
  }

  // Paginação universal Bitrix (usa data.next quando existir)
  async function bxListAll(method, params, max=2000){
    let start = 0;
    let out = [];
    let total = null;

    while(true){
      const data = await bxRaw(method, { ...params, start });
      const part = Array.isArray(data.result) ? data.result : [];
      if(total === null && typeof data.total === "number") total = data.total;

      out = out.concat(part);
      const next = (typeof data.next === "number") ? data.next : null;
      if(next === null) break;
      start = next;
      if(out.length >= max) break;
    }
    return { items: out.slice(0, max), total: (total===null ? out.length : total) };
  }

  // Pega só total rápido (sem puxar tudo)
  async function bxTotalOnly(method, params){
    const data = await bxRaw(method, { ...params, start: 0 });
    const total = (typeof data.total === "number") ? data.total : (Array.isArray(data.result) ? data.result.length : 0);
    return total;
  }

  // =========================
  // Audio
  // =========================
  function tripleBeep(){
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return;
      const ctx = new AC();
      const t0 = ctx.currentTime;

      const make = (t)=>{
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.20, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.18);
      };

      make(t0 + 0.00);
      make(t0 + 0.26);
      make(t0 + 0.52);

      setTimeout(()=>{ try{ ctx.close(); }catch(_){} }, 1000);
    }catch(_){}
  }

  // =========================
  // UI/CSS (mantido do seu padrão)
  // =========================
  function injectCSS(){
    const st = document.createElement("style");
    st.textContent = `
#cgdApp{
  --radius:18px;
  --border: rgba(30,40,70,.12);
  --text: rgba(18,26,40,.92);
  --muted: rgba(18,26,40,.62);
  --card2: rgba(255,255,255,.92);
  --shadow: 0 10px 30px rgba(20,30,60,.10);
  min-height: calc(100vh - 60px);
  padding: 10px 12px 110px;
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
  color: var(--text);
  background:
    radial-gradient(900px 600px at 15% 20%, rgba(176,140,255,.18), transparent 55%),
    radial-gradient(900px 600px at 85% 20%, rgba(120,210,255,.14), transparent 55%),
    radial-gradient(900px 650px at 55% 95%, rgba(255,150,200,.12), transparent 60%),
    linear-gradient(135deg, #f7f3ff, #f3fbff 50%, #fff7fb);
}
.cgdTop{
  position: sticky; top: 0; z-index: 50;
  background: rgba(255,255,255,.72);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 10px 12px;
  display:flex; align-items:center; justify-content: space-between;
  gap: 10px;
  box-shadow: var(--shadow);
}
.cgdTopLeft{ display:flex; align-items:center; gap:10px; min-width: 280px; }
.cgdLogo{ width:53px; height:53px; border-radius:999px; border:1px solid rgba(0,0,0,.10); object-fit:cover; background:#fff; }
.cgdTitle{ font-weight:950; letter-spacing:.2px; font-size:13px; white-space:nowrap; }
.cgdTopRight{ display:flex; gap:8px; align-items:center; flex-wrap: wrap; justify-content:flex-end; }
.cgdPill{ border:1px solid var(--border); background: rgba(255,255,255,.78); border-radius:999px; padding:6px 10px; font-size:12px; font-weight:900; }
.cgdBtn{ cursor:pointer; border:1px solid rgba(30,40,70,.14); background: rgba(255,255,255,.86); border-radius:999px; padding:7px 12px; font-size:12px; font-weight:950; }
.cgdBtn:active{ transform: translateY(1px); }
.cgdGrid{ margin-top:12px; display:grid; grid-template-columns: 1.05fr 1.95fr; gap:12px; }
.cgdCol{ border:1px solid var(--border); border-radius: var(--radius); background: rgba(255,255,255,.62); box-shadow: var(--shadow); overflow:hidden; min-height:68vh; display:flex; flex-direction:column; }
.cgdColHead{ padding:10px 12px; background: rgba(255,255,255,.78); border-bottom:1px solid var(--border); display:flex; align-items:flex-start; justify-content: space-between; gap:10px; }
.cgdColHead .hTitle{ font-weight:950; font-size:12px; letter-spacing:.3px; text-transform:uppercase; line-height:1.25; width:100%; }
.cgdColHead .hSub{ font-size:11px; color: var(--muted); font-weight:800; margin-top:2px; width:100%; }
.cgdColHead .hActions{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
.cgdList{ padding:10px; display:flex; flex-direction:column; gap:10px; overflow:auto; min-height:0; }
.cgdCard{ border:1px solid var(--border); border-radius:16px; background: var(--card2); box-shadow: 0 8px 20px rgba(20,30,60,.08); padding:10px; }
.cgdCardRow{ display:flex; align-items:flex-start; justify-content: space-between; gap:10px; }
.cgdLeadName{ font-weight:950; font-size:14px; line-height:1.2; word-break:break-word; flex:1 1 auto; }
.cgdBadges{ display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
.cgdBadge{ font-size:10px; font-weight:950; border:1px solid rgba(30,40,70,.12); padding:4px 8px; border-radius:999px; background: rgba(255,255,255,.9); }
.cgdActions{ margin-top:10px; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
.cgdMiniBtn{ cursor:pointer; border:1px solid rgba(30,40,70,.14); background: rgba(255,255,255,.92); border-radius:12px; padding:7px 10px; font-size:12px; font-weight:950; }
.cgdMiniBtn.primary{ background: rgba(120,210,255,.25); }
.cgdMiniBtn.danger{ background: rgba(255,80,120,.16); border-color: rgba(255,80,120,.30); }

.cgdBottom{
  position: fixed; left:0; right:0; bottom:0; z-index:80;
  background: rgba(255,255,255,.76);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(30,40,70,.14);
  padding: 10px 12px;
  display:flex; flex-direction:column; gap:10px;
}
.cgdQueueRow{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.cgdQueueChip{ border:1px solid rgba(30,40,70,.14); background: rgba(255,255,255,.9); border-radius:999px; padding:7px 10px; font-weight:950; font-size:12px; }
.cgdStatusLine{ font-size:11px; color: rgba(18,26,40,.60); font-weight:900; }

#listWho.cgdWhoGrid{ display:grid !important; grid-template-columns: 1fr 1fr; gap:10px; }
@media (max-width: 1100px){ #listWho.cgdWhoGrid{ grid-template-columns:1fr; } }
@media (max-width: 1100px){ .cgdGrid{ grid-template-columns:1fr; } .cgdTopLeft{ min-width:unset; } }

.cgdModalOverlay{ position:fixed; inset:0; background: rgba(0,0,0,.28); backdrop-filter: blur(4px); z-index:200; display:flex; align-items:center; justify-content:center; padding:16px; }
.cgdModal{ width:min(980px,96vw); max-height:min(88vh,900px); background: rgba(255,255,255,.94); border:1px solid rgba(30,40,70,.16); border-radius:20px; box-shadow: 0 24px 70px rgba(20,30,60,.22); overflow:hidden; display:flex; flex-direction:column; }
.cgdModalHead{ padding:12px 14px; display:flex; align-items:center; justify-content: space-between; gap:10px; border-bottom:1px solid rgba(30,40,70,.12); background: rgba(255,255,255,.75); }
.cgdModalTitle{ font-weight:950; font-size:13px; }
.cgdModalBody{ padding:12px 14px; overflow:auto; min-height:0; }
.cgdModalFoot{ padding:12px 14px; border-top:1px solid rgba(30,40,70,.12); display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; background: rgba(255,255,255,.75); }
.cgdInput, .cgdSelect{ border:1px solid rgba(30,40,70,.18); border-radius:12px; padding:10px 12px; font-weight:900; font-size:12px; background: rgba(255,255,255,.95); }
.cgdRow{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.cgdTable{ width:100%; border-collapse: collapse; overflow:hidden; border-radius:14px; border:1px solid rgba(30,40,70,.12); }
.cgdTable th, .cgdTable td{ padding:10px 10px; border-bottom:1px solid rgba(30,40,70,.10); font-size:12px; }
.cgdTable th{ text-align:left; font-weight:950; background: rgba(245,248,255,.8); }
.cgdTable tr:last-child td{ border-bottom:0; }

body{ padding-bottom: 110px !important; }
`;
    document.head.appendChild(st);
  }

  // =========================
  // Modal
  // =========================
  function openModal(title, bodyHTML, footHTML, opts){
    closeModal();
    const ov = document.createElement("div");
    ov.className = "cgdModalOverlay";
    const extraStyle = (opts && opts.modalWidthPx) ? `style="width:min(${opts.modalWidthPx}px,96vw)"` : "";
    ov.innerHTML = `
      <div class="cgdModal" role="dialog" aria-modal="true" ${extraStyle}>
        <div class="cgdModalHead">
          <div class="cgdModalTitle">${esc(title)}</div>
          <button class="cgdBtn" data-close-modal>Fechar</button>
        </div>
        <div class="cgdModalBody">${bodyHTML||""}</div>
        <div class="cgdModalFoot">${footHTML||`<button class="cgdBtn" data-close-modal>Fechar</button>`}</div>
      </div>
    `;
    ov.addEventListener("click", (e)=>{
      if(e.target === ov) closeModal();
      const c = e.target.closest("[data-close-modal]");
      if(c) closeModal();
    });
    document.body.appendChild(ov);
    document.addEventListener("keydown", escClose, {capture:true});
  }
  function escClose(e){ if(e.key === "Escape") closeModal(); }
  function closeModal(){
    const ov = $(".cgdModalOverlay");
    if(ov) ov.remove();
    document.removeEventListener("keydown", escClose, {capture:true});
  }

  // =========================
  // State (RAM)
  // =========================
  const state = {
    soundOn: true,
    lastNewLeadId: null,

    // ✅ agora temos items + total REAL
    newLeadsAll: [],
    newLeadsTotal: 0,
    newLeadsShown: [],

    stats: { day:0, month:0 },
    userStats: {},
    lastServedUserName: "—",

    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] }
  };

  // =========================
  // Queue JSON (cache dealId)
  // =========================
  async function ensureQueueDeal(){
    const r = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        "%TITLE": CONFIG.QUEUE.TITLE_KEY
      },
      order: { ID:"DESC" },
      select: ["ID","TITLE", CONFIG.QUEUE.UF_QUEUE_JSON, "DATE_MODIFY"]
    }, 5);

    const items = r.items || [];
    if(items[0]) return items[0];

    const createdId = await bx("crm.deal.add", {
      fields: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        TITLE: `${CONFIG.QUEUE.TITLE_KEY} FILA ATENDIMENTO`,
        [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify({ v:1, order:[], hiddenUsers:[], updatedAt: Date.now() })
      }
    });

    const deal = await bx("crm.deal.get", { id: String(createdId) });
    return deal;
  }

  function parseQueue(json){
    try{
      const o = JSON.parse(json || "{}");
      return {
        order: Array.isArray(o.order) ? o.order.map(String) : [],
        hiddenUsers: Array.isArray(o.hiddenUsers) ? o.hiddenUsers.map(String) : [],
        updatedAt: +o.updatedAt || 0
      };
    }catch(_){
      return { order:[], hiddenUsers:[], updatedAt:0 };
    }
  }

  async function fetchQueue(){
    const deal = await ensureQueueDeal();
    const raw = deal && deal[CONFIG.QUEUE.UF_QUEUE_JSON];
    return { dealId: String(deal.ID), ...parseQueue(raw) };
  }

  async function saveQueue(dealId, payload){
    const next = {
      v: 1,
      order: Array.isArray(payload.order) ? payload.order.map(String) : [],
      hiddenUsers: Array.isArray(payload.hiddenUsers) ? payload.hiddenUsers.map(String) : [],
      updatedAt: Date.now()
    };
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify(next) }
    });
    // atualiza RAM (sem re-fetch)
    state.queue.order = next.order;
    state.queue.hiddenUsers = next.hiddenUsers;
    state.queue.updatedAt = next.updatedAt;
  }

  // =========================
  // Lead actions
  // =========================
  async function leadUpdate(id, fields){
    return bx("crm.lead.update", { id: String(id), fields });
  }
  async function leadGet(id){
    return bx("crm.lead.get", { id: String(id) });
  }

  async function actionPickLead(leadId, userId){
    await leadUpdate(leadId, { ASSIGNED_BY_ID: String(userId), STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO });
  }

  // ✅ PRÓXIMA DISPONÍVEL rápida: UI instant + salva sem re-fetch
  async function nextAvailableFast(){
    const order = (state.queue.order||[]).slice();
    if(order.length === 0) throw new Error("Fila vazia");
    const nextId = order.shift();
    order.push(nextId);

    // atualiza UI já
    state.queue.order = order;
    renderQueue();
    renderBottomInfo();

    // salva em segundo plano
    await saveQueue(state.queue.dealId, { order, hiddenUsers: state.queue.hiddenUsers||[] });
  }

  async function actionMoveLead(leadId, statusId){
    const fields = { STATUS_ID: statusId };

    if(statusId === CONFIG.LEAD_STATUS.QUALIFICADO){
      const lead = await leadGet(leadId);
      const nm = leadDisplayName(lead);
      const t = String(lead.TITLE || nm || "").trim();
      if(t && !t.includes(CONFIG.HOT_EMOJI)){
        fields.TITLE = `${CONFIG.HOT_EMOJI} ${t}`.trim();
      }
    }
    await leadUpdate(leadId, fields);
  }

  async function actionSetPrazo(leadId, iso){
    await leadUpdate(leadId, { [CONFIG.UF_PRAZO]: iso });
  }

  // ✅ FOLLOW-UP: cria negócio e se falhar mostra o erro real
  async function createFollowUpDealFromLead(leadId, userId, isoPrazo){
    const stage = CONFIG.DEAL_PIPELINE17.STAGE_BY_USER[String(userId)];
    if(!stage) throw new Error(`Sem STAGE_ID da pipeline 17 para user ${userId}`);

    const lead = await leadGet(leadId);
    const nm = leadDisplayName(lead);
    const titleBase = nm || (lead.TITLE || `Lead #${leadId}`);
    const dealTitle = `FOLLOW-UP • [LEAD #${leadId}] ${titleBase}`.slice(0, 250);

    const payload = {
      fields: {
        CATEGORY_ID: CONFIG.DEAL_PIPELINE17.CATEGORY_ID,
        STAGE_ID: stage,
        TITLE: dealTitle,
        ASSIGNED_BY_ID: String(userId),
        OPPORTUNITY: 0,
        COMMENTS: isoPrazo ? `FOLLOW-UP: ${isoPrazo}` : `FOLLOW-UP criado pelo painel (Lead #${leadId}).`
      }
    };

    const dealId = await bx("crm.deal.add", payload);
    return dealId;
  }

  // =========================
  // Fetch: NOVOS LEADS (total real + páginas)
  // =========================
  async function fetchNewLeadsAll(){
    // ✅ retorna items + total REAL do Bitrix
    const r = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_NEW_FETCH_MAX);

    return r;
  }

  // Stats (puxados) — usa TOTAL rápido
  async function fetchStatsPulled(){
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    const day = await bxTotalOnly("crm.lead.list", {
      filter: { ">DATE_MODIFY": startToday, "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO },
      order: { ID:"DESC" },
      select: ["ID"]
    });

    const month = await bxTotalOnly("crm.lead.list", {
      filter: { ">DATE_MODIFY": startMonth, "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO },
      order: { ID:"DESC" },
      select: ["ID"]
    });

    return { day, month };
  }

  // ABRIR rápido: pega só primeira página do histórico + counts via total
  async function fetchUserCounts(userId){
    const emAtendimento = await bxTotalOnly("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO },
      order: { ID:"DESC" },
      select: ["ID"]
    });

    const qualificado = await bxTotalOnly("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "STATUS_ID": CONFIG.LEAD_STATUS.QUALIFICADO },
      order: { ID:"DESC" },
      select: ["ID"]
    });

    return { emAtendimento, qualificado };
  }

  async function fetchUserHistoryPage(userId){
    const data = await bxRaw("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","NAME","LAST_NAME","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID", CONFIG.UF_DT_LEAD],
      start: 0
    });

    const items = Array.isArray(data.result) ? data.result.slice(0, CONFIG.LIMIT_USER_HISTORY_PAGE) : [];
    return items;
  }

  async function searchLeadsByKeyword(userId, keyword, limit=200){
    const kw = String(keyword||"").trim();
    if(!kw) return [];
    const a = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "%TITLE": kw },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID","TITLE","NAME","LAST_NAME","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID", CONFIG.UF_DT_LEAD]
    }, limit);

    const b = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "%NAME": kw },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID","TITLE","NAME","LAST_NAME","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID", CONFIG.UF_DT_LEAD]
    }, limit);

    const map = new Map();
    (a.items||[]).concat(b.items||[]).forEach(it=> map.set(String(it.ID), it));
    return Array.from(map.values()).sort((x,y)=> (+y.ID) - (+x.ID));
  }

  // =========================
  // Render helpers
  // =========================
  function badgesFromLead(it){
    const b = [];
    const op = getUF(it, CONFIG.UF_OPERADORA);
    const idade = getUF(it, CONFIG.UF_IDADE);
    const bairro = getUF(it, CONFIG.UF_BAIRRO);
    const fonte = getUF(it, CONFIG.UF_FONTE_TXT);

    const dt = parseLeadDateAny(getUF(it, CONFIG.UF_DT_LEAD));
    const dtTxt = dt ? formatBRDate(dt) : (getUF(it, CONFIG.UF_DT_LEAD) ? String(getUF(it, CONFIG.UF_DT_LEAD)) : "");

    if(op) b.push(["OPERADORA", op]);
    if(idade) b.push(["IDADE", idade]);
    if(bairro) b.push(["BAIRRO", bairro]);
    if(fonte) b.push(["FONTE", fonte]);
    if(dtTxt) b.push(["DT LEAD", dtTxt]);

    const st = String(it.STATUS_ID||"");
    if(st) b.push(["STAGE", (CONFIG.LEAD_STATUS_NAME[st]||st)]);
    return b.slice(0, 10);
  }

  function renderNewLeads(items){
    const list = $("#listNew");
    if(!list) return;
    list.innerHTML = "";

    const totalEl = $("#pendingTotal");
    if(totalEl) totalEl.textContent = String(state.newLeadsTotal||0);

    if(!items || items.length===0){
      const empty = document.createElement("div");
      empty.style.opacity = ".75";
      empty.style.fontWeight = "900";
      empty.textContent = "Nenhum lead para mostrar.";
      list.appendChild(empty);
      return;
    }

    items.forEach(it=>{
      const id = String(it.ID||"");
      const title = leadDisplayName(it);
      const badges = badgesFromLead(it).map(([k,v]) => `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`).join("");

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div class="cgdLeadName">${esc(title)}</div>
          <div style="font-weight:950; font-size:12px; opacity:.7">ID: ${esc(id)}</div>
        </div>
        <div class="cgdBadges">${badges}</div>
        <div class="cgdActions">
          <button class="cgdMiniBtn primary" data-grab="${esc(id)}">PEGAR</button>
        </div>
      `;
      list.appendChild(card);
    });
  }

  function renderStats(stats){
    $("#pillDay").textContent = `Leads do dia: ${stats.day||0}`;
    $("#pillMonth").textContent = `Leads do mês: ${stats.month||0}`;
  }

  function renderQueue(){
    const row = $("#queueRow");
    if(!row) return;

    const btn = $("#btnQueueBottom");
    row.innerHTML = "";
    if(btn) row.appendChild(btn);

    const order = state.queue.order || [];
    if(order.length === 0){
      const hint = document.createElement("div");
      hint.className = "cgdQueueChip";
      hint.textContent = "Fila vazia. Clique em Fila de atendimento e selecione quem entra.";
      row.appendChild(hint);
      return;
    }

    order.forEach((id, idx)=>{
      const u = CONFIG.USERS.find(x=> String(x.id)===String(id));
      const chip = document.createElement("div");
      chip.className = "cgdQueueChip";
      chip.innerHTML = `<b>${esc(u ? u.name : ("USER "+id))}</b> <span style="opacity:.65">#${idx+1}</span>`;
      row.appendChild(chip);
    });
  }

  function renderBottomInfo(){
    const lastEl = $("#lastServed");
    const nextEl = $("#nextInQueue");
    if(lastEl) lastEl.textContent = `Último atendimento: ${state.lastServedUserName || "—"}`;

    const order = state.queue.order || [];
    const nextId = order[0];
    const u = CONFIG.USERS.find(x=> String(x.id)===String(nextId));
    const nextName = u ? u.name : (nextId ? ("USER "+nextId) : "—");
    if(nextEl) nextEl.textContent = `Próxima: ${nextName}`;
  }

  function setStatus(txt){
    const el = $("#statusLine");
    if(el) el.textContent = txt;
  }

  // =========================
  // Modals
  // =========================
  function modalGetEquipes(){
    const links = (CONFIG.GET_LINKS||[]).map(l=>{
      const url = String(l.url||"").trim();
      if(!url) return "";
      return `<div class="cgdRow" style="margin:6px 0">
        <a href="${esc(url)}" target="_blank" rel="noopener" class="cgdBtn" style="text-decoration:none;display:inline-block">${esc(l.label||url)}</a>
      </div>`;
    }).join("");
    openModal("GET (Equipes)", links || `<div style="font-weight:900;opacity:.75">Sem links configurados.</div>`);
  }

  async function modalQueue(){
    // abre rápido e carrega
    openModal("FILA DE ATENDIMENTO", `<div style="font-weight:900;opacity:.7">Carregando…</div>`, `<button class="cgdBtn" data-close-modal>Fechar</button>`, { modalWidthPx: 1100 });

    let q;
    try{
      q = await fetchQueue();
      state.queue = { ...state.queue, ...q };
      renderQueue(); renderBottomInfo();
    }catch(err){
      console.error(err);
      $(".cgdModalBody").innerHTML = `<div style="font-weight:950;color:#b00">Falha ao carregar fila.</div><div style="font-weight:900;opacity:.75;margin-top:8px">${esc(err.message||String(err))}</div>`;
      return;
    }

    const currentSet = new Set((q.order||[]).map(String));

    const body = `
      <div style="font-weight:950; margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="qAll">Selecionar todas</button>
        <button class="cgdBtn" id="qNone">Limpar</button>
        <button class="cgdBtn" id="qApply">Aplicar alterações</button>
      </div>

      <div style="font-weight:950;margin-bottom:8px">Quem entra na fila</div>
      <table class="cgdTable">
        <thead><tr><th style="width:90px">Na fila</th><th>Usuária</th></tr></thead>
        <tbody>
          ${CONFIG.USERS.map(u=>{
            const checked = currentSet.has(String(u.id)) ? "checked" : "";
            return `<tr>
              <td><input type="checkbox" data-q-user="${esc(u.id)}" ${checked} /></td>
              <td><b>${esc(u.name)}</b> <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>

      <div style="margin-top:10px;font-size:11px;font-weight:900;opacity:.7">
        Atualizado: ${q.updatedAt ? new Date(q.updatedAt).toLocaleString("pt-BR") : "—"}
      </div>
    `;

    $(".cgdModalBody").innerHTML = body;

    $("#qAll")?.addEventListener("click", ()=> $$('input[type=checkbox][data-q-user]').forEach(ch => ch.checked = true));
    $("#qNone")?.addEventListener("click", ()=> $$('input[type=checkbox][data-q-user]').forEach(ch => ch.checked = false));

    $("#qApply")?.addEventListener("click", async ()=>{
      try{
        $("#qApply").disabled = true;
        const checked = $$('input[type=checkbox][data-q-user]')
          .filter(ch=>ch.checked)
          .map(ch=> String(ch.getAttribute("data-q-user")));

        const prev = (state.queue.order||[]).map(String);
        const next = [];
        for(const id of prev){ if(checked.includes(id)) next.push(id); }
        for(const id of checked){ if(!next.includes(id)) next.push(id); }

        await saveQueue(state.queue.dealId, { order: next, hiddenUsers: state.queue.hiddenUsers||[] });
        renderQueue(); renderBottomInfo();
        setStatus(`Atualizado: ${nowBR()}`);
      }catch(err){
        console.error(err);
        alert("Falha ao salvar fila agora.");
      }finally{
        $("#qApply").disabled = false;
      }
    });
  }

  async function modalBatchTransfer(){
    // ✅ usa todos os NOVO LEAD (state.newLeadsAll) já paginados
    const all = (state.newLeadsAll || []).slice();

    const ops = Array.from(new Set(all.map(it => String(getUF(it, CONFIG.UF_OPERADORA)||"").trim()).filter(Boolean))).sort();
    const opsOptions = [`<option value="">Todas</option>`].concat(ops.map(o=> `<option value="${esc(o)}">${esc(o)}</option>`)).join("");
    const usersOpt = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote (TODOS em NOVO LEAD)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Operadora:</label>
        <select class="cgdSelect" id="btOp">${opsOptions}</select>

        <label style="font-weight:950">Dia (Data do Lead):</label>
        <input class="cgdInput" type="date" id="btDay" />

        <label style="font-weight:950">Transferir para:</label>
        <select class="cgdSelect" id="btUser">${usersOpt}</select>

        <button class="cgdBtn" id="btApply">Filtrar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Total NOVO LEAD: <b>${esc(state.newLeadsTotal)}</b></div>
        <div class="cgdBadge">Carregados: <b>${esc(all.length)}</b></div>
        <div class="cgdBadge">Mostrando: <b id="btCount">${esc(all.length)}</b></div>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:70px">Sel.</th>
            <th>Lead</th>
            <th style="width:370px">Info</th>
          </tr>
        </thead>
        <tbody id="btTbody"></tbody>
      </table>
    `;

    openModal("TRANSFERIR EM LOTE", body, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
      <button class="cgdBtn" id="btDo">Transferir selecionados</button>
    `, { modalWidthPx: 1200 });

    const tbody = $("#btTbody");
    const countEl = $("#btCount");

    function infoCol(it){
      const op = getUF(it, CONFIG.UF_OPERADORA) || "—";
      const idade = getUF(it, CONFIG.UF_IDADE) || "—";
      const bairro = getUF(it, CONFIG.UF_BAIRRO) || "—";
      const fonte = getUF(it, CONFIG.UF_FONTE_TXT) || "—";
      const dt = parseLeadDateAny(getUF(it, CONFIG.UF_DT_LEAD));
      const dtTxt = dt ? formatBRDate(dt) : (getUF(it, CONFIG.UF_DT_LEAD) ? String(getUF(it, CONFIG.UF_DT_LEAD)) : "—");
      return `
        <div class="cgdBadges" style="margin-top:0">
          <span class="cgdBadge">OPERADORA: ${esc(op)}</span>
          <span class="cgdBadge">IDADE: ${esc(idade)}</span>
          <span class="cgdBadge">BAIRRO: ${esc(bairro)}</span>
          <span class="cgdBadge">FONTE: ${esc(fonte)}</span>
          <span class="cgdBadge">DT LEAD: ${esc(dtTxt)}</span>
        </div>
      `;
    }

    function draw(list){
      countEl.textContent = String(list.length);
      tbody.innerHTML = list.length ? list.map(it=>`
        <tr>
          <td><input type="checkbox" data-bt-id="${esc(it.ID)}" checked /></td>
          <td>
            <b>${esc(leadDisplayName(it))}</b>
            <div style="opacity:.65;font-weight:900;font-size:11px">ID: ${esc(it.ID)} • STAGE: ${esc(CONFIG.LEAD_STATUS_NAME[String(it.STATUS_ID||"")]||String(it.STATUS_ID||"—"))}</div>
          </td>
          <td>${infoCol(it)}</td>
        </tr>
      `).join("") : `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    function applyFilter(){
      const op = String($("#btOp")?.value||"").trim();
      const day = String($("#btDay")?.value||"").trim(); // yyyy-mm-dd
      let list = all;

      if(op){
        list = list.filter(it => String(getUF(it, CONFIG.UF_OPERADORA)||"").trim() === op);
      }
      if(day){
        list = list.filter(it=>{
          const dt = parseLeadDateAny(getUF(it, CONFIG.UF_DT_LEAD));
          return dt ? dayKey(dt) === day : false;
        });
      }
      draw(list);
    }

    draw(all);
    $("#btApply")?.addEventListener("click", applyFilter);

    $("#btDo")?.addEventListener("click", async ()=>{
      const toId = $("#btUser").value;
      const ids = $$("input[type=checkbox][data-bt-id]", tbody)
        .filter(x=>x.checked)
        .map(x=> x.getAttribute("data-bt-id"));

      if(ids.length === 0) return alert("Selecione pelo menos 1 lead.");
      try{
        $("#btDo").disabled = true;
        for(const id of ids){
          await actionPickLead(id, toId);
          await sleep(90);
        }
        closeModal();
        await hardRefreshAll();
        alert("Transferência concluída ✅");
      }catch(err){
        console.error(err);
        alert("Falha ao transferir agora.");
      }finally{
        $("#btDo").disabled = false;
      }
    });
  }

  // ✅ ABRIR mais rápido: abre modal já + carrega depois
  async function modalManageUser(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    openModal(`ABRIR • ${u.name} (${u.id})`, `
      <div style="font-weight:900;opacity:.75">Carregando dados…</div>
    `, `<button class="cgdBtn" data-close-modal>Fechar</button>`, { modalWidthPx: 1200 });

    let counts, history;
    try{
      [counts, history] = await Promise.all([
        fetchUserCounts(u.id),
        fetchUserHistoryPage(u.id)
      ]);
    }catch(err){
      console.error(err);
      $(".cgdModalBody").innerHTML = `<div style="font-weight:950;color:#b00">Falha ao carregar.</div><div style="font-weight:900;opacity:.75;margin-top:8px">${esc(err.message||String(err))}</div>`;
      return;
    }

    const body = `
      <div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:950">GERENCIAR • ${esc(u.name)} (${esc(u.id)})</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">EM ATENDIMENTO: <b>${esc(counts.emAtendimento||0)}</b></div>
        <div class="cgdBadge">QUALIFICADO: <b>${esc(counts.qualificado||0)}</b></div>
      </div>

      <div class="cgdRow" style="margin-bottom:12px">
        <input class="cgdInput" id="muSearch" placeholder="Buscar por palavra-chave…" style="min-width:260px" />
        <button class="cgdBtn" id="muSearchGo">Buscar no Bitrix</button>

        <select class="cgdSelect" id="muFilter">
          <option value="ALL">Todos</option>
          <option value="${esc(CONFIG.LEAD_STATUS.EM_ATENDIMENTO)}">Somente EM ATENDIMENTO</option>
          <option value="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">Somente QUALIFICADOS</option>
          <option value="${esc(CONFIG.LEAD_STATUS.PERDIDO)}">Somente PERDIDOS</option>
          <option value="${esc(CONFIG.LEAD_STATUS.CONVERTIDO)}">Somente CONVERTIDOS</option>
        </select>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th>Lead</th>
            <th style="width:220px">Stage</th>
            <th style="width:390px">FOLLOW-UP</th>
            <th style="width:360px">Ações</th>
          </tr>
        </thead>
        <tbody id="muTbody"></tbody>
      </table>
    `;

    $(".cgdModalBody").innerHTML = body;

    let listBase = (history||[]).slice();

    const tbody = $("#muTbody");
    const filter = $("#muFilter");
    const search = $("#muSearch");

    function stageName(id){ return CONFIG.LEAD_STATUS_NAME[String(id||"")] || String(id||"—"); }

    function renderRows(){
      const q = (search.value||"").trim().toLowerCase();
      const f = (filter.value||"ALL");

      const list = listBase.filter(it=>{
        const nm = leadDisplayName(it).toLowerCase();
        if(q && !nm.includes(q)) return false;
        if(f!=="ALL" && String(it.STATUS_ID) !== String(f)) return false;
        return true;
      });

      const userOptions = CONFIG.USERS
        .filter(x=> String(x.id)!==String(u.id))
        .map(x=> `<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.id)})</option>`)
        .join("");

      tbody.innerHTML = list.length ? list.map(it=>{
        const id = String(it.ID);
        const nm = leadDisplayName(it);
        const dm = (it.DATE_MODIFY||"").replace("T"," ").slice(0,19);
        const st = String(it.STATUS_ID||"—");

        return `<tr>
          <td>
            <b>${esc(nm)}</b>
            <div style="opacity:.7;font-weight:900;font-size:11px">ID: ${esc(id)} • ${esc(dm||"—")}</div>
          </td>
          <td><span class="cgdBadge">${esc(stageName(st))}</span></td>
          <td>
            <div class="cgdRow">
              <input class="cgdInput" type="datetime-local" data-prazo="${esc(id)}" />
              <button class="cgdBtn" data-save-prazo="${esc(id)}">Salvar</button>
            </div>
            <div style="opacity:.65;font-weight:900;font-size:11px;margin-top:6px">
              Salvar cria <b>NEGÓCIO</b> na Pipeline 17 (coluna da usuária) + grava prazo no lead.
            </div>
          </td>
          <td>
            <div class="cgdRow">
              <select class="cgdSelect" data-move-to="${esc(id)}">${userOptions}</select>
              <button class="cgdBtn" data-do-transfer="${esc(id)}">Transferir</button>
              <button class="cgdBtn" data-move-stage="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">Qualificar 🔥</button>
            </div>
          </td>
        </tr>`;
      }).join("") : `<tr><td colspan="4" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    renderRows();
    search?.addEventListener("input", renderRows);
    filter?.addEventListener("change", renderRows);

    $("#muRefresh")?.addEventListener("click", async ()=> { closeModal(); await modalManageUser(userId); });

    $("#muSearchGo")?.addEventListener("click", async ()=>{
      const kw = ($("#muSearch").value||"").trim();
      if(!kw) return;
      try{
        $("#muSearchGo").disabled = true;
        const found = await searchLeadsByKeyword(u.id, kw, 350);
        const map = new Map();
        listBase.forEach(it=> map.set(String(it.ID), it));
        (found||[]).forEach(it=> map.set(String(it.ID), it));
        listBase = Array.from(map.values()).sort((a,b)=> (+b.ID)-(+a.ID));
        renderRows();
      }catch(err){
        console.error(err);
        alert("Falha ao buscar agora.");
      }finally{
        $("#muSearchGo").disabled = false;
      }
    });

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const sp = e.target.closest("[data-save-prazo]");
      const tf = e.target.closest("[data-do-transfer]");
      const mv = e.target.closest("[data-move-stage]");

      try{
        if(sp){
          const leadId = sp.getAttribute("data-save-prazo");
          const inp = $(`input[data-prazo="${CSS.escape(leadId)}"]`, $(".cgdModalBody"));
          const iso = isoFromLocalInput(inp?.value || "");
          if(!iso) return alert("Preencha data/hora corretamente.");
          sp.disabled = true;

          // salva prazo + cria deal (mostra erro real se falhar)
          await actionSetPrazo(leadId, iso);
          try{
            await createFollowUpDealFromLead(leadId, u.id, iso);
          }catch(errDeal){
            console.error("FOLLOW-UP crm.deal.add falhou:", errDeal);
            alert(`Falha ao criar NEGÓCIO na pipeline 17:\n${errDeal.message || errDeal}`);
            return;
          }

          closeModal();
          await hardRefreshAll();
          alert("FOLLOW-UP criado ✅");
        }

        if(tf){
          const leadId = tf.getAttribute("data-do-transfer");
          const sel = $(`select[data-move-to="${CSS.escape(leadId)}"]`, $(".cgdModalBody"));
          const toId = sel?.value;
          if(!toId) return;
          tf.disabled = true;
          await leadUpdate(leadId, { ASSIGNED_BY_ID: String(toId) });
          closeModal();
          await hardRefreshAll();
          alert("Transferido ✅");
        }

        if(mv){
          const leadId = mv.getAttribute("data-move-stage");
          const to = mv.getAttribute("data-to");
          mv.disabled = true;
          await actionMoveLead(leadId, to);
          closeModal();
          await hardRefreshAll();
        }
      }catch(err){
        console.error(err);
        alert(`Falha ao executar:\n${err.message || err}`);
      }finally{
        if(sp) sp.disabled = false;
        if(tf) tf.disabled = false;
        if(mv) mv.disabled = false;
      }
    });
  }

  // =========================
  // Who / last served calc
  // =========================
  async function refreshLastServedUser(){
    // pega o último lead que virou IN_PROCESS hoje e descobre o responsável
    try{
      const data = await bxRaw("crm.lead.list", {
        filter: { ">DATE_MODIFY": todayISOStart(), "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO },
        order: { DATE_MODIFY:"DESC" },
        select: ["ID","ASSIGNED_BY_ID","DATE_MODIFY"],
        start: 0
      });
      const it = (Array.isArray(data.result) && data.result[0]) ? data.result[0] : null;
      if(!it){ state.lastServedUserName = "—"; return; }
      const uid = String(it.ASSIGNED_BY_ID||"");
      const u = CONFIG.USERS.find(x=> String(x.id)===uid);
      state.lastServedUserName = u ? u.name : (`USER ${uid}`);
    }catch(_){
      // mantém anterior
    }
  }

  // =========================
  // Refresh orchestration
  // =========================
  async function refreshNewLeads(){
    const r = await fetchNewLeadsAll();
    state.newLeadsAll = r.items || [];
    state.newLeadsTotal = r.total || 0;
    state.newLeadsShown = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_DISPLAY);

    const newest = state.newLeadsAll[0] ? String(state.newLeadsAll[0].ID) : null;
    if(state.newLeadsTotal > 0 && state.soundOn){
      if(newest && newest !== state.lastNewLeadId){
        state.lastNewLeadId = newest;
        tripleBeep();
      }
    }

    renderNewLeads(state.newLeadsShown);
  }

  async function refreshStats(){
    const s = await fetchStatsPulled();
    state.stats = s;
    renderStats(s);
  }

  async function refreshQueue(){
    const q = await fetchQueue();
    state.queue = { ...state.queue, ...q };
    renderQueue();
    renderBottomInfo();
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBR()})`);
    await Promise.allSettled([
      refreshNewLeads(),
      refreshStats(),
      refreshQueue(),
      refreshLastServedUser()
    ]);
    renderBottomInfo();
    setStatus(`Atualizado: ${nowBR()}`);
  }

  // =========================
  // Mount + Events
  // =========================
  function mount(){
    let root = document.getElementById("cgd-leads-root");
    if(!root){
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
            <button class="cgdBtn" id="btnGet">GET (Equipes)</button>
            <button class="cgdBtn" id="btnQueueBottom"><b>Fila de atendimento</b></button>
            <button class="cgdBtn" id="btnBatch">Transferir em lote</button>
            <button class="cgdBtn" id="btnRefresh">Atualizar</button>
          </div>
        </div>

        <div class="cgdGrid">
          <section class="cgdCol">
            <div class="cgdColHead">
              <div style="width:100%">
                <div class="hTitle">NOVOS LEADS • PENDENTES <span style="opacity:.7">(<span id="pendingTotal">0</span>)</span></div>
                <div class="hSub">Status: <b>NOVO LEAD</b> • Mostrando ${CONFIG.LIMIT_NEW_DISPLAY} primeiros</div>
              </div>
            </div>
            <div class="cgdList" id="listNew">
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>

          <section class="cgdCol">
            <div class="cgdColHead">
              <div style="width:100%">
                <div class="hTitle">AÇÕES RÁPIDAS</div>
                <div class="hSub">Abrir card da usuária e FOLLOW-UP</div>
              </div>
              <div class="hActions">
                <button class="cgdBtn" id="btnManage">Gerenciar Usuária</button>
              </div>
            </div>
            <div class="cgdList cgdWhoGrid" id="listWho">
              <div style="opacity:.7;font-weight:900">Use “Gerenciar Usuária”.</div>
            </div>
          </section>
        </div>

        <div class="cgdBottom">
          <div class="cgdQueueRow" id="queueRow"></div>

          <div class="cgdQueueRow" style="justify-content:space-between">
            <div class="cgdQueueChip" id="lastServed">Último atendimento: —</div>
            <div class="cgdQueueChip" id="nextInQueue">Próxima: —</div>
          </div>

          <div class="cgdQueueRow">
            <button class="cgdBtn" id="btnNext">Próxima disponível</button>
            <div class="cgdStatusLine" id="statusLine">Atualizado: —</div>
          </div>
        </div>
      </div>
    `;
  }

  function wire(){
    $("#btnGet")?.addEventListener("click", modalGetEquipes);
    $("#btnQueueBottom")?.addEventListener("click", ()=> modalQueue().catch(console.error));
    $("#btnBatch")?.addEventListener("click", ()=> modalBatchTransfer().catch(console.error));
    $("#btnRefresh")?.addEventListener("click", ()=> hardRefreshAll().catch(console.error));

    $("#btnManage")?.addEventListener("click", ()=>{
      const opts = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");
      openModal("GERENCIAR USUÁRIA", `
        <div class="cgdRow">
          <label style="font-weight:950">Selecione:</label>
          <select class="cgdSelect" id="muSel">${opts}</select>
          <button class="cgdBtn" id="muOpen">Abrir</button>
        </div>
      `);
      $("#muOpen")?.addEventListener("click", ()=>{
        const id = $("#muSel").value;
        closeModal();
        modalManageUser(id);
      });
    });

    // pegar lead
    document.addEventListener("click", (e)=>{
      const g = e.target.closest("[data-grab]");
      if(!g) return;
      const leadId = g.getAttribute("data-grab");

      // modal simples: pegar para próxima da fila ou selecionar usuária
      const uops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");
      openModal("PEGAR LEAD", `
        <div style="font-weight:950;margin-bottom:10px">Escolha como pegar este lead</div>
        <div class="cgdRow" style="margin-bottom:10px">
          <button class="cgdBtn" id="pickQueue">Pegar p/ próxima da fila</button>
        </div>
        <div style="height:10px"></div>
        <div style="font-weight:950;margin-bottom:8px">Ou selecionar usuária:</div>
        <div class="cgdRow">
          <select class="cgdSelect" id="pickUser">${uops}</select>
          <button class="cgdBtn" id="pickGo">Confirmar</button>
        </div>
      `);

      $("#pickQueue")?.addEventListener("click", async ()=>{
        try{
          $("#pickQueue").disabled = true;
          const nextId = state.queue.order[0];
          if(!nextId) return alert("Fila vazia.");
          await actionPickLead(leadId, nextId);

          // rotaciona fila rápido
          await nextAvailableFast();
          closeModal();
          await hardRefreshAll();
        }catch(err){
          console.error(err);
          alert(`Falha:\n${err.message||err}`);
        }finally{
          $("#pickQueue").disabled = false;
        }
      });

      $("#pickGo")?.addEventListener("click", async ()=>{
        try{
          $("#pickGo").disabled = true;
          const uid = $("#pickUser").value;
          await actionPickLead(leadId, uid);
          closeModal();
          await hardRefreshAll();
        }catch(err){
          console.error(err);
          alert(`Falha:\n${err.message||err}`);
        }finally{
          $("#pickGo").disabled = false;
        }
      });
    });

    // próxima disponível (rápido)
    $("#btnNext")?.addEventListener("click", async ()=>{
      try{
        $("#btnNext").disabled = true;
        await nextAvailableFast();
        setStatus(`Próxima disponível • ${nowBR()}`);
      }catch(err){
        console.error(err);
        alert(err.message || String(err));
      }finally{
        $("#btnNext").disabled = false;
      }
    });
  }

  // =========================
  // Start
  // =========================
  async function start(){
    injectCSS();
    mount();
    wire();

    await hardRefreshAll();

    setInterval(()=> refreshNewLeads().catch(()=>{}), CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(()=> refreshStats().catch(()=>{}), CONFIG.REFRESH_STATS_MS);
    setInterval(()=> refreshQueue().catch(()=>{}), CONFIG.REFRESH_QUEUE_MS);
    setInterval(()=> refreshLastServedUser().catch(()=>{}), CONFIG.REFRESH_WHO_MS);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
