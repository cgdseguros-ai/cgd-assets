/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   ✅ Correções desta versão:
   - Detecta automaticamente o formato do UF_CRM_1771741018 (Data PEGAR) usando o lead 6979
   - Contagens Dia/Mês (total e por usuária) passam a funcionar mesmo se o Bitrix salvar com "T" ou com " " (espaço)
   - HISTÓRICO continua rápido (últimos 2 primeiro; contagens depois)
*/
(function(){
  "use strict";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    UF_PRAZO: "UF_CRM_1768175087",

    // ✅ Data PEGAR (base oficial de contagem "dia" e "mês")
    UF_DATA_PEGAR: "UF_CRM_1771741018",

    // ✅ Lead de amostra para detectar o formato real do campo Data PEGAR
    SAMPLE_LEAD_ID_FOR_PEG_DATE: 6979,

    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD:   "UF_CRM_1771333014",
    UF_IDADE:     "UF_CRM_1771339221",
    UF_BAIRRO:    "UF_CRM_LEAD_1731909705398",
    UF_FONTE:     "UF_CRM_1767285733843",
    UF_TELEFONE:  "UF_CRM_1771282207",

    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",
      UF_QUEUE_JSON: "UF_CRM_1771293519",
      TITLE_KEY: "__QUEUE__CGD__"
    },

    FOLLOWUP_DEALS: {
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

    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=awjcg85eqrbi",

    LINKS: {
      GET: "https://getcgdcorretora.bitrix24.site/tfequipes/",
      VENDAS: "https://cgdcorretorabase.bitrix24.site/vendas/"
    },

    // ✅ Refresh (otimizado)
    FAST_NEW_PULSE_MS: 1500,
    FULL_NEW_LEADS_MS: 9000,

    // ✅ HISTÓRICO: separa “últimos 2” (rápido) de “contagens” (mais pesado)
    REFRESH_USERS_LASTTWO_MS: 12000,
    REFRESH_USERS_COUNTS_MS: 45000,

    REFRESH_STATS_MS: 12000,
    REFRESH_QUEUE_MS: 3000,

    LIMIT_NEW_RENDER: 30,
    LIMIT_BATCH_MAX:  600,
    LIMIT_USER_LAST:  120,
    LIMIT_LAST_TWO_FETCH: 12,

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
      { name:"BEATRIZ", id:3387 },
    ],

    BOSSES: [27, 1, 15],

    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      ATENDIDO: "UC_JT9G60",
      QUALIFICADO: "UC_0NFA3H",
      PERDIDO: "UC_5IMTI4",
      CONVERTIDO: "CONVERTED",
      DESCARTADO: "JUNK",
    },

    // ✅ Contagens por Data PEGAR consideram APENAS estes status:
    COUNT_STATUS_FILTER: ["IN_PROCESS","UC_JT9G60","JUNK","CONVERTED"],

    LEAD_STATUS_NAMES: {
      "NEW": "NOVO LEAD",
      "IN_PROCESS": "EM ATENDIMENTO",
      "UC_JT9G60": "ATENDIDO",
      "UC_0NFA3H": "QUALIFICADO",
      "UC_5IMTI4": "PERDIDO",
      "CONVERTED": "LEAD CONVERTIDO (sistema)",
      "JUNK": "LEAD DESCARTADO (sistema)"
    },

    LEAD_SELECT: [
      "ID","TITLE","NAME","LAST_NAME","SECOND_NAME",
      "STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
      "SOURCE_ID","PHONE","EMAIL",
      "ADDRESS_CITY","ADDRESS","ADDRESS_2","ADDRESS_REGION",
      "UF_*"
    ],

    HOT_EMOJI: "🔥"
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

  function nowBRTime(){
    try{ return new Date().toLocaleTimeString("pt-BR"); }catch(_){ return ""; }
  }

  // ✅ Será definido automaticamente:
  // "T" (ex.: 2026-02-22T11:58:00) ou " " (ex.: 2026-02-22 11:58:00)
  let PEG_DATE_SEP = "T";

  // Formato: YYYY-MM-DD{SEP}HH:mm:ss (local)
  function bxLocalDateTime(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da= String(d.getDate()).padStart(2,"0");
    const hh= String(d.getHours()).padStart(2,"0");
    const mi= String(d.getMinutes()).padStart(2,"0");
    const ss= String(d.getSeconds()).padStart(2,"0");
    return `${y}-${m}-${da}${PEG_DATE_SEP}${hh}:${mi}:${ss}`;
  }

  function dayRangeLocal(){
    const d0 = new Date(); d0.setHours(0,0,0,0);
    const d1 = new Date(d0.getTime() + 24*60*60*1000);
    return { start: bxLocalDateTime(d0), end: bxLocalDateTime(d1) };
  }
  function monthRangeLocal(){
    const d0 = new Date(); d0.setDate(1); d0.setHours(0,0,0,0);
    const d1 = new Date(d0); d1.setMonth(d1.getMonth()+1);
    return { start: bxLocalDateTime(d0), end: bxLocalDateTime(d1) };
  }

  function isoFromLocalInput(v){
    if(!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!m) return "";
    const y=+m[1], mo=+m[2]-1, d=+m[3], hh=+m[4], mi=+m[5];
    const dt = new Date(y, mo, d, hh, mi, 0, 0);
    if(Number.isNaN(dt.getTime())) return "";
    return bxLocalDateTime(dt);
  }

  function fmtDateBRFromISO(iso){
    if(!iso) return "";
    const t = Date.parse(String(iso));
    if(!Number.isFinite(t)) return String(iso);
    const d = new Date(t);
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,"0");
    const mi = String(d.getMinutes()).padStart(2,"0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  }

  function stageName(id){
    return CONFIG.LEAD_STATUS_NAMES[String(id||"")] || String(id||"—");
  }

  function userNameById(id){
    const s = String(id||"");
    const u = CONFIG.USERS.find(x=>String(x.id)===s);
    return u ? u.name : (s ? ("USER " + s) : "—");
  }

  // =========================
  // Webhook client
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

  async function bxRaw(method, params={}, options={}){
    const timeoutMs = Math.max(8000, Number(options.timeoutMs || 16000));
    const pairs = toPairs("", params, []);
    const body = new URLSearchParams();
    for(const [k,v] of pairs){ if(k) body.append(k, v); }

    let lastErr = null;

    for(let attempt=0; attempt<3; attempt++){
      const ctrl = new AbortController();
      const t = setTimeout(()=>{ try{ ctrl.abort(); }catch(_){} }, timeoutMs);

      try{
        const resp = await fetch(CONFIG.WEBHOOK + method, {
          method:"POST",
          headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},
          body,
          signal: ctrl.signal
        });

        const data = await resp.json().catch(()=> ({}));
        if(!resp.ok){
          const e = new Error(`HTTP ${resp.status} em ${method}`);
          e._httpStatus = resp.status;
          throw e;
        }
        if(data && data.error){
          const e = new Error(data.error_description || data.error);
          e._bxError = data.error;
          throw e;
        }
        return data;
      }catch(err){
        lastErr = err;
        const http = err && err._httpStatus;
        const transientHTTP = (http===429 || http===500 || http===502 || http===503 || http===504);
        const aborted = (err && (err.name==="AbortError"));
        const net = (err && String(err.message||err).toLowerCase().includes("failed to fetch"));

        if(attempt < 2 && (transientHTTP || aborted || net)){
          clearTimeout(t);
          await sleep(200 + attempt*350);
          continue;
        }
        clearTimeout(t);
        throw err;
      }finally{
        clearTimeout(t);
      }
    }
    throw lastErr || new Error("Falha desconhecida");
  }

  async function bx(method, params={}, options={}){
    const data = await bxRaw(method, params, options);
    return data.result;
  }

  async function bxListAll(method, params, max=500){
    let start = 0;
    let out = [];
    while(true){
      const r = await bx(method, { ...params, start });
      const items = Array.isArray(r) ? r : (r && Array.isArray(r.items) ? r.items : []);
      out = out.concat(items);
      if(out.length >= max) break;

      if(r && typeof r === "object" && r.next !== undefined && r.next !== null){
        start = r.next;
        if(!start) break;
      }else{
        if(items.length < 50) break;
        start = start + 50;
      }
      if(items.length === 0) break;
    }
    return out.slice(0, max);
  }

  // =========================
  // Offline queue (RAM)
  // =========================
  const pendingOps = [];
  function enqueueOp(name, run){ pendingOps.push({ name, run }); }

  let flushBusy = false;
  async function flushOps(){
    if(flushBusy) return;
    if(pendingOps.length === 0) return;
    flushBusy = true;
    try{
      for(let i=0; i<25 && pendingOps.length; i++){
        const op = pendingOps[0];
        try{
          await op.run();
          pendingOps.shift();
          await sleep(90);
        }catch(_){ break; }
      }
    } finally{
      flushBusy = false;
    }
  }

  // =========================
  // Audio + Plane
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

  // ✅ Avião de papel amarelo 3D visto de lado — “10cm” aproximado na tela (380px)
  function flyPlaneYellow(){
    try{
      const d = document.createElement("div");
      d.className = "cgdPlane";
      d.innerHTML = `
        <svg viewBox="0 0 420 240" width="420" height="240" aria-hidden="true">
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#ffe55a"/>
              <stop offset="1" stop-color="#ffb800"/>
            </linearGradient>
            <linearGradient id="g2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#ffd400"/>
              <stop offset="1" stop-color="#ff8f00"/>
            </linearGradient>
            <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="rgba(0,0,0,.35)"/>
            </filter>
          </defs>
          <g filter="url(#sh)">
            <path d="M30 140 L370 60 L280 182 L190 150 Z"
                  fill="url(#g1)" stroke="rgba(0,0,0,.35)" stroke-width="5" />
            <path d="M190 150 L370 60"
                  stroke="rgba(0,0,0,.28)" stroke-width="6" />
            <path d="M30 140 L190 150 L260 210 L95 205 Z"
                  fill="url(#g2)" stroke="rgba(0,0,0,.28)" stroke-width="5" />
            <path d="M370 60 L405 48 L382 80 Z"
                  fill="#ffcc00" stroke="rgba(0,0,0,.32)" stroke-width="5" />
          </g>
        </svg>
      `;
      document.body.appendChild(d);
      setTimeout(()=>{ try{ d.remove(); }catch(_){} }, 2200);
    }catch(_){}
  }

  // =========================
  // State (RAM only)
  // =========================
  const state = {
    soundOn: true,
    dark: false,

    maxNewLeadIdSeen: 0,
    _newLeadFirstPulseDone: false,

    newLeadsAll: [],
    newLeadsRender: [],
    pendingCount: 0,

    stats: { day:0, month:0 },

    userStats: {},

    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] },
    queueLocalTouchTs: 0,

    lastServedUserName: "—"
  };

  // =========================
  // CSS
  // =========================
  function injectCSS(){
    const css = `
#cgdApp{
  --radius:18px;
  --border: rgba(30,40,70,.12);
  --text: rgba(18,26,40,.92);
  --muted: rgba(18,26,40,.62);
  --card2: rgba(255,255,255,.92);
  --shadow: 0 10px 30px rgba(20,30,60,.10);

  min-height: calc(100vh - 90px);
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
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(18,20,24,.92);
  color: #fff;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  box-shadow: var(--shadow);
}
.cgdTopLeft{ display:flex; align-items:center; gap:10px; min-width: 320px; }
.cgdLogo{
  width: 56px; height: 56px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.14);
  object-fit: cover;
  background: rgba(255,255,255,.08);
}
.cgdTitle{ font-weight: 950; letter-spacing:.2px; font-size: 13px; white-space: nowrap; }
.cgdTopRight{ display:flex; gap:8px; align-items:center; flex-wrap: wrap; justify-content: flex-end; }
.cgdPill{
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.10);
  color:#fff;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 950;
}
.cgdBtn{
  cursor:pointer;
  border: 2px solid rgba(255,255,255,.22);
  background: rgba(10,10,12,.92);
  color:#fff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 950;
}
.cgdBtn:active{ transform: translateY(1px); }
.cgdBtn[disabled]{ opacity:.6; cursor:not-allowed; transform:none; }
.cgdMiniBtn{
  cursor:pointer;
  border: 2px solid rgba(10,10,12,.85);
  background: rgba(255,255,255,.95);
  color: rgba(10,10,12,.92);
  border-radius: 12px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 950;
}
.cgdMiniBtn.primary{ background: rgba(120,210,255,.32); border-color: rgba(10,10,12,.75); }
.cgdMiniBtn.danger{ background: rgba(255,70,120,.18); border-color: rgba(10,10,12,.75); }

.cgdLayout{ margin-top: 12px; display:flex; gap: 12px; align-items: stretch; }
.cgdGrid{ flex: 1 1 auto; display:grid; grid-template-columns: 0.85fr 2.15fr; gap: 12px; }

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
.cgdColHead{ padding: 8px 10px 10px; background: rgba(255,255,255,.78); border-bottom: 1px solid var(--border); }
.cgdColHead .hTitle{
  width:100%;
  text-align:center;
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.3px;
  text-transform: uppercase;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cgdColHead .hActionsRow{ margin-top: 8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; }
.cgdList{ padding: 10px; display:flex; flex-direction: column; gap: 10px; overflow:auto; min-height: 0; }
.cgdCard{
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card2);
  box-shadow: 0 8px 20px rgba(20,30,60,.08);
  padding: 10px 10px 10px;
}
.cgdCardRow{ display:flex; align-items:flex-start; justify-content: space-between; gap:10px; }
.cgdLeadName{ font-weight: 950; font-size: 14px; line-height: 1.2; word-break: break-word; flex: 1 1 auto; }
.cgdBadges{ display:flex; gap:6px; flex-wrap: wrap; margin-top: 8px; }
.cgdBadge{
  font-size: 10px;
  font-weight: 950;
  border: 1px solid rgba(30,40,70,.12);
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,.9);
}
.cgdBadge.oper{ border: 0; padding: 5px 10px; }
.cgdActions{ margin-top: 10px; display:flex; gap:8px; justify-content: flex-end; flex-wrap: wrap; }

.cgdAlertBox{
  border: 2px solid rgba(10,10,12,.85);
  border-radius: 16px;
  padding: 12px;
  background: rgba(10,10,12,.94);
  color: #fff;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}
.cgdAlertBox.hot{ background: rgba(255,0,0,.92); color: #111; border-color: rgba(0,0,0,.35); }
.cgdAlertBox .txt{ font-weight: 950; font-size: 12px; line-height: 1.25; width: 100%; }
.cgdAlertBox .txt small{ display:block; margin-top: 4px; font-size: 11px; opacity: .92; font-weight: 900; }

#listWho.cgdWhoGrid{ display:grid !important; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 1100px){ #listWho.cgdWhoGrid{ grid-template-columns: 1fr; } }

.cgdBottom{
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 80;
  background: rgba(10,10,12,.95);
  color: #fff;
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255,255,255,.10);
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 12px;
}
.cgdBottom .bLeft{ display:flex; align-items:center; gap:10px; min-width: 340px; }
.cgdBottom .bCenter{ flex:1; text-align:center; font-style: italic; font-weight: 900; opacity:.92; }
.cgdBottom .bRight{ text-align:right; font-weight: 900; opacity:.92; min-width: 360px; }
.cgdAddr{ font-size: 11px; font-weight: 900; opacity: .92; line-height: 1.15; }
.cgdCnpj{ font-size: 11px; line-height: 1.25; }

.cgdPlane{
  position: fixed;
  top: 86px;
  left: -520px;
  width: 420px;  /* ~ 10 cm em muitos monitores */
  height: 240px;
  z-index: 9999;
  pointer-events:none;
  opacity: .98;
  animation: planeFly 1.9s linear forwards;
}
@keyframes planeFly{
  0%   { transform: translateX(0) rotate(6deg); opacity: .0; }
  10%  { opacity: .98; }
  100% { transform: translateX(calc(100vw + 820px)) rotate(-4deg); opacity: 0; }
}
@media (max-width: 1200px){
  .cgdLayout{ flex-direction: column; }
}

    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  // =========================
  // Mount
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
            <div class="cgdPill" id="pillPending">Pendentes: 0</div>
            <div class="cgdPill" id="pillDay">Leads do dia: …</div>
            <div class="cgdPill" id="pillMonth">Leads do mês: …</div>

            <button class="cgdBtn" id="btnRefresh">Atualizar</button>
            <button class="cgdBtn" id="btnSound">Som: ON</button>
          </div>
        </div>

        <div class="cgdLayout">
          <section class="cgdCol">
            <div class="cgdColHead">
              <div class="hTitle">NOVOS LEADS</div>
            </div>

            <div class="cgdList" id="listNew">
              <div class="cgdAlertBox" id="alertNew" style="display:none">
                <div class="txt">
                  🚨 <b>NOVO LEAD</b>
                  <small>Alarme sonoro enquanto existir lead em “NOVO LEAD”.</small>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                  <button class="cgdBtn" id="btnSilence">Silenciar</button>
                  <button class="cgdBtn" id="btnSoundOn" style="display:none">Ligar som</button>
                </div>
              </div>
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>

          <section class="cgdCol">
            <div class="cgdColHead">
              <div class="hTitle">HISTÓRICO DE LEADS</div>
              <div class="hActionsRow">
                <button class="cgdBtn" id="btnRefreshWho">Atualizar</button>
              </div>
            </div>
            <div class="cgdList cgdWhoGrid" id="listWho">
              ${CONFIG.USERS.map(u=>`
                <div class="cgdCard">
                  <div class="cgdCardRow">
                    <div style="font-weight:950">${esc(u.name)}</div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
                      <span class="cgdBadge">dia: …</span>
                      <span class="cgdBadge">mês: …</span>
                    </div>
                  </div>
                  <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.55">Carregando últimos leads…</div>
                </div>
              `).join("")}
            </div>
          </section>
        </div>

        <div class="cgdBottom">
          <div class="bLeft">
            <div class="cgdAddr"><b>Endereço</b><br/>Av Ayrton Senna, 2500, SS109, Barra da Tijuca</div>
          </div>
          <div class="bCenter">System created by GRUPO CGD</div>
          <div class="bRight">
            <div class="cgdCnpj">
              <div><b>CGD CORRETORA</b> CNPJ 01.654.471/0001-86 • SUSEP 202031791 &nbsp;|&nbsp; <b>CGD BARRA</b> CNPJ 53.013.848/0001-11 • SUSEP 242158650</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================
  // Lead Helpers
  // =========================
  function pickUF(it, key){
    try{ return it && Object.prototype.hasOwnProperty.call(it, key) ? it[key] : (it ? it[key] : ""); }
    catch(_){ return ""; }
  }

  function operStyle(operRaw){
    const op = String(operRaw||"").toUpperCase();
    if(op.includes("LEVE")) return { bg:"#f5a23a", fg:"#111" };
    if(op.includes("PREVENT")) return { bg:"#0b2a6b", fg:"#fff" };
    if(op.includes("MEDSENIOR")) return { bg:"#63c454", fg:"#111" };
    if(op.includes("AMIL")) return { bg:"#7db7ff", fg:"#111" };
    if(op.includes("UNIMED")) return { bg:"#2f6f4f", fg:"#fff" };
    if(op.includes("ALICE")) return { bg:"#ff7bb8", fg:"#111" };
    return { bg:"rgba(255,255,255,.9)", fg:"rgba(18,26,40,.92)" };
  }

  function leadDisplayName(it){
    const nm = [it.NAME, it.SECOND_NAME, it.LAST_NAME].filter(Boolean).map(String).join(" ").trim();
    if(nm) return nm;
    const t = String(it.TITLE||"").trim();
    if(t) return t;
    return `Lead #${it.ID}`;
  }

  function bestPhone(it){
    const uf = pickUF(it, CONFIG.UF_TELEFONE);
    if(uf) return String(uf);
    const p = it && it.PHONE;
    if(Array.isArray(p) && p[0] && p[0].VALUE) return String(p[0].VALUE);
    return "";
  }

  function leadBadgesRich(it){
    const b = [];
    const oper = pickUF(it, CONFIG.UF_OPERADORA);
    const idade = pickUF(it, CONFIG.UF_IDADE);
    const bairro= pickUF(it, CONFIG.UF_BAIRRO);
    const fonte = pickUF(it, CONFIG.UF_FONTE);
    const dtuf  = pickUF(it, CONFIG.UF_DT_LEAD);
    const dt = dtuf ? fmtDateBRFromISO(dtuf) : "";
    const tel = bestPhone(it);

    if(oper)  b.push(["OPERADORA", oper]);
    if(idade) b.push(["IDADE", idade]);
    if(tel)   b.push(["TELEFONE", tel]);
    if(bairro)b.push(["BAIRRO", bairro]);
    if(fonte) b.push(["FONTE", fonte]);
    if(dt)    b.push(["DATA", dt]);

    return b.slice(0, 6);
  }

  // =========================
  // Detecta formato real do UF_DATA_PEGAR usando o Lead 6979
  // =========================
  async function detectPegDateSeparator(){
    try{
      const it = await bx("crm.lead.get", { id: String(CONFIG.SAMPLE_LEAD_ID_FOR_PEG_DATE) }, { timeoutMs: 16000 });
      const v = String(pickUF(it, CONFIG.UF_DATA_PEGAR) || "").trim();

      // Se o campo vier vazio nesse lead, não dá pra detectar por ele
      if(!v) return;

      // Detecção principal
      if(v.includes("T")) PEG_DATE_SEP = "T";
      else if(v.includes(" ")) PEG_DATE_SEP = " ";
      else {
        // Se vier num formato diferente, tentamos inferir
        PEG_DATE_SEP = v.includes(":") ? " " : "T";
      }

      console.log("[CGD] Data PEGAR detectada:", v, "=> SEP =", JSON.stringify(PEG_DATE_SEP));
    }catch(err){
      console.warn("[CGD] Não consegui detectar formato pelo lead", CONFIG.SAMPLE_LEAD_ID_FOR_PEG_DATE, err);
    }
  }

  // =========================
  // LEADS: fetch / counts
  // =========================
  async function fetchNewLeadsAll(){
    const items = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": "NEW" },
      order: { ID: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_BATCH_MAX);
    return items || [];
  }

  async function fetchNewLeadPulse(){
    const data = await bxRaw("crm.lead.list", {
      filter: { "STATUS_ID": "NEW" },
      order: { ID: "DESC" },
      select: ["ID"],
      start: 0
    }, { timeoutMs: 12000 });

    const total = Number(data && data.total);
    const items = Array.isArray(data?.result) ? data.result : [];
    const newestId = items && items[0] ? Number(items[0].ID) : 0;

    return {
      total: Number.isFinite(total) ? total : items.length,
      newestId: Number.isFinite(newestId) ? newestId : 0
    };
  }

  // ✅ Total por range usando Data PEGAR (UF_DATA_PEGAR)
  //    Se voltar 0 e ainda não temos certeza do separador, tenta o outro separador.
  async function fetchPegTotalRange(startLocal, endLocal){
    const run = async ()=> {
      const data = await bxRaw("crm.lead.list", {
        filter: {
          "STATUS_ID": CONFIG.COUNT_STATUS_FILTER,
          [">=" + CONFIG.UF_DATA_PEGAR]: startLocal,
          ["<" + CONFIG.UF_DATA_PEGAR]: endLocal
        },
        order: { ID: "DESC" },
        select: ["ID"],
        start: 0
      }, { timeoutMs: 16000 });

      const total = Number(data && data.total);
      if(Number.isFinite(total)) return total;
      const items = Array.isArray(data?.result) ? data.result : [];
      return items.length;
    };

    let total = await run();

    // fallback inteligente: se total veio 0, tenta trocar SEP uma vez
    if(total === 0){
      const old = PEG_DATE_SEP;
      PEG_DATE_SEP = (PEG_DATE_SEP === "T") ? " " : "T";
      const start2 = startLocal.replace(old, PEG_DATE_SEP);
      const end2   = endLocal.replace(old, PEG_DATE_SEP);
      try{
        const total2 = await run.call(null, start2, end2);
        // se o fallback achar algo, mantém o SEP novo
        if(total2 > 0) return total2;
      }catch(_){}
      // se não funcionou, volta
      PEG_DATE_SEP = old;
    }
    return total;
  }

  async function fetchPegTotalRangeUser(userId, startLocal, endLocal){
    const run = async (s, e)=> {
      const data = await bxRaw("crm.lead.list", {
        filter: {
          "ASSIGNED_BY_ID": String(userId),
          "STATUS_ID": CONFIG.COUNT_STATUS_FILTER,
          [">=" + CONFIG.UF_DATA_PEGAR]: s,
          ["<" + CONFIG.UF_DATA_PEGAR]: e
        },
        order: { ID: "DESC" },
        select: ["ID"],
        start: 0
      }, { timeoutMs: 16000 });

      const total = Number(data && data.total);
      if(Number.isFinite(total)) return total;
      const items = Array.isArray(data?.result) ? data.result : [];
      return items.length;
    };

    let total = await run(startLocal, endLocal);

    if(total === 0){
      const old = PEG_DATE_SEP;
      const alt = (PEG_DATE_SEP === "T") ? " " : "T";
      const s2 = startLocal.replace(old, alt);
      const e2 = endLocal.replace(old, alt);
      try{
        const total2 = await run(s2, e2);
        if(total2 > 0){
          PEG_DATE_SEP = alt;
          return total2;
        }
      }catch(_){}
    }

    return total;
  }

  // =========================
  // Render
  // =========================
  function renderPendingCount(n){
    state.pendingCount = Math.max(0, Number(n||0));
    const el = $("#pillPending");
    if(el) el.textContent = `Pendentes: ${state.pendingCount}`;
  }

  function renderNewLeads(items){
    const list = $("#listNew");
    if(!list) return;

    const alert = $("#alertNew");
    list.innerHTML = "";
    if(alert) list.appendChild(alert);

    const has = (items||[]).length > 0;
    if(alert){
      alert.style.display = has ? "flex" : "none";
      alert.classList.toggle("hot", has);
    }

    const btnSoundOn = $("#btnSoundOn");
    if(btnSoundOn) btnSoundOn.style.display = state.soundOn ? "none" : "inline-block";

    if(!has){
      const empty = document.createElement("div");
      empty.style.opacity = ".75";
      empty.style.fontWeight = "900";
      empty.textContent = "Nenhum lead para mostrar.";
      list.appendChild(empty);
      return;
    }

    (items||[]).forEach(it=>{
      const id = String(it.ID||"");
      const title = leadDisplayName(it);

      const badges = leadBadgesRich(it).map(([k,v])=>{
        if(k === "OPERADORA"){
          const st = operStyle(v);
          return `<span class="cgdBadge oper" style="background:${esc(st.bg)}; color:${esc(st.fg)}">${esc(k)}: ${esc(v)}</span>`;
        }
        return `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`;
      }).join("");

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div class="cgdLeadName">${esc(title)}</div>
        </div>
        <div class="cgdBadges">${badges}</div>
      `;
      list.appendChild(card);
    });
  }

  function renderStats(stats){
    $("#pillDay").textContent = `Leads do dia: ${stats.day}`;
    $("#pillMonth").textContent = `Leads do mês: ${stats.month}`;
  }

  function renderWho(){
    const list = $("#listWho");
    if(!list) return;
    list.innerHTML = "";

    CONFIG.USERS.forEach(u=>{
      const us = state.userStats[u.id] || {};
      const l1 = us.lastTwo?.[0];
      const l2 = us.lastTwo?.[1];

      const last1 = l1 ? `Último: ${leadDisplayName(l1)}` : "Último: —";
      const last2 = l2 ? `Anterior: ${leadDisplayName(l2)}` : "Anterior: —";

      const day = (us.pulledToday===0 || us.pulledToday) ? us.pulledToday : "…";
      const mon = (us.pulledMonth===0 || us.pulledMonth) ? us.pulledMonth : "…";

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div style="font-weight:950">${esc(u.name)}</div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
            <span class="cgdBadge">dia: ${esc(day)}</span>
            <span class="cgdBadge">mês: ${esc(mon)}</span>
          </div>
        </div>
        <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">${esc(last1)}</div>
        <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">${esc(last2)}</div>
      `;
      list.appendChild(card);
    });
  }

  // =========================
  // HISTÓRICO — FAST FIRST
  // =========================
  async function fetchUserLastTwoFast(userId){
    const last = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","NAME","LAST_NAME","SECOND_NAME","STATUS_ID","ASSIGNED_BY_ID","DATE_MODIFY"]
    }, CONFIG.LIMIT_LAST_TWO_FETCH);

    const lastTwo = (last||[]).filter(x=>{
      const st = String(x.STATUS_ID||"");
      return st==="IN_PROCESS" || st==="UC_JT9G60" || st==="UC_0NFA3H";
    }).slice(0,2);

    return { lastTwo };
  }

  let usersLastTwoBusy = false;
  async function refreshUsersLastTwo(){
    if(usersLastTwoBusy) return;
    usersLastTwoBusy = true;
    try{
      const users = CONFIG.USERS.slice();
      for(let i=0;i<users.length;i+=4){
        const part = users.slice(i,i+4);
        await Promise.all(part.map(async u=>{
          const lt = await fetchUserLastTwoFast(u.id);
          state.userStats[u.id] = { ...(state.userStats[u.id]||{}), lastTwo: lt.lastTwo || [] };
        }));
        renderWho();
        await sleep(120);
      }
    }catch(err){
      console.warn("users lastTwo failed", err);
    }finally{
      usersLastTwoBusy = false;
    }
  }

  let usersCountsBusy = false;
  async function refreshUsersCounts(){
    if(usersCountsBusy) return;
    usersCountsBusy = true;
    try{
      const { start: dayS, end: dayE } = dayRangeLocal();
      const { start: monS, end: monE } = monthRangeLocal();

      const users = CONFIG.USERS.slice();
      for(let i=0;i<users.length;i+=3){
        const part = users.slice(i,i+3);
        await Promise.all(part.map(async u=>{
          const [d, m] = await Promise.all([
            fetchPegTotalRangeUser(u.id, dayS, dayE),
            fetchPegTotalRangeUser(u.id, monS, monE)
          ]);
          state.userStats[u.id] = { ...(state.userStats[u.id]||{}), pulledToday: d||0, pulledMonth: m||0 };
        }));
        renderWho();
        await sleep(160);
      }
    }catch(err){
      console.warn("users counts failed", err);
    }finally{
      usersCountsBusy = false;
    }
  }

  // =========================
  // Refresh orchestration
  // =========================
  async function refreshNewLeadsFull(){
    try{
      const items = await fetchNewLeadsAll();
      state.newLeadsAll = items || [];
      state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
      renderNewLeads(state.newLeadsRender);
    }catch(err){
      console.warn("new leads full fetch failed", err);
    }
  }

  let pulseBusy = false;
  async function refreshNewPulse(){
    if(pulseBusy) return;
    pulseBusy = true;
    try{
      const p = await fetchNewLeadPulse();
      renderPendingCount(p.total);

      const newest = Number(p.newestId||0);
      if(!state._newLeadFirstPulseDone){
        state._newLeadFirstPulseDone = true;
        state.maxNewLeadIdSeen = newest || 0;
        return;
      }

      // ✅ Avião só quando entra lead NOVO na coluna NEW
      if(newest && newest > (state.maxNewLeadIdSeen||0)){
        state.maxNewLeadIdSeen = newest;
        flyPlaneYellow();
        if(state.soundOn) tripleBeep();
        refreshNewLeadsFull();
      }
    }catch(_){
    }finally{
      pulseBusy = false;
    }
  }

  let statsBusy = false;
  async function refreshStats(){
    if(statsBusy) return;
    statsBusy = true;
    try{
      const { start: dayS, end: dayE } = dayRangeLocal();
      const { start: monS, end: monE } = monthRangeLocal();

      const [day, month] = await Promise.all([
        fetchPegTotalRange(dayS, dayE),
        fetchPegTotalRange(monS, monE)
      ]);

      state.stats = { day: day||0, month: month||0 };
      renderStats(state.stats);
    }catch(err){
      console.warn("stats failed", err);
    }finally{
      statsBusy = false;
    }
  }

  async function hardRefreshAll(){
    await Promise.allSettled([
      refreshNewPulse(),
      refreshNewLeadsFull(),
      refreshStats()
    ]);
    await refreshUsersLastTwo();
    refreshUsersCounts();
  }

  // =========================
  // UI
  // =========================
  function updateSoundUI(){
    $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;
    const so = $("#btnSoundOn");
    if(so) so.style.display = state.soundOn ? "none" : "inline-block";
  }

  function wire(){
    $("#btnSound")?.addEventListener("click", ()=>{ state.soundOn = !state.soundOn; updateSoundUI(); });
    $("#btnSilence")?.addEventListener("click", ()=>{ state.soundOn = false; updateSoundUI(); });
    $("#btnSoundOn")?.addEventListener("click", ()=>{ state.soundOn = true; updateSoundUI(); if((state.newLeadsAll||[]).length > 0) tripleBeep(); });

    $("#btnRefresh")?.addEventListener("click", hardRefreshAll);
    $("#btnRefreshWho")?.addEventListener("click", async ()=>{
      await refreshUsersLastTwo();
      refreshUsersCounts();
    });
  }

  // =========================
  // Start
  // =========================
  async function start(){
    if(!CONFIG.WEBHOOK) return;

    injectCSS();
    mount();
    wire();
    updateSoundUI();

    // ✅ 1) Detecta o separador real do campo Data PEGAR
    await detectPegDateSeparator();

    // ✅ 2) Carrega rápido: novos + stats totais + últimos 2 do histórico
    await Promise.allSettled([ refreshNewPulse(), refreshNewLeadsFull(), refreshStats() ]);
    await refreshUsersLastTwo();
    // ✅ 3) contagens por usuária rodam depois
    refreshUsersCounts();

    setInterval(refreshNewPulse, CONFIG.FAST_NEW_PULSE_MS);
    setInterval(refreshNewLeadsFull, CONFIG.FULL_NEW_LEADS_MS);
    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshUsersLastTwo, CONFIG.REFRESH_USERS_LASTTWO_MS);
    setInterval(refreshUsersCounts, CONFIG.REFRESH_USERS_COUNTS_MS);
    setInterval(flushOps, 2500);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
