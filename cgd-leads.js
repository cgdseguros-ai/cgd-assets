/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   ✅ FIXES desta versão:
   1) Contagem DIA/MÊS voltou a funcionar:
      - Agora os ranges são calculados no fuso do Bitrix (+03:00), igual ao que aparece no seu diagnóstico (date_start +03:00).
      - Data PEGAR também é gravada em +03:00 (mesmo padrão).
      - Considera SOMENTE as colunas: EM ATENDIMENTO, ATENDIDO, QUALIFICADO, LEAD DESCARTADO (JUNK), LEAD CONVERTIDO (CONVERTED - sistema).

   2) PEGAR:
      - Ao clicar em PEGAR, preenche automaticamente DATA PEGAR (UF_CRM_1771741018) com o "agora" no fuso do portal (+03:00).

   3) Card da USER:
      - Adiciona "sucesso 30d" (% e fração) baseado em DATA PEGAR:
        sucesso = (CONVERTED do sistema nos últimos 30d) / (ATENDIDO nos últimos 30d)
        ambos filtrados por ASSIGNED_BY_ID (da usuária) e por DATA PEGAR no período.
*/
(function(){
  "use strict";
  if(window.__CGD_LEADS_STARTED__) return;
  window.__CGD_LEADS_STARTED__ = true;

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    UF_PRAZO: "UF_CRM_1768175087",

    // ✅ Data PEGAR
    UF_DATA_PEGAR: "UF_CRM_1771741018",
    // ✅ Campo usado especificamente para contagem dia/mês
    UF_CONTAGEM_DATA: "UF_CRM_1772411982",

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

    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 9000,
    REFRESH_QUEUE_MS: 3000,
    REFRESH_WHO_MS: 12000,

    LIMIT_NEW_RENDER: 30,
    LIMIT_BATCH_MAX:  600,
    LIMIT_USER_LAST:  160,
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
      { name:"DIOGO", id:1 },
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
      CONVERTIDO: "UC_B3RQAF",
      LEAD_CONVERTIDO_SISTEMA: "CONVERTED",
      LEAD_DESCARTADO_SISTEMA: "JUNK",
    },

    // ✅ Contagem só nessas etapas (e CONVERTED do sistema)
    COUNT_STATUS_ALLOWED: [
      "IN_PROCESS",
      "UC_JT9G60",
      "UC_0NFA3H",
      "JUNK",
      "CONVERTED"
    ],

    LEAD_STATUS_NAMES: {
      "NEW": "NOVO LEAD",
      "IN_PROCESS": "EM ATENDIMENTO",
      "UC_JT9G60": "ATENDIDO",
      "UC_0NFA3H": "QUALIFICADO",
      "UC_5IMTI4": "PERDIDO",
      "UC_B3RQAF": "CONVERTIDO (funil)",
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

    HOT_EMOJI: "🔥",

    // ✅ Bitrix/portal aparece no diagnóstico em +03:00
    PORTAL_TZ_OFFSET_MINUTES: 180
  };

  // =========================
  // Helpers DOM
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

  function pad2(n){ return String(n).padStart(2,"0"); }

  // =========================
  // ✅ TIME: sempre no fuso do PORTAL (+03:00)
  // =========================
  function portalPartsFromNow(){
    // pega "agora" e converte para um "relógio" do portal
    const offMin = CONFIG.PORTAL_TZ_OFFSET_MINUTES;
    const ms = Date.now() + offMin*60*1000;
    const d = new Date(ms);
    // usar getters UTC para não misturar com o fuso do PC
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth()+1,
      d: d.getUTCDate(),
      hh: d.getUTCHours(),
      mi: d.getUTCMinutes(),
      ss: d.getUTCSeconds()
    };
  }

  function isoPortal(y, m, d, hh, mi, ss){
    const off = CONFIG.PORTAL_TZ_OFFSET_MINUTES;
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(off);
    const oh = pad2(Math.floor(abs/60));
    const om = pad2(abs%60);
    return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mi)}:${pad2(ss)}${sign}${oh}:${om}`;
  }

  function isoNowPortal(){
    const p = portalPartsFromNow();
    return isoPortal(p.y,p.m,p.d,p.hh,p.mi,p.ss);
  }

  function dayRangePortal(){
    const p = portalPartsFromNow();
    const start = isoPortal(p.y, p.m, p.d, 0,0,0);
    // soma 1 dia no "calendário do portal"
    const dt = new Date(Date.UTC(p.y, p.m-1, p.d, 0,0,0) + 24*60*60*1000);
    const end = isoPortal(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate(), 0,0,0);
    return { startISO: start, endISO: end };
  }

  function monthRangePortal(){
    const p = portalPartsFromNow();
    const start = isoPortal(p.y, p.m, 1, 0,0,0);
    const dt = new Date(Date.UTC(p.y, p.m-1, 1, 0,0,0));
    dt.setUTCMonth(dt.getUTCMonth()+1);
    const end = isoPortal(dt.getUTCFullYear(), dt.getUTCMonth()+1, 1, 0,0,0);
    return { startISO: start, endISO: end };
  }

  // ✅ últimos 30 dias (com base no relógio do portal)
  function isoFromPortalMs(msPortalClock){
    const d = new Date(msPortalClock);
    return isoPortal(
      d.getUTCFullYear(),
      d.getUTCMonth()+1,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds()
    );
  }

  function last30DaysRangePortal(){
    const offMin = CONFIG.PORTAL_TZ_OFFSET_MINUTES;
    const endMs = Date.now() + offMin*60*1000;          // "agora" no relógio do portal
    const startMs = endMs - (30*24*60*60*1000);         // -30d
    return { startISO: isoFromPortalMs(startMs), endISO: isoFromPortalMs(endMs) };
  }

  function isoFromLocalInputToPortal(v){
    // datetime-local (do PC) -> converte para string no portal (+03:00) mantendo o "momento"
    if(!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!m) return "";
    const y=+m[1], mo=+m[2]-1, d=+m[3], hh=+m[4], mi=+m[5];
    const local = new Date(y, mo, d, hh, mi, 0, 0);
    if(Number.isNaN(local.getTime())) return "";
    // converte momento UTC -> aplica offset portal
    const offMin = CONFIG.PORTAL_TZ_OFFSET_MINUTES;
    const ms = local.getTime() + offMin*60*1000;
    const p = new Date(ms);
    return isoPortal(p.getUTCFullYear(), p.getUTCMonth()+1, p.getUTCDate(), p.getUTCHours(), p.getUTCMinutes(), 0);
  }

  function fmtDateBRFromISO(iso){
    if(!iso) return "";
    const s = String(iso).trim();

    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if(m){
      const dd = m[3];
      const mm = m[2];
      const yy = m[1];
      const hh = m[4] || "";
      const mi = m[5] || "";
      return hh && mi ? `${dd}/${mm}/${yy} ${hh}:${mi}` : `${dd}/${mm}/${yy}`;
    }

    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[T\s](\d{2}):(\d{2}))?/);
    if(m){
      const a = Number(m[1]);
      const b = Number(m[2]);
      const yy = m[3];
      const hh = m[4] || "";
      const mi = m[5] || "";
      let dd = String(a).padStart(2,"0");
      let mm = String(b).padStart(2,"0");

      if(a <= 12 && b > 12){
        dd = String(b).padStart(2,"0");
        mm = String(a).padStart(2,"0");
      }

      return hh && mi ? `${dd}/${mm}/${yy} ${hh}:${mi}` : `${dd}/${mm}/${yy}`;
    }

    const t = Date.parse(s);
    if(!Number.isFinite(t)) return s;
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
    if(u) return u.name;
    return s ? ("USER " + s) : "—";
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
    const timeoutMs = Math.max(7000, Number(options.timeoutMs || 15000));
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
          await sleep(260 + attempt*520);
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
        }catch(_){
          break;
        }
      }
    } finally{
      flushBusy = false;
    }
  }


  // =========================
  // Audio — 3 beeps (opção 1) + unlock estável
  // =========================
  let cgdAudioCtx = null;
  let cgdAudioUnlocked = false;

  function getAudioCtx(){
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      if(!cgdAudioCtx || cgdAudioCtx.state === "closed") cgdAudioCtx = new AC();
      return cgdAudioCtx;
    }catch(_){ return null; }
  }

  async function unlockAudio(){
    try{
      const ctx = getAudioCtx();
      if(ctx && ctx.state === "suspended") await ctx.resume();
      cgdAudioUnlocked = true;
    }catch(_){ }
  }

  function primeAudioUnlock(){
    const once = ()=>{
      unlockAudio();
      ["pointerdown","touchstart","keydown","mousedown"].forEach(ev=>{
        window.removeEventListener(ev, once, true);
      });
    };
    ["pointerdown","touchstart","keydown","mousedown"].forEach(ev=>{
      window.addEventListener(ev, once, true);
    });
  }

  function leadBeep(ctx, t, freq=880, dur=0.11, gainLevel=0.16, type="triangle"){
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainLevel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function playLeadAlertFallback(){
    try{
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if(!AudioCtx) return;
      const ctx = new AudioCtx();
      const base = ctx.currentTime + 0.02;
      leadBeep(ctx, base + 0.00, 880, 0.12, 0.18, "sine");
      leadBeep(ctx, base + 0.18, 880, 0.12, 0.18, "sine");
      leadBeep(ctx, base + 0.36, 1046, 0.16, 0.18, "sine");
    }catch(_){ }
  }

  let leadAnimBusy = false;
  function playLeadAlert(){
    try{
      let played = false;
      const run = ()=>{
        try{
          const ctx = getAudioCtx();
          if(!ctx) return playLeadAlertFallback();
          const base = ctx.currentTime + 0.03;
          leadBeep(ctx, base + 0.00, 880, 0.12, 0.18, "sine");
          leadBeep(ctx, base + 0.18, 880, 0.12, 0.18, "sine");
          leadBeep(ctx, base + 0.36, 1046, 0.16, 0.18, "sine");
          played = true;
        }catch(_){ }
      };
      const ctx = getAudioCtx();
      if(ctx && ctx.state === "suspended"){
        ctx.resume().then(run).catch(()=> playLeadAlertFallback());
      }else{
        run();
      }
      setTimeout(()=>{ if(!played) playLeadAlertFallback(); }, 120);
    }catch(_){
      playLeadAlertFallback();
    }
  }

  function runRocketAcross(){
    if(leadAnimBusy) return;
    leadAnimBusy = true;
    try{
      const d = document.createElement("div");
      d.className = "cgdRocketRun";
      d.innerHTML = `
        <div class="cgdRocketScene" aria-hidden="true">
          <div class="cgdRocketFlame"></div>
          <div class="cgdRocketBody">
            <div class="cgdRocketTip"></div>
            <div class="cgdRocketWindow"></div>
            <div class="cgdRocketFin cgdRocketFinTop"></div>
            <div class="cgdRocketFin cgdRocketFinBot"></div>
          </div>
          <div class="cgdRocketTrail t1"></div>
          <div class="cgdRocketTrail t2"></div>
          <div class="cgdRocketTrail t3"></div>
          <div class="cgdRocketSpark s1"></div>
          <div class="cgdRocketSpark s2"></div>
          <div class="cgdRocketSpark s3"></div>
        </div>`;
      document.body.appendChild(d);
      setTimeout(()=>{ try{ d.remove(); }catch(_){} leadAnimBusy = false; }, 2300);
    }catch(_){ leadAnimBusy = false; }
  }

  // =========================
  // Zoom compensation
  // =========================

  const CGD_BASE_DPR = Math.max(1, Number(window.devicePixelRatio) || 1);
  function applyZoomCompensation(){
    try{
      const doc = document.documentElement;
      doc.style.setProperty("--cgdInvZoom", "1");
      const app = document.getElementById("cgdApp");
      if(app){
        const top = app.querySelector(".cgdTop");
        const bottom = app.querySelector(".cgdBottom");
        if(top){ top.style.marginBottom = "0px"; top.style.width = "100%"; top.style.maxWidth = "100%"; top.style.left = "0"; top.style.right = "0"; }
        if(bottom){
          bottom.style.width = "100%";
          bottom.style.maxWidth = "100%";
          bottom.style.left = "0";
          bottom.style.right = "0";
          document.body.style.paddingBottom = "70px";
        }
      }
    }catch(_){ }
  }

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

  min-height: calc(100vh - 76px);
  padding: 8px 10px 110px;
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
  color: var(--text);
  background:
    radial-gradient(900px 600px at 15% 20%, rgba(176,140,255,.18), transparent 55%),
    radial-gradient(900px 600px at 85% 20%, rgba(120,210,255,.14), transparent 55%),
    radial-gradient(900px 650px at 55% 95%, rgba(255,150,200,.12), transparent 60%),
    linear-gradient(135deg, #f7f3ff, #f3fbff 50%, #fff7fb);
  overflow-x: hidden;
}
.cgdTop{
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  max-width: 100%;
  min-width: 1280px;
  box-sizing: border-box;
  background: rgba(18,20,24,.92);
  color: #fff;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  padding: 4px 9px;
  min-height: 42px;
  max-height: 42px;
  transform: none;
  transform-origin: top left;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: nowrap;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.cgdTopLeft{ display:flex; align-items:center; gap:calc(10px * var(--cgdInvZoom,1)); min-width: calc(320px * var(--cgdInvZoom,1)); }
.cgdLogo{
  width: calc(34px * var(--cgdInvZoom,1)); height: calc(34px * var(--cgdInvZoom,1));
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.14);
  object-fit: cover;
  background: rgba(255,255,255,.08);
}
.cgdTitle{ font-weight: 950; letter-spacing:.2px; font-size: calc(11px * var(--cgdInvZoom,1)); white-space: nowrap; }
.cgdTopRight{ display:flex; gap:calc(5px * var(--cgdInvZoom,1)); align-items:center; flex-wrap: nowrap; justify-content: flex-end; min-width:0; overflow-x:auto; overflow-y:hidden; scrollbar-width:thin; }

.cgdPill{
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.10);
  color:#fff;
  border-radius: 999px;
  padding: calc(4px * var(--cgdInvZoom,1)) calc(8px * var(--cgdInvZoom,1));
  font-size: calc(10px * var(--cgdInvZoom,1));
  font-weight: 950;
}
.cgdBtn{
  cursor:pointer;
  border: 2px solid rgba(255,255,255,.22);
  background: rgba(10,10,12,.92);
  color:#fff;
  border-radius: 999px;
  padding: calc(4px * var(--cgdInvZoom,1)) calc(8px * var(--cgdInvZoom,1));
  font-size: calc(10px * var(--cgdInvZoom,1));
  font-weight: 950;
}
.cgdBtn:active{ transform: translateY(1px); }
.cgdBtn[disabled]{ opacity:.6; cursor:not-allowed; transform:none; }
.cgdBtn.subtle{
  padding: calc(6px * var(--cgdInvZoom,1)) calc(10px * var(--cgdInvZoom,1));
  font-size: calc(11px * var(--cgdInvZoom,1));
  border-width: 1px;
  background: rgba(10,10,12,.82);
}

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

.cgdLayout{ margin-top: 12px; display:flex; gap: 12px; align-items: stretch; flex-wrap: nowrap; min-width: 0; }
.cgdGrid{ flex: 1 1 auto; display:grid; grid-template-columns: 0.92fr 2.08fr; gap: 12px; min-width:0; }

.cgdQueueSide{
  width: calc(273px * var(--cgdInvZoom,1));
  min-width: calc(273px * var(--cgdInvZoom,1));
  max-width: calc(273px * var(--cgdInvZoom,1));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255,255,255,.62);
  box-shadow: var(--shadow);
  overflow:hidden;
  display:flex;
  flex-direction: column;
  min-height: 68vh;
}
.cgdQueueHead{
  padding: 10px 10px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,.78);
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 8px;
}
.cgdQueueHead .qt{
  width: 100%;
  text-align: center;
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.3px;
  text-transform: uppercase;
  white-space: nowrap;
}
.cgdQueueBody{ padding: 10px; overflow:auto; min-height: 0; display:flex; flex-direction: column; gap: 8px; }
.cgdQueueRowItem{
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255,255,255,.92);
  padding: 10px 10px;
  display:grid;
  grid-template-columns: minmax(0,1fr) 72px;
  align-items:center;
  gap: 8px;
}
.cgdQueueRowItem .nm{ font-weight: 950; font-size: 12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cgdQueueRowItem .ord{ font-weight: 950; opacity:.65; font-size: 12px; }
.cgdQueueArrows{ display:flex; gap:4px; align-items:center; justify-content:flex-end; align-self:center; min-width:72px; flex:0 0 72px; }
.cgdQueueArrows .cgdMiniBtn{ min-width: 32px; width: 32px; height: 28px; padding: 0; line-height: 1; display:inline-flex; align-items:center; justify-content:center; flex:0 0 32px; font-size:11px; }

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
  padding: 7px 10px;
  background: rgba(255,255,255,.78);
  border-bottom: 1px solid var(--border);
}
.cgdColHead .hActionsRow{
  display:flex;
  gap:8px;
  align-items:center;
  justify-content:space-between;
}
.cgdColHead .hTitle{
  min-width:0;
  text-align:left;
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.3px;
  text-transform: uppercase;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
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
.cgdAlertBox.hot{
  background: #00FF00;
  color: #111;
  border-color: rgba(0,0,0,.35);
  animation: cgdHotBlink .9s infinite alternate;
}
.cgdAlertBox .txt{ font-weight: 950; font-size: 12px; line-height: 1.25; width: 100%; }
.cgdAlertBox .txt small{ display:block; margin-top: 4px; font-size: 11px; opacity: .92; font-weight: 900; }

#listWho.cgdWhoGrid{ display:grid !important; grid-template-columns: repeat(auto-fit, minmax(204px, 1fr)); gap: 8px; align-content:start; }
@media (max-width: 1100px){ #listWho.cgdWhoGrid{ grid-template-columns: repeat(auto-fit, minmax(196px, 1fr)); } }

.cgdUserLine{ display:flex; gap:8px; align-items:flex-start; }
.cgdUserPic{
  width: 42px; height: 42px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid rgba(0,0,0,.10);
  background:#fff;
  flex: 0 0 auto;
}

/* Bottom */
.cgdBottom{
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 80;
  background: rgba(14,16,20,.98);
  color: #fff;
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255,255,255,.10);
  padding: 6px 12px;
  min-height: 52px;
  max-height: 52px;
  transform: none;
  transform-origin: bottom left;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: nowrap;
  overflow: hidden;
}
.cgdBottom .bLeft{ display:flex; align-items:center; gap:10px; min-width: 340px; flex:0 0 auto; }
.cgdBottom .bCenter{ flex:1 1 auto; min-width:0; text-align:center; font-style: italic; font-weight: 900; opacity:.92; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cgdBottom .bRight{ text-align:right; font-weight: 900; opacity:.92; min-width: 420px; flex:0 0 auto; white-space:nowrap; overflow:hidden; }

.cgdBossPics{ display:flex; gap:8px; align-items:center; }
.cgdBossPic{
  width: calc(34px * var(--cgdInvZoom,1)); height: calc(34px * var(--cgdInvZoom,1));
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(255,255,255,.08);
}
.cgdAddr{ font-size: 11px; font-weight: 900; opacity: .92; line-height: 1.15; }
.cgdAddrLabel{ font-size: 10px; font-weight: 950; opacity: .72; letter-spacing:.2px; text-transform: uppercase; margin-bottom:2px; }
.cgdCnpj{
  font-size: 11px;
  line-height: 1.25;
  display:flex;
  gap: 18px;
  justify-content:flex-end;
  flex-wrap: nowrap;
  text-align:left;
}
.cgdCnpj .blk{ display:flex; flex-direction:column; gap:2px; }

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
  width: min(1040px, 96vw);
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
.cgdModalBody{ padding: 12px 14px; overflow: auto; min-height: 0; }
.cgdModal.cgdModalWide{ width: min(98vw, 1780px); max-height: 92vh; }
.cgdModal.cgdModalWide .cgdModalBody{ padding: 10px 12px; }
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
.cgdRow{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.cgdTable{
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(30,40,70,.12);
}
.cgdTable th, .cgdTable td{
  padding: 9px 8px;
  border-bottom: 1px solid rgba(30,40,70,.10);
  font-size: 12px;
  vertical-align: top;
}
.cgdTable th{ text-align:left; font-weight: 950; background: rgba(245,248,255,.8); }
.cgdTable tr:last-child td{ border-bottom: 0; }

body{ padding-bottom: 70px !important; min-width: 1280px; }
:root{ --cgdInvZoom: 1; }

.cgdRocketRun{
  position: fixed;
  left: -560px;
  top: calc(50vh - 72px);
  width: 492px;
  height: 144px;
  z-index: 2147483647;
  pointer-events:none;
  opacity: .99;
  animation: rocketRunAcross 2.05s linear forwards;
}
.cgdRocketScene{ position:relative; width:100%; height:100%; }
.cgdRocketBody{
  position:absolute;
  left:124px;
  top:26px;
  width:250px;
  height:92px;
  border-radius:50px;
  background:linear-gradient(180deg,#f8fbff 0%, #dde7f2 52%, #b4c7d9 100%);
  border:4px solid #6b7e92;
  box-shadow:0 10px 28px rgba(15,25,45,.24);
}
.cgdRocketTip{
  position:absolute;
  right:-52px;
  top:16px;
  width:0; height:0;
  border-top:26px solid transparent;
  border-bottom:26px solid transparent;
  border-left:56px solid #df3f42;
  filter: drop-shadow(0 3px 2px rgba(0,0,0,.12));
}
.cgdRocketWindow{
  position:absolute;
  left:116px;
  top:22px;
  width:42px;
  height:42px;
  border-radius:999px;
  background:radial-gradient(circle at 35% 35%, #dff6ff 0%, #6bb6ff 45%, #1d4d85 100%);
  border:4px solid #f4f7fb;
  box-shadow: inset 0 0 0 2px rgba(10,30,60,.18);
}
.cgdRocketFin{ position:absolute; left:20px; width:54px; height:34px; background:#df3f42; border:4px solid #8f2225; border-radius:12px; }
.cgdRocketFinTop{ top:-16px; transform:skewX(-28deg); }
.cgdRocketFinBot{ bottom:-16px; transform:skewX(28deg); }
.cgdRocketFlame{
  position:absolute;
  left:42px;
  top:43px;
  width:94px;
  height:54px;
  background:radial-gradient(circle at 26% 50%, #fff3bf 0%, #ffd24a 30%, #ff8a00 62%, rgba(255,72,0,.92) 82%, rgba(255,72,0,0) 100%);
  border-radius:50% 0 0 50%;
  filter: blur(1px);
  transform-origin:right center;
  animation:cgdRocketFlamePulse .10s ease-in-out infinite alternate;
}
.cgdRocketTrail{ position:absolute; left:0; height:8px; border-radius:999px; background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,211,128,.95), rgba(255,120,0,.1)); filter: blur(.2px); }
.cgdRocketTrail.t1{ top:56px; width:132px; }
.cgdRocketTrail.t2{ top:40px; width:110px; opacity:.9; }
.cgdRocketTrail.t3{ top:72px; width:104px; opacity:.82; }
.cgdRocketSpark{ position:absolute; left:78px; width:14px; height:14px; border-radius:999px; background:radial-gradient(circle, #fff7da 0%, #ffb100 62%, rgba(255,98,0,0) 100%); animation:cgdRocketSpark 0.38s linear infinite; }
.cgdRocketSpark.s1{ top:44px; }
.cgdRocketSpark.s2{ top:61px; animation-delay:.12s; }
.cgdRocketSpark.s3{ top:78px; animation-delay:.24s; }
@keyframes cgdRocketFlamePulse{ from{ transform:scaleX(1) scaleY(.92);} to{ transform:scaleX(1.12) scaleY(1.08);} }
@keyframes cgdRocketSpark{ from{ transform:translateX(0) scale(.95); opacity:.95;} to{ transform:translateX(-40px) scale(.3); opacity:0;} }
@keyframes rocketRunAcross{
  0%   { transform: translateX(0); opacity: 0; }
  8%   { opacity: .99; }
  100% { transform: translateX(calc(100vw + 720px)); opacity: 0; }
}

body.cgdDark #cgdApp{
  background: linear-gradient(135deg, #2a2d33, #23262b 50%, #1f2227);
  color: rgba(255,255,255,.92);
}
body.cgdDark .cgdQueueSide,
body.cgdDark .cgdCol{
  background: rgba(25,27,31,.72) !important;
  border-color: rgba(255,255,255,.10) !important;
}
body.cgdDark .cgdColHead,
body.cgdDark .cgdQueueHead{
  background: rgba(25,27,31,.82) !important;
  border-color: rgba(255,255,255,.10) !important;
  color:#fff;
}
body.cgdDark .cgdCard{
  background: rgba(248,248,245,.92) !important;
  color: rgba(18,26,40,.92) !important;
}
body.cgdDark .cgdBadge{ background: rgba(255,255,255,.9) !important; }

    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  // =========================
  // Modal
  // =========================
  function openModal(title, bodyHTML, footHTML){
    closeModal();
    const ov = document.createElement("div");
    ov.className = "cgdModalOverlay";
    ov.innerHTML = `
      <div class="cgdModal" role="dialog" aria-modal="true">
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
  function escClose(e){ if(e.key === "Escape"){ closeModal(); } }
  function closeModal(){
    const ov = $(".cgdModalOverlay");
    if(ov) ov.remove();
    document.removeEventListener("keydown", escClose, {capture:true});
  }

  // =========================
  // State (RAM)
  // =========================
  const refreshGuards = { newLeads:false, pending:false, stats:false, users:false, queue:false };

  const state = {
    soundOn: true,
    dark: false,

    lastNewLeadId: null,
    lastNewLeadMaxId: 0,
    lastNewLeadCount: 0,
    _newLeadFirstLoadDone: false,

    newLeadsAll: [],
    newLeadsRender: [],
    pendingCount: 0,

    stats: { day:0, month:0 },
    userStats: {},

    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] },
    queueLocalTouchTs: 0,

    lastServedUserName: "—",

    userPhoto: new Map(),
    userPhotoTs: new Map(),
    userPhotoPending: new Set(),
    newLeadBlinkKey: new Set(),
    columnZoom: { new:1, who:1, queue:1 },
  };

  // =========================
  // Fotos
  // =========================
  const BLANK_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  async function fetchUserPhotoOnce(userId){
    const r = await bx("user.get", { ID: String(userId) }, { timeoutMs: 9000 });
    const u = Array.isArray(r) ? r[0] : (r?.[0] || r);
    const photo = (u && (u.PERSONAL_PHOTO || u.WORK_PHOTO)) ? String(u.PERSONAL_PHOTO || u.WORK_PHOTO) : "";
    return photo || "";
  }

  async function ensureUserPhoto(userId){
    const id = String(userId);
    const now = Date.now();

    const ts = state.userPhotoTs.get(id) || 0;
    if(state.userPhoto.has(id) && (now - ts) < 30*60*1000) return state.userPhoto.get(id);

    if(state.userPhotoPending.has(id)) return state.userPhoto.get(id) || "";

    state.userPhotoPending.add(id);

    let photo = "";
    try{
      for(let i=0;i<3;i++){
        try{
          photo = await fetchUserPhotoOnce(id);
          if(photo) break;
        }catch(_){}
        await sleep(180 + i*240);
      }
    } finally{
      state.userPhotoPending.delete(id);
    }

    state.userPhoto.set(id, photo || "");
    state.userPhotoTs.set(id, now);
    return state.userPhoto.get(id) || "";
  }

  async function warmUserPhotos(){
    const ids = CONFIG.USERS.map(u=>String(u.id));
    const bosses = CONFIG.BOSSES.map(x=>String(x));
    const all = Array.from(new Set(ids.concat(bosses)));

    for(let i=0;i<all.length;i+=6){
      const part = all.slice(i,i+6);
      await Promise.all(part.map(id=>ensureUserPhoto(id)));
      await sleep(120);
    }
  }

  async function renderBossPics(){
    const box = document.getElementById("bossPics");
    if(!box) return;
    box.innerHTML = "";
    const ids = CONFIG.BOSSES.map(String);
    ids.forEach(id=>{
      const img = document.createElement("img");
      img.className = "cgdBossPic";
      img.alt = "Sócio";
      img.loading = "lazy";
      img.src = state.userPhoto.get(id) || BLANK_IMG;
      img.onerror = ()=>{ img.src = BLANK_IMG; };
      box.appendChild(img);
    });

    setTimeout(()=>{
      ids.forEach((id, idx)=>{
        const img = box.children[idx];
        if(!img) return;
        const url = state.userPhoto.get(id) || "";
        if(url) img.src = url;
      });
    }, 600);
  }

  // =========================
  // Mount
  // =========================
  function loadColumnZoom(){
    try{
      const raw = localStorage.getItem("cgdColumnZoom");
      if(!raw) return;
      const z = JSON.parse(raw) || {};
      if(z && typeof z === "object") state.columnZoom = { new: Number(z.new)||1, who: Number(z.who)||1, queue: Number(z.queue)||1 };
    }catch{}
  }

  function saveColumnZoom(){
    try{ localStorage.setItem("cgdColumnZoom", JSON.stringify(state.columnZoom)); }catch{}
  }

  function applyColumnZoom(){
    const pairs = [
      ["listNew", state.columnZoom.new],
      ["listWho", state.columnZoom.who],
      ["queueBody", state.columnZoom.queue],
    ];
    pairs.forEach(([id,val])=>{
      const el = document.getElementById(id);
      if(!el) return;
      const z = Math.max(0.9, Math.min(1.3, Number(val)||1));
      el.style.transform = `scale(${z})`;
      el.style.width = `${100 / z}%`;
      el.style.minHeight = z > 1 ? `${100 * z}%` : "0";
    });
  }

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
            <div class="cgdPill" id="pillDay">Leads do dia: 0</div>
            <div class="cgdPill" id="pillMonth">Leads do mês: 0</div>

            <select class="cgdSelect" id="searchScope" style="min-width:150px;padding:6px 10px;font-size:11px">
              <option value="ALL">Busca geral</option>
              ${CONFIG.USERS.map(u=>`<option value="${esc(u.id)}">Busca: ${esc(u.name)}</option>`).join("")}
            </select>
            <input class="cgdInput" id="searchBox" placeholder="Buscar lead por nome…" style="min-width:170px;padding:6px 10px;font-size:11px" />
            <button class="cgdBtn" id="btnSearch">Buscar</button>

            <button class="cgdBtn" id="btnGET">GET</button>
            <button class="cgdBtn" id="btnVendas">VENDAS</button>

            <button class="cgdBtn" id="btnRefresh">Atualizar</button>
            <button class="cgdBtn" id="btnSound">Som: ON</button>
            <button class="cgdBtn" id="btnDark">Modo: Claro</button>
          </div>
        </div>

        <div class="cgdLayout">
          <div class="cgdGrid">
            <section class="cgdCol" id="colNew">
              <div class="cgdColHead">
                <div class="hActionsRow">
                  <div class="hTitle">NOVOS LEADS</div>
                  <div style="display:flex; gap:8px; align-items:center">
                    <button class="cgdBtn subtle" id="btnBatch">Transferir em lote</button>
                  </div>
                </div>
              </div>

              <div class="cgdList cgdZoomPane" id="listNew">
                <div class="cgdAlertBox" id="alertNew" style="display:none">
                  <div class="txt">
                    🚨 <b>NOVO LEAD</b>
                    <small>Alerta sonoro e visual ao entrar novo lead.</small>
                  </div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                    <button class="cgdBtn" id="btnSilence">Silenciar</button>
                    <button class="cgdBtn" id="btnSoundOn" style="display:none">Ligar som</button>
                  </div>
                </div>
                <div style="opacity:.7;font-weight:900">Carregando…</div>
              </div>
            </section>

            <section class="cgdCol" id="colWho">
              <div class="cgdColHead">
                <div class="hActionsRow">
                  <div class="hTitle">HISTÓRICO DE LEADS</div>
                  <div style="display:flex; gap:8px; align-items:center">
                    <button class="cgdBtn subtle" id="btnHideUsers">Ocultar usuárias</button>
                  </div>
                </div>
              </div>
              <div class="cgdList cgdWhoGrid cgdZoomPane" id="listWho">
                <div style="opacity:.7;font-weight:900">Carregando…</div>
              </div>
            </section>
          </div>

          <aside class="cgdQueueSide" id="queueSide">
            <div class="cgdQueueHead">
              <div class="qt">FILA</div>
              <div style="display:flex; gap:8px; align-items:center">
                <button class="cgdBtn" id="btnQueueManage">Gerenciar</button>
              </div>
            </div>
            <div class="cgdQueueBody cgdZoomPane" id="queueBody">
              <div style="opacity:.7;font-weight:900">Carregando fila…</div>
            </div>
            <div style="padding:10px; border-top:1px solid var(--border); display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end">
              <button class="cgdBtn" id="btnQueueWalk">ANDAR FILA</button>
              <button class="cgdBtn" id="btnQueueReset">RESETAR</button>
            </div>
            <div style="padding:10px; border-top:1px solid var(--border); font-size:11px; font-weight:900; opacity:.7">
              Última: <b id="lastServed">—</b> • <span id="statusLine">Atualizado: —</span>
            </div>
          </aside>
        </div>

        <div class="cgdBottom">
          <div class="bLeft">
            <div class="cgdBossPics" id="bossPics"></div>
            <div>
              <div class="cgdAddrLabel">Endereço</div>
              <div class="cgdAddr">Av Ayrton Senna, 2500, SS109, Barra da Tijuca</div>
            </div>
          </div>
          <div class="bCenter">System created by GRUPO CGD</div>
          <div class="bRight">
            <div class="cgdCnpj">
              <div class="blk">
                <div><b>CGD CORRETORA</b></div>
                <div>CNPJ 01.654.471/0001-86 • SUSEP 202031791</div>
              </div>
              <div class="blk">
                <div><b>CGD BARRA</b></div>
                <div>CNPJ 53.013.848/0001-11 • SUSEP 242158650</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================
  // Queue JSON via Pipeline 27
  // =========================
  async function ensureQueueDeal(){
    const items = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        "%TITLE": CONFIG.QUEUE.TITLE_KEY
      },
      order: { ID:"DESC" },
      select: ["ID","TITLE", CONFIG.QUEUE.UF_QUEUE_JSON, "DATE_MODIFY"]
    }, 5);

    if(items && items[0]) return items[0];

    const id = await bx("crm.deal.add", {
      fields: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        TITLE: `${CONFIG.QUEUE.TITLE_KEY} FILA ATENDIMENTO`,
        [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify({ v:1, order:[], hiddenUsers:[], updatedAt: Date.now() })
      }
    });
    return bx("crm.deal.get", { id: String(id) });
  }

  function parseQueue(json){
    try{
      const o = JSON.parse(json || "{}");
      const order = Array.isArray(o.order) ? o.order.map(String) : [];
      const hiddenUsers = Array.isArray(o.hiddenUsers) ? o.hiddenUsers.map(String) : [];
      const updatedAt = +o.updatedAt || 0;
      return { order, hiddenUsers, updatedAt };
    }catch(_){
      return { order:[], hiddenUsers:[], updatedAt:0 };
    }
  }

  let queueBusy = false;
  async function withQueueLock(fn){
    for(let i=0; i<20 && queueBusy; i++) await sleep(60);
    queueBusy = true;
    try{ return await fn(); }
    finally{ queueBusy = false; }
  }

  async function fetchQueue(){
    return withQueueLock(async ()=>{
      let lastErr = null;
      for(let attempt=0; attempt<3; attempt++){
        try{
          const deal = await ensureQueueDeal();
          const raw = deal && deal[CONFIG.QUEUE.UF_QUEUE_JSON];
          return { dealId: String(deal.ID), ...parseQueue(raw) };
        }catch(err){
          lastErr = err;
          await sleep(200 + attempt*350);
        }
      }
      throw lastErr || new Error("Falha ao carregar fila");
    });
  }

  async function saveQueue(dealId, payload){
    return withQueueLock(async ()=>{
      const next = {
        v: 1,
        order: Array.isArray(payload.order) ? payload.order.map(String) : [],
        hiddenUsers: Array.isArray(payload.hiddenUsers) ? payload.hiddenUsers.map(String) : [],
        updatedAt: Date.now()
      };

      let lastErr = null;
      for(let attempt=0; attempt<3; attempt++){
        try{
          await bx("crm.deal.update", {
            id: String(dealId),
            fields: { [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify(next) }
          });
          return;
        }catch(err){
          lastErr = err;
          await sleep(220 + attempt*420);
        }
      }
      throw lastErr || new Error("Falha ao salvar fila");
    });
  }

  // =========================
  // Render queue sidebar
  // =========================
  function setStatus(txt){
    const el = $("#statusLine");
    if(el) el.textContent = txt;
  }
  function setLastServed(name){
    state.lastServedUserName = name || "—";
    const el = $("#lastServed");
    if(el) el.textContent = state.lastServedUserName;
  }

  function renderQueueSidebar(){
    const body = $("#queueBody");
    if(!body) return;
    body.innerHTML = "";

    const order = (state.queue.order || []).map(String);
    if(order.length === 0){
      const d = document.createElement("div");
      d.style.opacity = ".75";
      d.style.fontWeight = "900";
      d.textContent = "Fila vazia. Clique em Gerenciar para adicionar usuárias.";
      body.appendChild(d);
      return;
    }

    order.forEach((id, idx)=>{
      const u = CONFIG.USERS.find(x=> String(x.id)===String(id));
      const row = document.createElement("div");
      row.className = "cgdQueueRowItem";
      row.innerHTML = `
        <div style="display:grid; grid-template-columns:42px minmax(0,1fr); gap:10px; align-items:center; min-width:0; padding-right:4px">
          <div class="ord">#${idx+1}</div>
          <div class="nm">${esc(u ? u.name : ("USER "+id))}</div>
        </div>
        <div class="cgdQueueArrows">
          <button class="cgdMiniBtn" data-q-up="${esc(id)}">↑</button>
          <button class="cgdMiniBtn" data-q-down="${esc(id)}">↓</button>
        </div>
      `;
      body.appendChild(row);
    });
  }

  function moveQueueLocal(userId, dir){
    const id = String(userId);
    const arr = (state.queue.order || []).map(String);
    const i = arr.indexOf(id);
    if(i < 0) return arr;
    if(dir==="up" && i>0){
      const t = arr[i-1]; arr[i-1]=arr[i]; arr[i]=t;
    }
    if(dir==="down" && i < arr.length-1){
      const t = arr[i+1]; arr[i+1]=arr[i]; arr[i]=t;
    }
    return arr;
  }

  async function persistQueueOrder(nextOrder){
    const q = state.queue.dealId ? state.queue : await fetchQueue();
    state.queueLocalTouchTs = Date.now();
    state.queue = { ...state.queue, ...q, order: nextOrder.slice() };
    renderQueueSidebar();
    enqueueOp("saveQueueOrder", async ()=>{ await saveQueue(q.dealId, { order: nextOrder, hiddenUsers: q.hiddenUsers||[] }); });
    flushOps();
  }

  // =========================
  // LEADS
  // =========================
  async function fetchNewLeadsAll(){
    const items = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_BATCH_MAX);
    return items || [];
  }

  async function fetchNewLeadsCount(){
    const data = await bxRaw("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: ["ID"],
      start: 0
    }, { timeoutMs: 16000 });
    const total = Number(data && data.total);
    if(Number.isFinite(total)) return total;
    const items = Array.isArray(data?.result) ? data.result : [];
    return items.length;
  }

  async function fetchPendingCount(){
    return await fetchNewLeadsCount();
  }

  // ✅ filtro base da contagem (portal tz +03)
  function countFilterBase(startISO, endISO){
    return {
      [">=" + CONFIG.UF_CONTAGEM_DATA]: startISO,
      ["<"  + CONFIG.UF_CONTAGEM_DATA]: endISO,
      "STATUS_ID": CONFIG.COUNT_STATUS_ALLOWED.slice()
    };
  }

  async function fetchPegCountRangeAll(startISO, endISO){
    const data = await bxRaw("crm.lead.list", {
      filter: countFilterBase(startISO, endISO),
      order: { ID: "DESC" },
      select: ["ID"],
      start: 0
    }, { timeoutMs: 18000 });
    const total = Number(data && data.total);
    if(Number.isFinite(total)) return total;
    const items = Array.isArray(data?.result) ? data.result : [];
    return items.length;
  }

  async function fetchPegCountRangeUser(userId, startISO, endISO){
    const data = await bxRaw("crm.lead.list", {
      filter: {
        ...countFilterBase(startISO, endISO),
        "ASSIGNED_BY_ID": String(userId),
      },
      order: { ID: "DESC" },
      select: ["ID"],
      start: 0
    }, { timeoutMs: 18000 });
    const total = Number(data && data.total);
    if(Number.isFinite(total)) return total;
    const items = Array.isArray(data?.result) ? data.result : [];
    return items.length;
  }

  // ✅ contar por USER + STATUS em um range (usado na taxa de sucesso 30d)
  async function fetchPegCountRangeUserStatus(userId, statusId, startISO, endISO){
    const data = await bxRaw("crm.lead.list", {
      filter: {
        [">=" + CONFIG.UF_DATA_PEGAR]: startISO,
        ["<"  + CONFIG.UF_DATA_PEGAR]: endISO,
        "ASSIGNED_BY_ID": String(userId),
        "STATUS_ID": String(statusId)
      },
      order: { ID: "DESC" },
      select: ["ID"],
      start: 0
    }, { timeoutMs: 18000 });

    const total = Number(data && data.total);
    if(Number.isFinite(total)) return total;
    const items = Array.isArray(data?.result) ? data.result : [];
    return items.length;
  }

  function leadDisplayName(it){
    const nm = [it.NAME, it.SECOND_NAME, it.LAST_NAME].filter(Boolean).map(String).join(" ").trim();
    if(nm) return nm;
    const t = String(it.TITLE||"").trim();
    if(t && !/^Lead\s*#\d+$/i.test(t)) return t;
    if(t) return t;
    return `Lead #${it.ID}`;
  }

  function pickUF(it, key){
    try{
      return it && Object.prototype.hasOwnProperty.call(it, key) ? it[key] : (it ? it[key] : "");
    }catch(_){ return ""; }
  }

  function bestPhone(it){
    const uf = pickUF(it, CONFIG.UF_TELEFONE);
    if(uf) return String(uf);
    const p = it && it.PHONE;
    if(Array.isArray(p) && p[0] && p[0].VALUE) return String(p[0].VALUE);
    return "";
  }

  function operStyle(operRaw){
    const op = String(operRaw||"").toUpperCase();
    if(op.includes("LEVE")) return { bg:"#f5a23a", fg:"#111" };
    if(op.includes("PREVENT")) return { bg:"#0a2a66", fg:"#fff" };
    if(op.includes("MEDSENIOR")) return { bg:"#63c454", fg:"#111" };
    if(op.includes("AMIL")) return { bg:"#7db7ff", fg:"#111" };
    if(op.includes("UNIMED")) return { bg:"#2f6f4f", fg:"#fff" };
    if(op.includes("ALICE")) return { bg:"#ff7bb8", fg:"#111" };
    return { bg:"rgba(255,255,255,.9)", fg:"rgba(18,26,40,.92)" };
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
    if(fonte) b.push(["ORIGEM", fonte]);
    if(dt)    b.push(["DATA", dt]);

    return b.slice(0, 6);
  }

  async function leadUpdate(id, fields){
    return bx("crm.lead.update", { id: String(id), fields });
  }
  async function leadDelete(id){
    return bx("crm.lead.delete", { id: String(id) });
  }

  async function actionPickLead(leadId, userId, rotateQueue){
    state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(leadId));
    state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
    renderNewLeads(state.newLeadsRender);
    renderPendingCount(state.pendingCount - 1);

    enqueueOp("pickLead", async ()=>{
      await leadUpdate(leadId, {
        ASSIGNED_BY_ID: String(userId),
        STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
        // ✅ grava Data PEGAR no padrão do portal (+03:00)
        [CONFIG.UF_DATA_PEGAR]: isoNowPortal()
      });
    });

    if(rotateQueue){
      enqueueOp("rotateQueueOnPick", async ()=>{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        const order = (q.order||[]).map(String);
        const uid = String(userId);
        const i = order.indexOf(uid);
        if(i >= 0){
          order.splice(i,1);
          order.push(uid);
          await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
          state.queueLocalTouchTs = Date.now();
          state.queue = { ...state.queue, ...q, order };
        }
      });
    }

    flushOps();
  }

  async function actionDiscardLead(leadId){
    state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(leadId));
    state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
    renderNewLeads(state.newLeadsRender);
    renderPendingCount(state.pendingCount - 1);

    enqueueOp("discardLead", async ()=>{
      await leadUpdate(leadId, { STATUS_ID: CONFIG.LEAD_STATUS.PERDIDO });
    });
    flushOps();
  }

  async function actionMoveLead(leadId, statusId){
    enqueueOp("moveLead", async ()=>{
      const fields = { STATUS_ID: statusId };
      if(statusId === CONFIG.LEAD_STATUS.QUALIFICADO){
        const lead = await bx("crm.lead.get", { id: String(leadId) });
        const t = String(lead?.TITLE||"").trim();
        if(!t.startsWith(CONFIG.HOT_EMOJI)){
          fields.TITLE = `${CONFIG.HOT_EMOJI} ${t}`.trim();
        }
      }
      await leadUpdate(leadId, fields);
    });
    flushOps();
  }

  async function actionTransferLead(leadId, toUserId){
    enqueueOp("transferLead", async ()=>{
      await leadUpdate(leadId, { ASSIGNED_BY_ID: String(toUserId) });
    });
    flushOps();
  }

  async function actionSetPrazo(leadId, iso){
    enqueueOp("setPrazo", async ()=>{
      await leadUpdate(leadId, { [CONFIG.UF_PRAZO]: iso });
    });
    flushOps();
  }

  async function createFollowUpDeal(userId, lead, iso){
    const stage = CONFIG.FOLLOWUP_DEALS.STAGE_BY_USER[String(userId)];
    const title = `FOLLOW-UP • ${leadDisplayName(lead)} • Lead #${lead.ID}`;
    enqueueOp("createDealFollowUp", async ()=>{
      await bx("crm.deal.add", {
        fields: {
          CATEGORY_ID: CONFIG.FOLLOWUP_DEALS.CATEGORY_ID,
          STAGE_ID: stage || "C17:NEW",
          ASSIGNED_BY_ID: String(userId),
          TITLE: title,
          COMMENTS: `Gerado pelo Painel de Leads • Referência: Lead #${lead.ID}`,
          [CONFIG.UF_PRAZO]: iso || undefined
        }
      });
    });
    flushOps();
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
        <div class="cgdActions">
          <button class="cgdMiniBtn danger" data-discard="${esc(id)}">DESCARTAR</button>
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

  function computeUserOrder(){
    const users = CONFIG.USERS.slice();
    const hiddenSet = new Set((state.queue.hiddenUsers||[]).map(String));
    const visible = users.filter(u => !hiddenSet.has(String(u.id)));

    function lastTs(u){
      const h = state.userStats[u.id];
      const d = h?.lastTwo?.[0]?.DATE_MODIFY;
      if(!d) return 0;
      const t = Date.parse(String(d));
      return Number.isFinite(t) ? t : 0;
    }

    visible.sort((a,b)=> lastTs(b)-lastTs(a));
    return visible;
  }

  function renderWho(){
    const list = $("#listWho");
    if(!list) return;
    list.innerHTML = "";

    const ordered = computeUserOrder();
    ordered.forEach(u=>{
      const us = state.userStats[u.id] || { pulledToday:0, pulledMonth:0, lastTwo:[], success30:{attended:0, converted:0, pct:0} };
      const l1 = us.lastTwo[0];
      const l2 = us.lastTwo[1];

      const last1 = l1 ? `Último: ${leadDisplayName(l1)}` : "Último: —";
      const last2 = l2 ? `Anterior: ${leadDisplayName(l2)}` : "Anterior: —";

      const imgUrl = state.userPhoto.get(String(u.id)) || BLANK_IMG;
      const suc = us.success30 || { attended:0, converted:0, pct:0 };

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.style.padding = "9px";
      card.innerHTML = `
        <div class="cgdUserLine">
          <img class="cgdUserPic" alt="${esc(u.name)}" loading="lazy" src="${esc(imgUrl || BLANK_IMG)}" data-user-pic="${esc(u.id)}" />
          <div style="width:100%; min-width:0">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px">
              <div style="font-weight:950; font-size:13px; line-height:1.15; min-width:0; word-break:break-word">${esc(u.name)}</div>
              <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; justify-content:flex-end; flex:0 0 auto">
                <span class="cgdBadge">dia: ${esc(us.pulledToday||0)}</span>
                <span class="cgdBadge">mês: ${esc(us.pulledMonth||0)}</span>
              </div>
            </div>
            <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap">
              <span class="cgdBadge">sucesso 30d: ${esc(suc.pct||0)}% (${esc(suc.converted||0)}/${esc(suc.attended||0)})</span>
            </div>
            <div style="margin-top:7px; font-size:11px; font-weight:900; opacity:.84; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(last1)}</div>
            <div style="margin-top:3px; font-size:11px; font-weight:900; opacity:.72; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(last2)}</div>
          </div>
        </div>
      `;
      list.appendChild(card);
    });

    if(ordered.length===0){
      const empty = document.createElement("div");
      empty.style.opacity=".75";
      empty.style.fontWeight="900";
      empty.textContent="Nenhuma usuária para mostrar (todas ocultas).";
      list.appendChild(empty);
    }
  }

  // =========================
  // Fetch Usuárias (rápido)
  // =========================
  async function fetchUserLastTwoFast(userId){
    const last = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","NAME","LAST_NAME","SECOND_NAME","STATUS_ID","ASSIGNED_BY_ID","DATE_MODIFY"]
    }, CONFIG.LIMIT_LAST_TWO_FETCH);

    const lastTwo = (last||[]).filter(x=>{
      const st = String(x.STATUS_ID||"");
      return st===CONFIG.LEAD_STATUS.EM_ATENDIMENTO || st===CONFIG.LEAD_STATUS.QUALIFICADO || st===CONFIG.LEAD_STATUS.ATENDIDO;
    }).slice(0,2);

    return { lastTwo };
  }

  // =========================
  // ABRIR: FULL + retry
  // =========================
  async function fetchUserStatsFull(userId){
    const { startISO: dayS, endISO: dayE } = dayRangePortal();
    const { startISO: monS, endISO: monE } = monthRangePortal();
    const { startISO: r30S, endISO: r30E } = last30DaysRangePortal();

    const pulledToday = await fetchPegCountRangeUser(userId, dayS, dayE);
    const pulledMonth = await fetchPegCountRangeUser(userId, monS, monE);

    const [att30, conv30] = await Promise.all([
      fetchPegCountRangeUserStatus(userId, CONFIG.LEAD_STATUS.ATENDIDO, r30S, r30E),
      fetchPegCountRangeUserStatus(userId, CONFIG.LEAD_STATUS.LEAD_CONVERTIDO_SISTEMA, r30S, r30E)
    ]);
    const pct = (att30 > 0) ? Math.round((conv30 / att30) * 100) : 0;

    const list = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_USER_LAST);

    const lastTwo = (list||[]).filter(x=>{
      const st = String(x.STATUS_ID||"");
      return st===CONFIG.LEAD_STATUS.EM_ATENDIMENTO || st===CONFIG.LEAD_STATUS.QUALIFICADO || st===CONFIG.LEAD_STATUS.ATENDIDO;
    }).slice(0,2);

    return {
      pulledToday: pulledToday||0,
      pulledMonth: pulledMonth||0,
      lastTwo,
      list: list || [],
      success30: { attended: att30||0, converted: conv30||0, pct }
    };
  }

  async function fetchUserStatsFullRetry(userId){
    let lastErr = null;
    for(let i=0;i<3;i++){
      try{
        return await fetchUserStatsFull(userId);
      }catch(err){
        lastErr = err;
        await sleep(260 + i*520);
      }
    }
    throw lastErr || new Error("Falha ao carregar dados da usuária");
  }

  // =========================
  // Modals: Ocultar / Fila / Pegar / Batch
  // (iguais — mantidos)
  // =========================
  async function modalHideUsers(){
    openModal("OCULTAR USUÁRIAS", `<div style="font-weight:900;opacity:.75">Carregando…</div>`);
    let q;
    try{ q = await fetchQueue(); }
    catch(_){ closeModal(); return openModal("OCULTAR USUÁRIAS", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`); }

    const hiddenSet = new Set((q.hiddenUsers||[]).map(String));

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Ocultar/mostrar cards de usuárias (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="huNone">Mostrar todas</button>
        <button class="cgdBtn" id="huApply">Aplicar</button>
      </div>

      <table class="cgdTable">
        <thead><tr><th>Oculta</th><th>Usuária</th></tr></thead>
        <tbody>
          ${CONFIG.USERS.map(u=>{
            const checked = hiddenSet.has(String(u.id)) ? "checked" : "";
            return `<tr>
              <td style="width:90px"><input type="checkbox" data-hu-user="${esc(u.id)}" ${checked} /></td>
              <td><b>${esc(u.name)}</b></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;

    openModal("OCULTAR USUÁRIAS", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`);

    $("#huNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-hu-user]').forEach(ch=> ch.checked = false);
    });

    $("#huApply")?.addEventListener("click", async ()=>{
      const btn = $("#huApply");
      try{
        btn.disabled = true;
        const hidden = $$('input[type=checkbox][data-hu-user]')
          .filter(ch=> ch.checked)
          .map(ch=> String(ch.getAttribute("data-hu-user")));

        await saveQueue(q.dealId, { order: q.order||[], hiddenUsers: hidden });

        const fresh = await fetchQueue();
        state.queue = { ...state.queue, ...fresh };
        renderQueueSidebar();
        renderWho();
        setStatus(`Atualizado: ${nowBRTime()}`);
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

async function modalQueueManage(){
    openModal("FILA • GERENCIAR", `<div style="font-weight:900;opacity:.75">Carregando…</div>`);
    let q;
    try{ q = await fetchQueue(); }
    catch(_){ closeModal(); return openModal("FILA • GERENCIAR", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`); }

    state.queue = { ...state.queue, ...q };

    const current = (q.order || []).map(String);
    const currentSet = new Set(current);

    const rows = CONFIG.USERS.map(u=>{
      const checked = currentSet.has(String(u.id)) ? "checked" : "";
      return `<tr data-u="${esc(u.id)}">
        <td style="width:90px"><input type="checkbox" data-q-user="${esc(u.id)}" ${checked} /></td>
        <td><b>${esc(u.name)}</b></td>
      </tr>`;
    }).join("");

    const body = `
      <div style="font-weight:950; margin-bottom:10px">Adicionar / retirar usuárias da fila</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="qAll">Selecionar todas</button>
        <button class="cgdBtn" id="qNone">Limpar</button>
        <button class="cgdBtn" id="qApply">Aplicar alterações</button>
      </div>

      <table class="cgdTable">
        <thead><tr><th>Na fila</th><th>Usuária</th></tr></thead>
        <tbody id="qTbody">${rows}</tbody>
      </table>
    `;

    openModal("FILA • GERENCIAR", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`);

    const tbody = $("#qTbody");
    const getChecked = ()=> $$('input[type=checkbox][data-q-user]', tbody)
      .filter(ch=>ch.checked)
      .map(ch=> String(ch.getAttribute("data-q-user")));

    $("#qAll")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-q-user]', tbody).forEach(ch => ch.checked = true);
    });
    $("#qNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-q-user]', tbody).forEach(ch => ch.checked = false);
    });

    $("#qApply")?.addEventListener("click", async ()=>{
      const btn = $("#qApply");
      try{
        btn.disabled = true;

        const checked = getChecked();
        const keep = current.filter(id=> checked.includes(id));
        const add = checked.filter(id=> !keep.includes(id));
        const next = keep.concat(add);

        await saveQueue(q.dealId, { order: next, hiddenUsers: q.hiddenUsers||[] });
        const fresh = await fetchQueue();
        state.queueLocalTouchTs = Date.now();
        state.queue = { ...state.queue, ...fresh };
        renderQueueSidebar();
        setStatus(`Atualizado: ${nowBRTime()}`);
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

async function modalPickLead(leadId){
    const uops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");
    const body = `
      <div style="font-weight:950;margin-bottom:10px">PEGAR lead</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="pickFirst">PRIMEIRA DA FILA</button>
      </div>

      <div style="height:1px;background:rgba(30,40,70,.10);margin:10px 0"></div>

      <div style="font-weight:950;margin-bottom:8px">Ou selecionar usuária:</div>
      <div class="cgdRow">
        <select class="cgdSelect" id="pickUser">${uops}</select>
        <button class="cgdBtn" id="pickGo">Confirmar</button>
      </div>
      <div style="font-size:11px;font-weight:900;opacity:.75;margin-top:10px">
        Ao confirmar: muda responsável e envia para <b>EM ATENDIMENTO</b>. A usuária vai para o final da fila.
      </div>
    `;
    openModal("PEGAR LEAD", body, `<button class="cgdBtn" data-close-modal>Cancelar</button>`);

    $("#pickFirst")?.addEventListener("click", async ()=>{
      const btn = $("#pickFirst");
      try{
        btn.disabled = true;

        const q = state.queue.dealId ? state.queue : await fetchQueue();
        const order = (q.order||[]).map(String);
        if(order.length === 0){
          alert("Fila vazia. Clique em FILA > Gerenciar para adicionar usuárias.");
          return;
        }

        const firstId = order.shift();
        order.push(firstId);

        state.queueLocalTouchTs = Date.now();
        state.queue = { ...state.queue, ...q, order: order.slice() };
        renderQueueSidebar();

        const nm = userNameById(firstId);
        setLastServed(nm);
        setStatus(`Próxima: ${nm} • ${nowBRTime()}`);

        enqueueOp("saveQueueRotate", async ()=>{
          await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
        });

        await actionPickLead(leadId, firstId, false);
        flushOps();
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });

    $("#pickGo")?.addEventListener("click", async ()=>{
      const btn = $("#pickGo");
      try{
        btn.disabled = true;
        const uid = $("#pickUser").value;
        await actionPickLead(leadId, uid, true);
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

async function modalBatchTransfer(){
    openModal("TRANSFERIR EM LOTE", `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote</div>
      <div style="opacity:.75;font-weight:900">Carregando leads pendentes…</div>
    `);

    let all;
    try{
      all = state.newLeadsAll && state.newLeadsAll.length ? state.newLeadsAll.slice() : await fetchNewLeadsAll();
    }catch(_){
      closeModal();
      return openModal("TRANSFERIR EM LOTE", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    const opsUser = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");

    function uniq(arr){
      const s = new Set(arr.filter(Boolean).map(String));
      return Array.from(s).sort((a,b)=> String(a).localeCompare(String(b)));
    }

    const operadoras = uniq(all.map(it=> pickUF(it, CONFIG.UF_OPERADORA)));
    const opsOper = [`<option value="ALL">Todas</option>`].concat(
      operadoras.map(o=> `<option value="${esc(o)}">${esc(o)}</option>`)
    ).join("");

    const body = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; flex-wrap:wrap">
        <div style="font-weight:950; font-size:14px">Transferir em lote</div>
        <div class="cgdRow">
          <div class="cgdBadge">Leads listados: <b id="btCount">0</b></div>
          <div class="cgdBadge">Pendentes total: <b>${esc(state.pendingCount||all.length)}</b></div>
        </div>
      </div>

      <div class="cgdRow" style="margin-bottom:12px; align-items:end">
        <div style="display:flex; flex-direction:column; gap:6px">
          <label style="font-weight:950">Operadora</label>
          <select class="cgdSelect" id="btOper">${opsOper}</select>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px">
          <label style="font-weight:950">Data do lead</label>
          <input class="cgdInput" type="date" id="btDate" />
        </div>

        <div style="display:flex; flex-direction:column; gap:6px">
          <label style="font-weight:950">Transferir para</label>
          <select class="cgdSelect" id="btUser">${opsUser}</select>
        </div>

        <button class="cgdBtn" id="btApply">Aplicar filtro</button>
        <button class="cgdBtn" id="btAll">Selecionar todos</button>
        <button class="cgdBtn" id="btNone">Desmarcar todos</button>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:70px">Sel.</th>
            <th style="width:290px">Lead</th>
            <th style="width:180px">Idade e bairro</th>
            <th style="width:190px">Operadora</th>
            <th style="width:190px">Origem do lead</th>
            <th style="width:150px">Data do lead</th>
          </tr>
        </thead>
        <tbody id="btTbody"></tbody>
      </table>
    `;

    openModal("TRANSFERIR EM LOTE", body, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
      <button class="cgdBtn" id="btDo">Transferir selecionados</button>
    `);

    $(".cgdModal")?.classList.add("cgdModalWide");

    const tbody = $("#btTbody");
    const countEl = $("#btCount");

    function matchDate(it, yyyy_mm_dd){
      if(!yyyy_mm_dd) return true;
      const dtuf = pickUF(it, CONFIG.UF_DT_LEAD);
      const t = Date.parse(String(dtuf||""));
      if(!Number.isFinite(t)) return false;
      const d = new Date(t);
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,"0");
      const da= String(d.getDate()).padStart(2,"0");
      return `${y}-${m}-${da}` === yyyy_mm_dd;
    }

    function filtered(){
      const op = $("#btOper").value;
      const date = $("#btDate").value;
      return all.filter(it=>{
        const oper = String(pickUF(it, CONFIG.UF_OPERADORA)||"");
        if(op!=="ALL" && oper!==op) return false;
        if(!matchDate(it, date)) return false;
        return true;
      });
    }

    function draw(list){
      countEl.textContent = String(list.length);
      tbody.innerHTML = list.length ? list.map(it=>{
        const nome = leadDisplayName(it);
        const tel = bestPhone(it) || "—";
        const idade = pickUF(it, CONFIG.UF_IDADE) || "—";
        const bairro = pickUF(it, CONFIG.UF_BAIRRO) || "—";
        const oper = pickUF(it, CONFIG.UF_OPERADORA) || "—";
        const origem = pickUF(it, CONFIG.UF_FONTE) || "—";
        const dtuf = pickUF(it, CONFIG.UF_DT_LEAD);
        const data = dtuf ? String(fmtDateBRFromISO(dtuf)).slice(0,10) : "—";
        return `
          <tr>
            <td><input type="checkbox" data-bt-id="${esc(it.ID)}" checked /></td>
            <td>
              <div style="font-weight:950">${esc(nome)}</div>
              <div style="opacity:.78;font-weight:900;font-size:11px; margin-top:3px">${esc(tel)}</div>
            </td>
            <td>
              <div style="font-weight:900">${esc(idade)}</div>
              <div style="opacity:.76;font-weight:900;font-size:11px; margin-top:3px">${esc(bairro)}</div>
            </td>
            <td style="font-weight:900">${esc(oper)}</td>
            <td style="font-weight:900">${esc(origem)}</td>
            <td style="font-weight:900">${esc(data)}</td>
          </tr>
        `;
      }).join("") : `<tr><td colspan="6" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    draw(filtered());
    $("#btApply")?.addEventListener("click", ()=> draw(filtered()));
    $("#btAll")?.addEventListener("click", ()=> $$("input[type=checkbox][data-bt-id]", tbody).forEach(x=> x.checked = true));
    $("#btNone")?.addEventListener("click", ()=> $$("input[type=checkbox][data-bt-id]", tbody).forEach(x=> x.checked = false));

    $("#btDo")?.addEventListener("click", async ()=>{
      const btn = $("#btDo");
      const toId = $("#btUser").value;
      const ids = $$("input[type=checkbox][data-bt-id]", tbody)
        .filter(x=>x.checked)
        .map(x=> x.getAttribute("data-bt-id"));

      if(ids.length === 0) return alert("Selecione pelo menos 1 lead.");
      try{
        btn.disabled = true;

        ids.forEach(id=>{
          state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(id));
        });
        state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
        renderNewLeads(state.newLeadsRender);

        for(const id of ids){
          await actionPickLead(id, toId, true);
          await sleep(60);
        }
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  // =========================
  // Busca global (mantida)
  // =========================
  function uniqById(list){
    const m = new Map();
    (list||[]).forEach(x=>{
      const id = String(x.ID||"");
      if(id) m.set(id, x);
    });
    return Array.from(m.values());
  }

  async function searchLeadsByName(term, assignedIdOrAll){
    const t = String(term||"").trim();
    if(!t) return [];

    const baseFilter = {};
    if(assignedIdOrAll && assignedIdOrAll !== "ALL"){
      baseFilter["ASSIGNED_BY_ID"] = String(assignedIdOrAll);
    }

    const a = await bxListAll("crm.lead.list", {
      filter: { ...baseFilter, "%TITLE": t },
      order: { DATE_MODIFY:"DESC" },
      select: CONFIG.LEAD_SELECT
    }, 60).catch(()=>[]);

    const b = await bxListAll("crm.lead.list", {
      filter: { ...baseFilter, "%NAME": t },
      order: { DATE_MODIFY:"DESC" },
      select: CONFIG.LEAD_SELECT
    }, 60).catch(()=>[]);

    const c = await bxListAll("crm.lead.list", {
      filter: { ...baseFilter, "%LAST_NAME": t },
      order: { DATE_MODIFY:"DESC" },
      select: CONFIG.LEAD_SELECT
    }, 60).catch(()=>[]);

    const merged = uniqById([...(a||[]), ...(b||[]), ...(c||[])]);
    return merged.slice(0, 60);
  }

  function modalTransferOne(leadId){
    const opts = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");
    openModal("TRANSFERIR LEAD", `
      <div style="font-weight:950;margin-bottom:10px">Transferir Lead #${esc(leadId)}</div>
      <div class="cgdRow">
        <select class="cgdSelect" id="trUser">${opts}</select>
        <button class="cgdBtn" id="trGo">Transferir</button>
      </div>
      <div style="opacity:.75;font-weight:900;margin-top:10px">Apenas muda o RESPONSÁVEL (não altera etapa).</div>
    `, `<button class="cgdBtn" data-close-modal>Cancelar</button>`);
    $("#trGo")?.addEventListener("click", async ()=>{
      const btn = $("#trGo");
      try{
        btn.disabled = true;
        const uid = $("#trUser").value;
        await actionTransferLead(leadId, uid);
        alert("Transferência enfileirada ✅");
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  function modalSearchResults(term, results){
    const rows = (results||[]).map(it=>{
      const name = leadDisplayName(it);
      const st = stageName(it.STATUS_ID);
      const respId = String(it.ASSIGNED_BY_ID||"");
      const respNm = userNameById(respId);
      const info = leadBadgesRich(it);
      const infoHtml = info.map(([k,v])=>{
        if(k==="OPERADORA"){
          const s = operStyle(v);
          return `<span class="cgdBadge oper" style="background:${esc(s.bg)};color:${esc(s.fg)}">${esc(k)}: ${esc(v)}</span>`;
        }
        return `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`;
      }).join(" ");

      return `
        <tr>
          <td style="width:70px"><input type="checkbox" data-sel-del="${esc(it.ID)}" /></td>
          <td>
            <b>${esc(name)}</b>
            <div style="opacity:.7;font-weight:900;font-size:11px">STAGE: ${esc(st)} • RESPONSÁVEL: <b>${esc(respNm)}</b></div>
            <div class="cgdBadges" style="margin-top:8px">${infoHtml || ""}</div>
          </td>
          <td style="width:240px;text-align:right">
            <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
              <button class="cgdBtn" data-open-lead="${esc(it.ID)}">Abrir</button>
              <button class="cgdBtn" data-transfer-lead="${esc(it.ID)}">Transferir</button>
              <button class="cgdBtn" data-del-one="${esc(it.ID)}">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    openModal(`BUSCA • ${term}`, `
      <div class="cgdRow" style="justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:950">Resultados: <b>${esc((results||[]).length)}</b></div>
        <div class="cgdRow">
          <button class="cgdBtn" id="sdAll">Marcar todos</button>
          <button class="cgdBtn" id="sdNone">Desmarcar</button>
          <button class="cgdBtn" id="sdDel">Excluir selecionados</button>
        </div>
      </div>
      <table class="cgdTable">
        <thead><tr><th>Sel.</th><th>Lead</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead encontrado.</td></tr>`}</tbody>
      </table>
    `);

    $("#sdAll")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-sel-del]').forEach(ch=> ch.checked = true);
    });
    $("#sdNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-sel-del]').forEach(ch=> ch.checked = false);
    });

    $("#sdDel")?.addEventListener("click", async ()=>{
      const ids = $$('input[type=checkbox][data-sel-del]').filter(ch=>ch.checked).map(ch=>ch.getAttribute("data-sel-del"));
      if(!ids.length) return alert("Selecione pelo menos 1 lead para excluir.");
      if(!confirm(`Excluir ${ids.length} lead(s)?`)) return;
      try{
        for(const id of ids){
          enqueueOp("deleteLead", async ()=>{ await leadDelete(id); });
          await sleep(40);
        }
        flushOps();
        alert("Exclusões enfileiradas ✅");
        closeModal();
      }catch(err){
        console.error(err);
      }
    });

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const b = e.target.closest("[data-open-lead]");
      const t = e.target.closest("[data-transfer-lead]");
      const d = e.target.closest("[data-del-one]");

      if(b){
        const id = b.getAttribute("data-open-lead");
        await modalLeadDetails(id);
      }
      if(t){
        const id = t.getAttribute("data-transfer-lead");
        modalTransferOne(id);
      }
      if(d){
        const id = d.getAttribute("data-del-one");
        if(!confirm(`Excluir Lead #${id}?`)) return;
        enqueueOp("deleteLeadOne", async ()=>{ await leadDelete(id); });
        flushOps();
        alert("Exclusão enfileirada ✅");
      }
    });
  }

  async function modalLeadDetails(leadId){
    openModal("LEAD", `<div style="opacity:.75;font-weight:900">Carregando…</div>`);
    try{
      const it = await bx("crm.lead.get", { id: String(leadId) });
      const name = leadDisplayName(it);
      const st = stageName(it.STATUS_ID);

      const respId = String(it.ASSIGNED_BY_ID||"");
      const respNm = userNameById(respId);

      const info = leadBadgesRich(it);
      const infoHtml = info.map(([k,v])=>{
        if(k==="OPERADORA"){
          const s = operStyle(v);
          return `<span class="cgdBadge oper" style="background:${esc(s.bg)};color:${esc(s.fg)}">${esc(k)}: ${esc(v)}</span>`;
        }
        return `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`;
      }).join("");

      openModal(`LEAD • ${name}`, `
        <div class="cgdRow" style="margin-bottom:10px">
          <div class="cgdBadge">STAGE: <b>${esc(st)}</b></div>
          <div class="cgdBadge">RESPONSÁVEL: <b>${esc(respNm)}</b></div>
          <div class="cgdBadge">ID: <b>${esc(it.ID)}</b></div>
        </div>
        <div class="cgdBadges">${infoHtml || ""}</div>
      `);
    }catch(_){
      closeModal();
      openModal("LEAD", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }
  }

  // =========================
  // Refresh orchestration
  // =========================
  function renderPendingCountUI(){ renderPendingCount(state.pendingCount); }

  async function refreshNewLeads(){
    if(refreshGuards.newLeads) return;
    refreshGuards.newLeads = true;
    try{
      const all = await fetchNewLeadsAll();
      const prevIds = new Set((state.newLeadsAll||[]).map(x=> String(x.ID)));
      const nextIds = new Set((all||[]).map(x=> String(x.ID)));
      const hasNewArrival = (all||[]).some(x=> !prevIds.has(String(x.ID)));
      state.newLeadsAll = all || [];
      state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
      renderNewLeads(state.newLeadsRender);

      if((all||[]).length > 0){
        const blinkKey = Array.from(nextIds).sort().join(",");
        if(hasNewArrival && !state.newLeadBlinkKey.has(blinkKey)){
          state.newLeadBlinkKey.add(blinkKey);
          runRocketAcross();
          if(state.soundOn) playLeadAlert();
        }
      }else{
        state.newLeadBlinkKey.clear();
      }
    }catch(err){
      console.warn("new leads failed", err);
    }finally{
      refreshGuards.newLeads = false;
    }
  }

  async function refreshPendingCount(){
    if(refreshGuards.pending) return;
    refreshGuards.pending = true;
    try{
      const n = await fetchPendingCount();
      renderPendingCount(n);
    }catch(err){
      console.warn("pending failed", err);
    }finally{
      refreshGuards.pending = false;
    }
  }

  // ✅ aqui é o FIX da contagem (ranges no portal +03)
  async function refreshStats(){
    if(refreshGuards.stats) return;
    refreshGuards.stats = true;
    try{
      const { startISO: dayS, endISO: dayE } = dayRangePortal();
      const { startISO: monS, endISO: monE } = monthRangePortal();

      const [day, month] = await Promise.all([
        fetchPegCountRangeAll(dayS, dayE),
        fetchPegCountRangeAll(monS, monE)
      ]);

      state.stats = { day: day||0, month: month||0 };
      renderStats(state.stats);
    }catch(err){
      console.warn("stats failed", err);
    }finally{
      refreshGuards.stats = false;
    }
  }

  async function refreshUsersFast(){
    if(refreshGuards.users) return;
    refreshGuards.users = true;
    try{
      renderWho();

      const { startISO: dayS, endISO: dayE } = dayRangePortal();
      const { startISO: monS, endISO: monE } = monthRangePortal();
      const { startISO: r30S, endISO: r30E } = last30DaysRangePortal();

      const users = CONFIG.USERS.slice();
      for(let i=0;i<users.length;i+=5){
        const part = users.slice(i,i+5);
        const jobs = part.map(async u=>{
          const [d, m, lt, att30, conv30] = await Promise.all([
            fetchPegCountRangeUser(u.id, dayS, dayE),
            fetchPegCountRangeUser(u.id, monS, monE),
            fetchUserLastTwoFast(u.id),
            fetchPegCountRangeUserStatus(u.id, CONFIG.LEAD_STATUS.ATENDIDO, r30S, r30E),
            fetchPegCountRangeUserStatus(u.id, CONFIG.LEAD_STATUS.LEAD_CONVERTIDO_SISTEMA, r30S, r30E),
          ]);

          const pct = (att30 > 0) ? Math.round((conv30 / att30) * 100) : 0;

          state.userStats[u.id] = {
            ...(state.userStats[u.id]||{}),
            pulledToday: d||0,
            pulledMonth: m||0,
            lastTwo: lt.lastTwo || [],
            success30: { attended: att30||0, converted: conv30||0, pct }
          };
        });
        await Promise.all(jobs);
        renderWho();
        await sleep(60);
      }
    }catch(err){
      console.warn("user stats failed", err);
    }finally{
      refreshGuards.users = false;
    }
  }

  async function refreshQueue(){
    if(refreshGuards.queue) return;
    refreshGuards.queue = true;
    try{
      if(Date.now() - state.queueLocalTouchTs < 1400) return;
      const q = await fetchQueue();
      state.queue = { ...state.queue, ...q };
      renderQueueSidebar();
    }catch(err){
      console.warn("queue failed", err);
      renderQueueSidebar();
    }finally{
      refreshGuards.queue = false;
    }
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()})`);
    await Promise.allSettled([
      refreshNewLeads(),
      refreshPendingCount(),
      refreshStats(),
      refreshQueue()
    ]);
    await refreshUsersFast();
    setStatus(`Atualizado: ${nowBRTime()}`);
  }

  // =========================
  // UI events
  // =========================
  function updateSoundUI(){
    $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;
    const so = $("#btnSoundOn");
    if(so) so.style.display = state.soundOn ? "none" : "inline-block";
  }

  function applyDark(){
    document.body.classList.toggle("cgdDark", !!state.dark);
    const b = $("#btnDark");
    if(b) b.textContent = `Modo: ${state.dark ? "Escuro" : "Claro"}`;
  }

  function wire(){
    $("#btnSound")?.addEventListener("click", async ()=>{
      await unlockAudio();
      state.soundOn = !state.soundOn;
      updateSoundUI();
    });

    $("#btnSilence")?.addEventListener("click", ()=>{
      state.soundOn = false;
      updateSoundUI();
    });

    $("#btnSoundOn")?.addEventListener("click", async ()=>{
      await unlockAudio();
      state.soundOn = true;
      updateSoundUI();
    });

    $("#btnDark")?.addEventListener("click", ()=>{
      state.dark = !state.dark;
      applyDark();
    });

    $("#btnRefresh")?.addEventListener("click", async ()=>{ await unlockAudio(); hardRefreshAll(); });

    $("#btnBatch")?.addEventListener("click", modalBatchTransfer);
    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);

    $("#btnGET")?.addEventListener("click", ()=> window.open(CONFIG.LINKS.GET, "_blank", "noopener"));
    $("#btnVendas")?.addEventListener("click", ()=> window.open(CONFIG.LINKS.VENDAS, "_blank", "noopener"));

    $("#btnQueueManage")?.addEventListener("click", modalQueueManage);

    $("#queueBody")?.addEventListener("click", async (e)=>{
      const up = e.target.closest("[data-q-up]");
      const dn = e.target.closest("[data-q-down]");
      if(!up && !dn) return;
      try{
        const id = up ? up.getAttribute("data-q-up") : dn.getAttribute("data-q-down");
        const dir = up ? "up" : "down";
        const next = moveQueueLocal(id, dir);

        state.queueLocalTouchTs = Date.now();
        state.queue.order = next.slice();
        renderQueueSidebar();
        setStatus(`Fila ajustada • ${nowBRTime()}`);

        await persistQueueOrder(next);
      }catch(err){
        console.error(err);
      }
    });

    $("#btnQueueWalk")?.addEventListener("click", async ()=>{
      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        const order = (q.order||[]).map(String);
        if(order.length===0){
          alert("Fila vazia. Clique em Gerenciar para adicionar usuárias.");
          return;
        }
        const nextId = order.shift();
        order.push(nextId);

        state.queueLocalTouchTs = Date.now();
        state.queue = { ...state.queue, ...q, order: order.slice() };
        renderQueueSidebar();

        const nm = userNameById(nextId);
        setLastServed(nm);
        setStatus(`Andou fila: ${nm} • ${nowBRTime()}`);

        enqueueOp("queueWalk", async ()=>{ await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] }); });
        flushOps();
      }catch(err){
        console.error(err);
      }
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        state.queueLocalTouchTs = Date.now();
        state.queue = { ...state.queue, ...q, order: [] };
        renderQueueSidebar();
        enqueueOp("queueReset", async ()=>{ await saveQueue(q.dealId, { order: [], hiddenUsers: q.hiddenUsers||[] }); });
        flushOps();
      }catch(err){
        console.error(err);
      }
    });

    $("#btnSearch")?.addEventListener("click", async ()=>{
      const term = ($("#searchBox").value||"").trim();
      if(!term) return;
      const scope = ($("#searchScope").value||"ALL");
      openModal("BUSCA", `<div style="opacity:.75;font-weight:900">Buscando no Bitrix…</div>`);
      try{
        const res = await searchLeadsByName(term, scope);
        modalSearchResults(term, res);
      }catch(err){
        console.error(err);
        closeModal();
        openModal("BUSCA", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
      }
    });

    $("#searchBox")?.addEventListener("keydown", (e)=>{
      if(e.key==="Enter") $("#btnSearch")?.click();
    });

    document.addEventListener("click", (e)=>{
      const g = e.target.closest("[data-grab]");
      const d = e.target.closest("[data-discard]");

      if(g){
        const id = g.getAttribute("data-grab");
        modalPickLead(id);
      }
      if(d){
        const id = d.getAttribute("data-discard");
        actionDiscardLead(id);
      }
    });
  }

  // =========================
  // Start
  // =========================
  async function start(){
    if(!CONFIG.WEBHOOK){
      const sentinel = document.getElementById("cgd-sentinel");
      if(sentinel) sentinel.textContent = "⚠️ CONFIG.WEBHOOK vazio";
      return;
    }

    injectCSS();
    mount();
    wire();
    primeAudioUnlock();
    applyZoomCompensation();
    window.addEventListener("resize", applyZoomCompensation, { passive:true });
    updateSoundUI();
    applyDark();

    warmUserPhotos().then(()=> renderBossPics()).catch(()=>{});

    await Promise.allSettled([refreshNewLeads(), refreshPendingCount(), refreshStats(), refreshQueue()]);
    refreshUsersFast();
    setStatus(`Atualizado: ${nowBRTime()}`);
    renderBossPics();

    setInterval(refreshNewLeads, CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(refreshPendingCount, Math.max(9000, CONFIG.REFRESH_NEW_LEADS_MS*2));
    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);
    setInterval(refreshUsersFast, CONFIG.REFRESH_WHO_MS);

    setInterval(flushOps, 2500);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
