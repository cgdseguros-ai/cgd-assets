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
  // Audio — 2 chicotadas + unlock estável
  // =========================
  let cgdAudioCtx = null;
  let cgdAudioUnlocked = false;
  const WHIP_AUDIO_SRC = "data:audio/wav;base64,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";
  let cgdWhipAudio = null;

  function getAudioCtx(){
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      if(!cgdAudioCtx || cgdAudioCtx.state === "closed") cgdAudioCtx = new AC();
      return cgdAudioCtx;
    }catch(_){ return null; }
  }

  function ensureWhipAudio(){
    try{
      if(!cgdWhipAudio){
        cgdWhipAudio = new Audio(WHIP_AUDIO_SRC);
        cgdWhipAudio.preload = "auto";
        cgdWhipAudio.volume = 1;
      }
      return cgdWhipAudio;
    }catch(_){ return null; }
  }

  async function unlockAudio(){
    try{
      const ctx = getAudioCtx();
      if(ctx && ctx.state === "suspended") await ctx.resume();
      const a = ensureWhipAudio();
      if(a){
        try{
          a.muted = true;
          a.currentTime = 0;
          const p = a.play();
          if(p && typeof p.then === "function") await p.catch(()=>{});
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        }catch(_){}
      }
      cgdAudioUnlocked = true;
    }catch(_){}
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

  function whipCrackFallback(ctx, t){
    const dur = 0.28;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<len;i++){
      const x = i / len;
      const burst = (Math.random() * 2 - 1) * Math.exp(-x * 28) * 2.5;
      const snap = Math.sin(i * 0.42) * Math.exp(-x * 36) * 0.55;
      const hiss = (Math.random() * 2 - 1) * Math.exp(-Math.max(0, x - 0.03) * 12) * 0.2;
      data[i] = Math.max(-1, Math.min(1, burst + snap + hiss));
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(1200, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(2.2, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  let horseRunBusy = false;
  function playWhipAlert(){
    try{
      const a = ensureWhipAudio();
      const playOne = (delayMs)=>{
        window.setTimeout(()=>{
          try{
            const base = ensureWhipAudio();
            if(base){
              const el = base.cloneNode();
              el.volume = 1;
              el.currentTime = 0;
              const p = el.play();
              if(p && typeof p.then === "function") p.catch(()=>{});
              return;
            }
          }catch(_ ){}
          try{
            const ctx = getAudioCtx();
            if(!ctx) return;
            const go = ()=>whipCrackFallback(ctx, ctx.currentTime + 0.01);
            if(ctx.state === "suspended") ctx.resume().then(go).catch(()=>{});
            else go();
          }catch(_ ){}
        }, delayMs);
      };
      playOne(0);
      playOne(330);
    }catch(_){}
  }

  // =========================
  // Running wooden horse animation — corrida lateral
  // =========================

  function runHorseAcross(){
    if(horseRunBusy) return;
    horseRunBusy = true;
    try{
      const d = document.createElement("div");
      d.className = "cgdHorseRun";
      d.innerHTML = `<img src="data:image/webp;base64,UklGRlRPAABXRUJQVlA4IEhPAADQ7ACdASqkAQwBPlEijkUjoiEVe01gOAUEpu/H6cMoFfrYAGbUCP/F7GTC/pP73+3/9w92OtP3H+7/rL/Ae6bqz6u8xLnP/jf4L8mPnF/lv9t7D/0d/vv8H+//0Bfqb/tP8P/gP1u+ML1Q/ul6g/6J/dv/H/iv3/+ZP/d/uB7pv7v/uv2G/3nyBf17/Nf+zsLP3F9gr+Y/6X/4+ut+5nwg/1v/dfuH/0vkc/Yf/2+wB/5PUA/9fWX9j/8Z6MfBn8X/bPHP8f+i/w39x/yv/C/wvtxf6/iF6t/8/oZ/JPt/+l/uf+W/6/sH/w/8D4o/lf8B/3f8N7Av5D/Pf8d/gP3R/yfw1/T/sz3PG5/5H/kf6X2BfZL6d/qP8P+Tnp0f03o39l/YB/pn9d/2nlV+CZ+W/4XsA/z3+0/9P/B/m39MH9H/7f89/uP3h9tf55/jf/L/mv9l8hX8v/sn/Q/wH5af/////d7///d3+7P//93D9t//+eL6cJ+TBGBk46eiV8DzFhu6Ivw3yxnRp1HYS0e+dt7A8AWMOqDl87xugeBEN77zlzJmTh3ztyM2vaPjcaFgxMPG4Cetvnbl87xj8fp1HawlhpkGkBGw38rCORxg95qsxgoPrDfzq6Pdh5xNQ4PhK5Rng5fO7CXtlZe3Wd43QI2KPbXo4tfB8J6rqOPpFH+Ak+bIaafvNbF30128VnxfQkfoVN5SAZ2lqBKpJNI+5ytO3L4Kq22KbPNNzO/0H4Fl5CNWqVJohfDVGit/CjVBK1MqXX+ME196iwT7vHsYcEXSTrwyO52Kufa7rslzZ2fauC/Px4ao1VJh1Mg+BxF6iWoKzS0F08gKLBpui6S+t/wrkCYsUAjO0cfiQL+DM3xf+GmiJ/SGV+95746VuMpnrEKHB60tJEcZNUmSVcNaCya2ki/zCXQQloqRk5zVFl0d3zcA54zeEdZzVtOtl1okBRxF1AHXsCv+mbXC7F6+cktECPhfoA0ZCxAQdGw4WWnIpjU+5GqRKlOWwCVMyUFSB7yQ+CwygjTtivyqqEb3KS2dOfRfQtK2P/O0gAZOtJjrGS1H9/cTWu03BMa2XCxL17XcdAUirBL741k0CmGaAuJEi6jKjb4wBf7pAQdCRU3ChJ/SRAGVk9n4dcWsMUV82mMvA8B/V4dLqfCD1cPuNy75gRahXx0aQwfRPkkW1ZoOkQwD5wa9J+5D6Z9STWB2SmSEr9Wu738hLMae3DfOCees9pMXZPWocbakxspkHJuv61IqPq2m28GKHeeVuJ7O3mAZM2jyT7Eq196LHLy/TKh9xaepJAfzPIiNePyZZyLfJchoWYcCVXQ78SyaA9oEgMRZba0K8Yt4p1P4CA4cmtM03nFbnQu9yaLpcvQJhGlz/ghhg9pbv5ifiIvn/BQORhH7pK/gjZZXbyUck21CcmMjKWaKMloCnqOyy+d6PgEkWNActytJLVoGz/oQrOusCLN2fK7dJCFhvc5J2PHs2sLPcvpqDR0TwTV9+KePNgzueYw9NTpc/FbcYmpucMPCDajFdZqhVe8WSdtt5NuQ3s+8SOcoSP9OwZfuYT7SGNmY7DCnQX+Iu/2wxFJzIdpf8kalcJMQzfhbz6I5EBoCPhxqq1Dd8G/lx8guL5+i/SUEIGWc0pWNWPjinKkTnltlFwMuK/+Fpxz/gtFFL8rOYOWESvOd0Eg6t54dgXi3a4uhoRrS2f5dlZ8dihTvNfdbDZwQCh5sbP9iLxbd38saze6Em1dyD/rqva8LrU2cRx7wbWb6oGxzF7KrBweRbeZaK7KdA7aCBP5fshJAahUNZEeexiGK4X5C26oSH7l7gfL5j0MhkEPTLaP0+ij4Z9SEqH5b0ZDklKOiKLB9PqZjHT7zbO/RQ/vOYXrUrYhzL7y85tBrHOOKcz2tTrGQ7jO01nhXS1b0Ua/1IHd+aN2hplHD4lQUUxU5lcH14U9gnRShw2mmLgfL02i+8volAgbXK150lzcWUPbzn1jPr7bQLcVy6ueFUQhYxAOAbHZ0nNyZZPgq6UMVUk8eSssMOyuZbXP/75lKJG00XeFQHNHKaJX59fs6T8Dy2PxNQvMgBSsCQLhPmAeXUmRv2J0dNb1kwL//kerLFb/5hqoW39wxA+nGOwOrsXgE04K1nQK3lWIPcaDH8tEtGuWlKNAJKnyOfPW3oFTl7fQmOzYTPrbNUdaayZNwJMbvsZXG3ik+F4C85Tfy9+Z+0SrTNuy+8sfOwyQvtJm5fdQSTLkbnBqHnIyEajJNmou/M8S4EVe3nNSRDzEOjpauX5r1+I84XrtRycsr/rqIkb/jepaVkYp+gkWQvBvOVSVs8ok5rJWR9vkBuKli2j0NSOwj9nm28VccbQoVMb3Yuyjcy/HSrHspE2gD9KbAQHMyE3QIKSwN62JaYyIOwOs6WNbhaSaGY1Oa4zM91xK+1MyNKUeojZE9GUyRpvDixO9DlHMWnm0FvnvLZl33Q3+Bp9ZdoEky+xge7q4eKptzDq0rsRc2/O3L5kymy/2SSmB9pNcOvnkoAP75R9vVdfpxpiSu7ZzvJ2hzIWeRbBfCJUZvw9tgpEAzAJawngtAANymTrK36ADs/R3oAFhpgSvygDMbstya+8xVl8u93oJk4G5aigx2T16mj/ysuX93l8jgYSrp/dw+8KTS0rGzPO7GUubQGXEOym/xJTeXLaNWRVpqdbUetJghRxa4QpPNeMPWcuIlXNgFiVhtNOawbUugTwlP2uHanC6jZRcvY2PxuI61bEtC6eO7nkRVWxJkqqdFrqNrWdVk3i0dpNKDiyDpnmwUqh81qH06WdqHyxN6h8sGggM45wsDJ0wZY6lVj5SritONF+Q1DTcPclEOmOhrDrH4zl+LZuYoddUxPqeDsC7YgAH2/t8B/XGVFkvTnDHVmhDCXvS00r0sBSVfKWB5ZzoNV9LA3qR0/ZbOXvZbM2bSFeDn5z6wxHFvc2Kf3OElqiKsyC01MwcULts8v/yJ3Jdp2GLD6RfAuPI4XsIk5eO6gb2DuOUEorDYKdiiq9bMpgw1fGxIQyWIW/qrUidWa9vZfK2NP3tNcEA9bF7VogXsoRL6vVrf0EDYSMIsk8R21HP6Bq1C/tGMIfnlMZZyEQXKPgbwxyiqNk/1MEMPGW9swsLpLvUSKZa7ez03lOKx7wA7roYFw00YjJKPZ2RX1qum4yhOxetqkQp9EgrcmylSkcaufApY5ctXY9Ml86uIUWWlR/Hm7TibaT4XCi6AeC8hNba3U96Uua34LWHT750dkogUTaEjUluA36AMb6ePcUQ/RLmGLtv9aj9+VkonC2JClXgP1JgfSVnBYuxu/1uCn8CEXPG49UHrsbFQy/+LHO8EN2HB+l7EsEaxjdeBQ2gGF7YBe4/+csiAqZ983wT7/ZF7/yZ1ayHoUhtecDi+n8X6mcsnebaAeS93tfba/z794/48rM4DjvmT7JC2CEsBChXSrcOOCnWbOM/6vN17i6c66dpXSuHQETmCp+rh7d+9Bcdgox7pY/CgMKJG6ZAb4hVoOnyh6603HK4KAZQ0YgIO9qiXIgZO3KhOMrCRVi3WLw1Ni2UcpPYxQapiV9bCUW9zwkDc6xaBXgmaoOxZoCyWItMFYsUU0HX0JseRvMEasl7zx/6iO8l/4DQILcXy8fp+x69GA/F5VzCwyASnyzmDong+IKYKwf7UQT8xEb/LgGJF6BXADCFpg+AzfI8j3EidKNBK+DlG5VwrbuBFs9XOVtyzuxg6hqN/jvCHnHBCHnlVui2oPt5KnaOT4PhAnP8jsCaJ7SMwxZbRmYxxRSKqT5zEUED1/9PtmVxAtcZuAq3jMrKsr/M9pG2cIuJSqqPvdVqCkQXvzp/+pevKmJd2RDqxqfrbukbbw/CXWyNLnHac2fFOlqEBl7ukBmbAnCc0ScI3bXpcxG/+mWyvd06Wl3osn1gnfqrxBy1NQ6YGUM/mLZFwqiwbQivjNwGcB1A1+BzO5w6GVx969U6ENRaAEMe78Z5/7YFjczMOM8R1edr9mEDOUIzsoUDBr8sYhvvIcqkSwgymsfpxrqUCtxl9/QnF5pHCwzGp1HNgvqlEhjzWXqpckxrV/gvnKY7h3Bs2YR4xDwxP6lOkOLmn9vKNmUGE2KXUtvgruwD4S3oFMsQ20Yk1vhylUDJwMnDDhw9jYo9B6gKu7Zxzw9GoIDtNWZ1ONew9wDQM/SeMDgAy81MTspo0Yw+ofRxzHfvX3Ybe/Wrt6QV02fcMXikNVaKHqW8ZB2mGNPhYCUSnkog8eiVhAA8Q4UVud8fDlRoA2jC8C2g/UodOxbmJO1iUVb6Mocq60WGdMc08pz7ZFfALw0AmUhVmeKXsb5Ps/8MZ0X2o0VyK7G705UKNvb6sUGfzpKaSKHeEY9XqpvF4zBm7Fvy4xkpknaH7SiVt+8XaNq9yyZP0z7CbNOaUzIk36XT2BhXXFdQo538A5dztorF7s84/b/LCsA3fmv5g69cSuVYxBavPpDnjs+UXeza6ZD7Tn/n+PVOasTnci8s4wFswpwDnwL5rtAzA+o1YSCDW6P/hrtsIj17ZJnX8VioqbPmtOYo0BsK1HOs+XhSEnm2nJhTQNy5tMAbxPwNU++OBl0PiYkZC/bhhK4I3TBxHB4RjhMZeEyJ+z9Q4ipdktqcKIgDM4aPoU7MVy2O+JYk1hvbEvO99jC6HnNNK7ip68mXYTkTplzpFj70MViXOfziE2aSgBL0oirDk1/24D4e9I64wlMQdqbxcsYDE/eIsUb/D4i/6A0ov34VSAbwk6Zm+X90y/LpgLMYuHdVgzDaFXdbjxYjx3TsP5zDz6+hGBw4LYKCTTtCVs1MbViIdZJtIvy/rM/VaLjJXG6AwbCk2Y2LsVUynEC+YgNIWEUqvvwhDW8Yh7RuyxdHnr0pQy1brENPspBDajEWlK6rp9EzDgkY0pzu9xsSyWy3LRTGWaBQee5cxlj6IbKASFgQwM/tiT5VFkvvo+mGz3zmwsBC4sBiA0NQbRI1mEMNBA+PtxydAmgD2dSEGVB0pgjlImf8wJcSJ73sLNwD+VDOE+nHV3VqH/dYbeV8V6CFebZm53/020eM6ImQpIsoFt0Sv5Z64K+s83ahnvKgEJVHVxjb1CT2UvYI2C+/rtsz2CoXxfPG2vXRTfQRdQR8imCr94Ou0x/2HocxH8GB6Zl2x3+O0e9dddq1Cp3jK+9lpJcpU63v4vhS4i5hk0mB5/WykvtaLnXZFwZJjKx/9Uk1vZO/4gD7WprfKnBFbQ1YyO384+yR1FPNaqrZZ2vAqN7aN8lal4TYbnjQblgeY6ODCM/ellAyzcGL23U1cHnYV/alfGvwczaXm1seAIy4W5N43DG+kftRv3tuU3/IgP128ZwUJR6TQ+dGTOBx+T+N9rGlp9lzfBkupgmDmB/yfYK2QrO+cnjo+yEKvlZwi04Y9P/iGp2CZvCi9XNQUvxrLzDFe5kqqCWUVf24G9X0newmGkGJ9LuHx4fR2gUypox3Aob31pCAW6zL9L3ydBY6As5PE+iMCryXw8uAdyLK6UO8ZKTxwQek4x3nHGJdNjoGHAIJYHuwm3Crvczvvph/J8k0ye9fJ+XqFkn87A7lEYx3IXiW0PBeplVvaoeGJksehwI8yUBtMgXwiA88ipYbBmt7L6+5rL2FwqCDw/ArEm/7aF8x/wgMsB1iyKejhwCoQjsIxNaGdcXOp5r0J1CX6RcCx9yDN4LE1IYzxIcCt12T/npTNZLuuKLIBPW/mph/O+wx6fD0Ty2BfWKm3DOabWASWD/T0D/+hchSw0I8IYLiIZdcGkOguo7tNgNgHzXBTUT+YnngpFmMPC9kes2at6BoVknOzouWFJcAEsPFj9t+C8tj4v9h3pG1Pkv8O2xwca6peCjPv+oNJ45v1rLN0uPYlMeVzhW3/yhKCi+oLsWd6AXtvC5PLs1iyqKIxsg4nfFIMIyUKiy2hlzLVvofXqdk396FQvzmEgFNTMULhvoBbRuT6YpKHKSYGDUvR6sWluJtblmX+Ny3sJL2XAbm19TTo+NNBAZhAYz+/RuOKGtJKfEseMYkh4uCmwXi/6IE81FABs/+lQRnzg8YniYUxYznmIvrDwdnoAG2smZxbHIybgsWnKmr1b/mfVuslarn4WuJ/k/+5vJz4ndHxeroShrwkgANwHKxYN1sYdhaUTXHHRJchP399p2UH/9pFP8g3rj0xGS3kg0uqDwRTPIX1BX1FU9ykhlVHTKlmA1vltwE0PEwJb7LnrVOMbG/wdTSyWcZXIQmftpE0qsMmIr+eQeXhjNgXyUj3qlFnAulVICxC8mEb2wYCbtRoNJaYuwSB5jJtgsx+r8vY0RqpJTBfU2pjvRtJWmuAdlwn4I5k/sTma3LoKaxLlY9qIKXwgh7EQBlfqWA8VNGjAoCbx+uK6SMTL8y5/7+Hvo6MRc79EjMFnquZYsMXp4vf3pktDuA/lIJETLtceK1F2tqomLFyX4iT9bs6kuFAuG703GyQccrJyPGzxLWINJKgXvqFaDX5znH/hbfoXBAOuVTJHDWdzFM3iGYhbdktCbzwLjGuYAQUiLE4ba5H3YLwbljX2yXEgfTeSONW7bxJk/2gwhBp5D5+oIPThiSLWQB1guvssLrHcwz4AwMYdCi1pIlfhqEwtfwG6+4bVPKAJdAN4tsbSlyRf1U9VSCfSdygGToBM0aXpJzj+J+Rlg5lKuaR73QUrY75N52MvPmtyrkYEYp9RdB1byQi6zEbjiztd0iIsQlSU5N6JwiAKA1lUf9/eTW0nvhaT8/m2eKeamwqbSU70QsQH45RGEhqvOhUJy50Ugb5GRPd3BvsG68D15c4PBHgCCZ9pVQJjfi3QUzUYLDBbdzajf2bFhJNYCEQlqQn57J4zNoYjdoj6rjhYmFZkd96NcdKCEB68PLPU5vF/eso9r0bay5DWGHo7Ovfea+dUbEXFAbO1fU8nDAEKBvF6lpdDktwq+mUbw3O6iCXqPNsyTutItG4kvnCH5Imb/rPT1laLyfPIPMfyAJQ+TU2u3Fcv/KO6I5SlCgPyAF4U3C5chcxvQ2CFhYvxvvwpTxJThaYIpS5cz5QCQPHZDzewyckhtJ0LGmXyY7weSS4ZECCsteSPaA8c58DXtbzavw+/9JhEQRhzvoxsl95Qvfn5FRuZpAhYutWVE0dqRlQFPUPP/mKYIqqs8i2E2OQJeytn6bZDf/Sy3hiGPFY8o4yNTD0MuTpDLoE/nfP8apLHL0yy/SYywrjqiGJPCuOgdjamoKbM8gSNsIVOMuANK2cQzcBfuYMeAhV4/PCIkC5gpyQLuryIVChEBAwOSmeUpOvvPwGFBggCDNKYXCKtEm1XqKPEXvv4PKvVzsf2s+42Gmt/MdgfWxJVGc76Y8keiBWh/okMta2iDxxzPekuL0lcVoMbVN6t07HsP9y0PISK1ermAAnX+XPLrzkErZPO/2ieXT86M+cr5VCnzIS7aMup+qjx3AZT5wgEZH+a73d0qstRsMOFXSoCTdlLBaNCmYxaW/8H315CtlILQ5qRQeTiZQROqb0w69fuK1vPBflYTLQ+SNg05q+Nqm0XImiKxew72zgms5v7+gVZZ3QVvE5DtUXtf41k0FIpZowKQaaMsFWDrof3wdWTheeNs5Zrohh1VcXHI8McPSzb5vjApHVcOMwDv6v/nv1Cwwi/dB+VR+L1ZptFJnafcu3I3y9xYn2fVKjVo1XracYrRQS/1w46z2ooJeqn4yJ7YHZtIrN+PpncpeGSLjQUWAppm5W1HWt9gazf0Fobh4XCe4GPkQk1/qfM8UyZPIXZHQbeeSWWgEK2J2Uth4CZ9dDqcBkUGo8YheSjsYfOxc5FpLy1yZTkJgYLrFiX4Utv7eEP46/b1favPLGiKJj2Ff6Lr92jiWCW3QojADSXBk+RQXzwRccXR/pgsUWG5of4vr6B8ybs7J3l5meBE1IwXKgKMrZtmsRfrcgz+61AqXPu924T2iVhqgNpA1K3vyGJIrMSHGJxBMYPv5wKz5OhdRnTnvw2cZfQcSlMRJhmxZwdh2Svqukm6it01t+JKzDIMgFo2oHub63kLvsNXHcEtGrcfu5072HETY7hBI+kpmSlN5PBX5yxiMD6p0Fg0sZIC4zIX2A0yAYOh/hjsaBMDLJl8lNxeKPmQxylCIdSTsN0I6ZsK2pCGGVRNHTlR57VKjJsjnkwN4BjhQwrB51Didx+MhPPwGgQvo8iJ++8bv1sFefuDon+jXfDX6eTj24BI1THEEzZ2LsgnP4jDxCbWRc7BqBF7pdMHpbOeNFtcwAzTAz73KWgGKpUzlYyCqGQj43D+8y/cTC3GgG7mDPIMHogPwozCpuboAAagyWXoJJP6jMZXe6IeXAngfOZ3u6lVn5sGcCP1iIxuzUjEMN0951R6CL41Ts1k2sirTvnvAxe2Qaj4cGpDoD+yXjCnJbM03g4TW951za0R12eZOtUwMRBrRNjbN+oV44gfoNEV1AzarDrKatNLbW9VEReN8/gn3NQoPyRda95dtoYGNTuBTvszYl1pFtn58B9ghd7nTTCPoAjBrv7+SzpuAI5Cugcmi3iNAJIUUrAjYyF1KpK0A5rVNI92NGs9ioXni/TABP4FGUknXYzy3AxEQluEHfzrn9Ihl/4B4x7Rzg/VIlAPQ9iULBU8+0a/6K52j/xYvZwu/o1DOfMicRQLQiSvgMdZF9l2s3rNe7gOL0erQj2zRzLWIlNKU03VztAIEn0aVW9/TitPJOB0TlwypRHXwpF+3sHZ+H3FzvO8piQ/yS34w5vBePHNzuS6+UH0ewR8PTJfl55XffrIfA9l7tsUQA2EfFltwcCt3gMBwlKDaVrTKgN8PNl7lVd5v+LKqOiTVGjUmvU71GmgZCQI6jUfHJ2RW9WALnu1YHLOtAUShs5rc4dkAdf1UbyDHigZZaCzi+L+6rYMvoCRYYnPLgCKyg/BEebCD43MqDihubzdt1D9uN2pPBpGBzbXeil35fDhT7UsqASx6BCSJT3OGuAd+vECXmsZJIKdJKc/AAVvAcoT2NllkJkQrO885avzaNXxfvrvuHoZKGMWrFHMN8VpucI/bQUvA4PyJdohQLSRFZUb1tSEkE8Ofdwz8Grh0dYUTohqEst5lpkLvF6BEuQ4nN+52QykdRKhx03i0RNtOB4Br9SzPCcJ8HAn8xk/ICu8+HF1ePa+aW3HcaTBu0vDXsdZTqiS7KffGl6AEonZ/Kff6Xq/q2IAEk62e66pmKTNMAK+LKKeN1M9/XXQEYZvtcXxSEceegCboDo+4coIACrddJLcTd20dmwbqPcyN99Yg4rZyq/cWees9af9Snb01h67D4Al4rSqvGy3GK4wWpAHR9RWdX9LOJZZ7BmZXMtvkc1Ct6X/yw0aUWg6HcBPWWbImx0JButCjaspy1FoOTSZX9mTAWutTsCQDiudhSl0PC1yr6mY9sF499CJ1bop9mF1I0wDMuiso/3YF0d6zLcYQKUaZ+kDeoCybK5BskxvW3+JpLeJsFCaA3fkbwuiIuNmWMejyw+9We/gJ40DLHDrjAMxxPGcgjBQHuQRkf+H/EvawdVzWeX7196qzq2T3n8ug01Y2MzE//zg9O1FfjtEDGmtvHdErfbAzZsIgo/CPrPeurmlUVSjUe0omllwooHapM1PRfB327ADQywxRHOKuglT7izSSmoJfLQfiUAfKTnySoGN6AZdOQzO6QXU2dsdcPzzdmaHN7cmEcIM30tbBWB5VteAH8In+jN79ZSQpOvm6IH8wYABwuDi5vO4mBSyIYOkGv9ne7C0zIRKhTQSkojJjx5klrKJF0gFSY3LH2SoGwSrL9vwj++fJg5FjLIpGWWvlH8/oAu0zseSTZrNIQH9h1Ic9xf/0T+JZf6vUtE/0uBAgiD61iZiHKlbTQrZpVlrMRwcratImYwqBFmUlf9E1R9joXv/BSExv6rGo/0KOzbUbidZPwlzKOfafzGuF3LkIs2IaXbaCuCPN71qkJ7esLWq9s96vYvD7vJD19/suiLd7gKjHIBP3pCT+z/IzVGvRUYsf+4B1lwbAyRhUkshg0d3UM/JY6ENHFujDZx7n/i5gVR++tmofRQRD35cjU8oHCmC4pzakyrhRxc9E015HMouBd1Fok/BlcyCls0elgMZMWV7YxnIGaSkvsHJfdCUjmTd0xm0p3TEP/0SXldIOYfkJSgzCHFdESq26rBiGzomdtxjCj0al6UzbTD+2hyHGI69OgEWZHPD+5D/EJ/kcsINrSzqSimJj6NJLl3RppMowxeNfgxToaqdXh3AebjItAniAhtaZPVyzP04IrvYNFHoxtQ06iiaJJXtDsmjjHC5P82uQXHiy/vsfJBoPsTd568LLHbdEYH275t5P5SVq8rxcyX1f714aPUcxasrJWHRuNW2wBKsB9WPk3OIGsZKXCv6VBclLWAxR/sPMVLF9KoGli+9y2MVcpzmbkOvr69ZOWePKMbOO0lqEmk09LN3YhChxSYf+B84HKETPXBwln5PXdN00XOP98D+DT5aNOtZiFasrWPM4ZshgfMt+QWPkLJcQns2Xh9a+pPgJSJ0rOHvrlOgslxr83dF0waTPgfWMhXucbLkURGl/ARr1OpwRYYTrEabHPz8SKVLb6pEK+VUHYMqOAauCb8xdTueVvSxidR9JqaRxPB7gKN+XMMR8VA6JoF9Zjvn4VeJ19w+1RakYEW9EcL4C5LWZD5YoXJpvKKiqaBbmEQU2E9kc7qGVy0Trx+XEQLFrAoFJGgoUzxC3T1vUu+uS64fyloXMxV+w0ey45WcDfeS/Id7k+K1wMnwUH/N6VX4lj82sI5H7WtpEPNW3AGhz22XEhHlcHkJM7xtsMDJJf6RNG3448/RUrdcvumGS4dm0WJQfqW3gewyMYfa67/oHJJ1xU8t0yJfKgQ5N2DMEQKaPajRdNl9oLROA8IOukq7OrBlRLFbXnPm5K0C+bIDKFTbN+vH+Eaz2URx+UHyXHKW30uEOiz7uCvYlX5MheZ8Ntam3o7Qd3lFPnMXi/yTsRIwcjoPZcNykRe16aR7YqzWNkKxGkYhBkt1HY+04rZTNunjDKxRmfA9a2DCO7qfgodkoAVsfNEbcHxPSPrA8w6YEoiKUIansgSM0E/+4b090WfpQhxZ9BJsnabtrIfzuisyCjsEyO1YU0naXEP1WpHFVIrL8a0gjxMNk4yiqwB+uHgfAp9tJzfUEiX64xsAUqoHkewxq/8Qo95YjPXvFmnOLibNFVwY+0zZGo7HADMJW6xfNysUoU/WFxA+zJEdFQ0pGMrP6ZVlrxkJwmPpxmQOi0rBSDN42FsD1nkiOADv6E+ayLhs3Ph//xcMWZoPz39iAtCeFwOJ0INM8LKNaHpLxK+XRBQPWGB++au0Kc/M65M51Xop9LN+3MLYYbkVHJgPX7tr+QQA47awZipnmW+dbwf8FuTMYK3I8NeQVZ0bsLXRj9+r8m8DLPc0lBOec1QZxzFbeLTtEOyYAQzqMoipNJBZayYcoHmdr4aPJ4C6+QH9DthiHEqNhpZ16pEAw575r9z0TNdN8PyiFfrbRbBS56K/ug8rx2pGH6H13ASBWzqgj58B+621NRKC/DFfj94CsKkY2IHyZqJICqoxhWXvS2E5I4QjQyhwjzRRIrzaBg19fK3LMXlHEVu+tF8bAmJTE3SlXccHVDH6RqA7DMVjTogJZp7sqjIqV3adDGfwzLiYa+jwkwy/iNH8ELgp/KJD1f81VVGWb2xmr7GbXtLAMHCk2EjrEcM6KTGB5yrGkMs8/3CjgGs+ccv0vSoClUPHxP5V8Y6ooMUIa4+CXMclLgPaCvpmmqORvXgOCDHM4eO1SkL2Tw9s6EOWEB0zw+HZtQ9c5MtoQXVD9TM4oB8t9V/7nWeNrTtb25mi2d23Zi+tjUoutLL1FsiolV9f8uivB75gSGECdpO7Z+ZXnXqcybDlVGVxajM2JjXVrRXTBf3Ev6Do7sDFIcR6AcY6B+StTjoRRU8M+e6/3mQRyF/wGfilit+SkFFp+ytzGyh5OL7ugPdy1JSz9TeqgB8udzBUXYtMtmXaqOhUzemuOqYa4/8BNWwTKJT7FlyyGPcqUAjS6Ywn18/kag72iwbyZ6DUd6Og4YhQ14Qg1SmAVG6NFZx+11VWso4VYhcfUgFMKbyufFvxTxhDVlctFx7GXN84Wxbe/BOoOTTTmKCb99AMjWSxD6MRqKQuEtTsFJ2i/wYy5MTFqKKDrdqB2HQXx6vsF6rQ217zHRpOi2W0FEGnEvoBTGmRxtJyxuLmdB6lNkVdXnwCBwWaNzloD+a/1oKZbmrYMhk9gsFclvRFl1ZiovlgxjG4ie98RhHwShcCtoGkD1XDYRQW9nqVIOG+2hTgG1ZQEaXKM19wRUbA4+SD3/UfRM8KCahBKN4lh04uBZlvoADWM319lQZzAhL1IDu6PoK4nzjO6hjbwu//0x2oVFH1YW7JX9Sk3ZC0prTh+RoyNPAzOf56Npm/ZAkY2I+DLgmsithQQTbmMukncsTUu30yBrOcxbTlSYshuTDs+aS1+P4Md5jn2bdI8imN6FjWiv2F1P+vQHRHp69Hn5ZZow0/ESIVblqzFImtpJJZ/n6pN07Vd7+rHkDrsKlUgspq87LzGuZ7p06CB7ESokj+L5c5WqZXuv7dUOmWFKxX5x+a8hAVM4C2RbcsBEe6K22OdjKXXohA/DmF9sswmFVNvrXAWyT6YKIQpT47Iyt+0rr86mt0Gg+m/4cBoz2HI4eFNlWTtGINpL802MJPjIbpy1xx9RnvjlYD3t5YiVmQYRGPo9xMVakt084vBaQUWM7wwjuf4KfgJQ8EhSPKkrdpwPPiwm9jLsFZVurqJ09mPlcVoQL9C17Ukp6pxrsaCqlzK9dIUj6CV43UdEZRnuSnC9Yyh4TJ3mYK3xQbmYmCx980Rm6GZj1sqXNy4q2TG0k9x4attZAr4dStEDXFTNESpVEbzZj5Fv+A0YkzZ0l8IHD55SljMoSKEzb0lRG3KYfMyKQWV2ge53l5/YU3eBNs8itQWcDxv/TkB3CnwExOSdtnN9uGLk7/++xDVw4ZfaQmZw/+346AuaVJNnc8n/twOEkMpYuhDrGNjUB3Uhfjw8GOtsJllXiTG2fk0DArvPBkX20Qs/DS5ZlnFb4QYpCXVgr7kwm8wC1kHXmRD+nH63e8CrLwBBv22QinOE6HlQRtGIqDwtyjCLILXsNyZuVQHRy6kNij64CUtg4xwHisHybIprTpzy/o2DGerH4haAyAo4HhoYCYgdUeK+dI65A6LOgyHOG5JO3sihrEedbMLZx6/CKLfD1dO1bkARQJcxN9L8X+Lrpjie/0QBackIYMiLoq0h8oH4f0pVUwllToA93QozRnEHGnMt3xvkVlzZFZQlQcBVMgOYneq2iyiFMwdCoYfxi5bowjt2Sn/cEGjhi9TiViYSPp7xZUFtOv1jyGYGimcvuX+1oCHIApzoiO0ll0+gNOvT+d6SPYWPVfZT2IdRm35rLBQYj9DjAj6IOeMoufTe9/+8mVr28Neevpo4/P1RLlbeQVeMO/s2Vxe3cdbd5sZGg4KjhIHfNmVUX/DxdeGrJe1e0yxp0q+uQ4hNEx8p3llhFJn8gxS7G3HCbF2HjbVuL/YhZXRiRv3X6ikBoL4f68Qbgk5jCWkejkGdMTPHgU8+a4ENOM/2uuaxAsoo6VzWs7fGLafQhCm1xIZl7UwLG4qcwHo9+n78FjJiTvQ+yF+hnHHJ7xT70jPysUUUHl3SfXF/hIjVbmY0BWWjnaRM7XC8bUJbTaOuJ+uCWTYTh9DpLcoAxhx5nyhZbVNWM6ahcLJze1Q1ZaX2xgiwi32dZwft1QZ2X6Ka/vNdJC5cGMqqMrnLA9pavZ7BoWJhsQMN/JEIZLNYY1lKRwEOKDy2q4egJxhLSQ+kSI0PoArOBywzzAhD1U7KRGHlHIxwwe8AOd2IFGOh+P5C40p6KRitOVlxV/rS96CXckC12yrFu8ZaAMyHF9CC121O6C3QPZnC1mb7vV1nL9cw/SVDkZ8J8s4bYCZ0rl4T22BNXsBDsSnhWCfEGkjMiv5xB+lLzIm3oMYINdV6CVhDLPSqAcpMTlxx5dxbo6DGoM+v5ae/qFgeS55jpe+BDVX+LXa/vdcCh3xb6DLNdEnjG+ufaKHGvtSY7ZQwUsPgfrN/f+8jEMojz672lAlgYDkWUSPUnftdwfpjynf/sKYkXtYMBXzDqHf/Jgcjpdfjn/sZ0UgNuO7oMfsP/2MLMm/bE+L/WcoP/rv1Yc/XEOppEULe846AYCo0gPJ8SC/VGk2WsNLqA7DuzOQzNzo+qyeQfRQb5qGbLeMEuBmPj+7xgTTeRXkiyg8cz+wS8NDlqzNFVoayE8DP6B1peRz6hMJBB9/utzi6Xjh5wBfVBEEC6u2T+MokGj5JAWUCT2AXKARuO1K40VCkWn1yWstqiuOJz2x7zzT5zek7LpZZQKX66//5r2pWH19S8F1A9GOZX0tYD+L0qaiFtO84w3UDbajHJUnqtx5xc/PtYJPAzrNZDm+Fxf7qyLbYCxjBiRpmrrbYasUU+lo/qoj4k6e42cpxFOZyEpIGYpM0rSnWl83drSNuft+QpiB8kdcEEw47fsoSFTA8f9VxSP34Hy/HtSgdRW8+ALE/AbC3CC0C9+EZQy60WPaFkAe1ExNAWnWmlALRM3Lg0vSUIVo/im/UJyf/+oVTssqOMr+9izPiLqcDD5iTNBTEky91NI7EyOMrZeY2UZH5SciOCSefq9vudCnJLuSnLlqu+puJ0D7lyiH9sJ9OjJLWfU9SB/k0PnCMvcicuIp12YoglQ8gTHxJdDMuELrZG6MdS+QoObXrbvjKAAnrwD2LPinVofFvyTUxzrukP5G1jt2dH+DEMbYnXH42aa9CtLii5LzZfq+pwwUmt6OY6O4DlVKF8SoEA5LpkOCnzb+YG6YIphu7p2gymV/V3m5304XCopEtlVqgGx3fYm/I9DlsicNlRn86jmwBrzKN6hkv7N94UaNfgL06WJlKILRn/mFzUb0WiCyV6oscZwxKviNzIjLcsL4GDgFVTc7oBeUvawbJmG2vZHPJa4XRPij1ZCJPhVUqwFO+bT4fjSoTKUBjqwVGtNaYb0UG6YSPgAzzNKGlSCUFUDjlc4frhU56wyju/aKqxHclEtCJfpYKQOCDJnRhi6C2RvrEHYoWlMu0AjnmQcW9rvUE2aMYN7bTdQvEHfHqm/4MiYNxoRfyh7HexsKW4nyq6xzpnwk0kVvt/YAANDjtQ46JdTp/WQq+x3eGIx5kn+22oeXA9ODBrl9wk4oRYGZYTG2m7STolaO/BXwZ/fKX0VFDlEgo3B7mPfBsSamklhDONGTzW+QHY/r7TGb2rnxDHUziLot4hfA3zP6FZIzc2u+8tFI9VLsatyHIKjOwo4/T8z5xkJFEDsAAPA5mNtVioQfAqJ2AEUMWhCf47CYD/154C/Lgr4OkzQ1Ey88n/W3FrT2mdKDArNEIVQGhKoBpNXhYsvET51I4iugg+BTR6yVQcFGiHKkofvWQ4DCPAdwTUNwtm06Yw4ZUrdvE7kLIn0sob44xXeE9fkbS+q+0kXqYLP54Fk6koMJi7y8eUX/V3Q+2kR+6EYCCsnnyikAZeNtv6BOW7+5+bhmoq0aoKBjEVnjEtz8B/+I9M4O3+rVQiLOcYvPcGy/n8G1kQORuY4uHXJU2oknjHU9lMVzPRqN5OjHuBbvu8qf3u3hE8d24Ij/THnxuTuNgO6DZS9p9u6/7EBDXtNNi9isA7YgV3ZH+OmmSeSbiYAxCrr7iovw5Ke4sP4xxxJMnSqa2y0p8uD2TzXy9L+BmaGynJAzCeL8bp5nQMh0h826kTxzH6iNDh3ILOgSd3OoCccKl1hoZUUIDZ3WzMj+AXoW+J4CTIQvfiAuTRWhimgNdx8+T1pfRbpRjcAgGXupzxJC9M0fD/UGRS018aOOQwdMsRsOk1H1tbTepKJVPoaFKmINGqoui4v9CE9DbTlcobHkiGxvtlSeIrwlwWnVSEZdH03Os6hd0YH7u2W6KHuJ3KiYKHeadF52o4nHAm5Wc4L+J3wBvx1VtvDQ/869LYLBtzDqrj/JTTzSv5aEBKTrZOxeTcHGP//7icbf4PsXYRAEcPj6wqwykqgM4sIvMLByj6aM0ipYlZ499JKVoKQCnJMHkU3tnkHiy0eLx3RZc6Xh0ycNpjE+EjOdiT+WBRTCzxkncVrO1RcoE7negaYkYtgozTBp6URe6rEm6Yun/sOMN6sqTsEfNmLX+i1ed2ijGs5s86uHNyEq9AGk4leW3l0juERzQtA/eUZ/omZS7ypMYeVvzSH0oKHk0z8Q4jDHdh4T/L3VNAs6y3we8m5oxDtMEwugAfr1WvwSJtowbr8mvHNUzOv1F8FDsugJTkR2TAN3sB86DaxBKdLH5MvbJNHx+Jy7obVrFCO5YB7mTGCSk//oCl6uDQorH3jZ1mE7wHgZpg2yLfSB/V9bI3zydtDcMDmzrNRvlObVb5j83PWqX7LTKaYPnA+8/hJDRV5W/5R4lwDWBGfTmIjGKUEv5MNNiQGHXdLnwITFCyaDVOCbe/3IzyNcjrGKSWKUTPaHw1U7G+X8zNijr2eS4IrIUv/IQ/qeVXZo+lkvJ79FqiAwZncRyJf3wb1eKsBJa5Nr9srDI3oqx7gzAEEm8f+33q0UXnlPXlfE2GgoVghetjgwpREHc27y9TbcpbJRbh1fQDBhsGZaYBZNjTwxLpzbAjPmV/L1EQwGrnHTlc0MtaCAvg0QfbTqpUmmIX0ET34fe2aKdEVBH/emKnKJfBxVCeIAnEJ8JDkWTnJ7GKLOM2d9hb8fQqEClP5SaQTzBRRetr5/pLKcMEpEaMAO4NyAz/mrBp/yP9dvlVrmH4AeQbZ0/wA04BK5A6oPIEw2EOqnnfzhcflz2lMi2GfiSEvauZJv3bsExLUrrgCc0KO7zxToBGFg0M3WO9K8kOHf8y+NQh7aP3NsyPXVo7r2ola0Tv1gd4Zyt07Bif7DrL1/DetWtbJ/ALWbvYSHn2SuETaj0LkJy87KoZY7gClgjxgBs581zvfmHeJpbqQeC9YFPnQvQ4ZEqqfopHEIrkUqXYd+RoFZX3uaqxsRnT8yzVgSnikFhva6ALQYf1L+z8/9tNAAHbTp0o5cj06zNLNLGewWkis6HzpDWhn7dSvvsZ5keOBngHAHn8ivKnYovXmumLnyvpFpvS/zGZA/NUkRtXBf6Oz+JcMcY73or7c58zAgXGWhOgwzFiM5tG5jeWWe2RxZ/wXLmoXHhABcGIZCYG74EHPk5udUxFyBLkWYWb86ueh5csfAZASjjdbJpvN3y+w9se4FR+xzvmmNk1vAh/SlsNGZXi6e92O7EPxBZ3450QIqChlcl8jnQk9CSrS9+UILywWJizlXhHoPnmIrwMv5HEScaS9mxMEsNK4Bqp9MDIEXqKLucOiZjZZJp7GblTkDf9O3Afe1KzrQ0eRXeAn2EQIEWfZ8nvIA8ISq1XpYI42Xs/cYHWNzr/TzbEX24NNSAmwpuGDkewwmWpITRLJiKwz4T2TxAqh7Dg5xUUfK8TjcRpDhwNZ0voBUUYX0EcZbFbOtKsztCSMrHpeosX9WGwBrCzB64j+Nfr6APSvaigy2ibksdfQxIFBjN2Fqz5+MaPyelufd+Dv8zy+hSGihOGcHCjAY8HAXu6kPqaoqqxVvNYjIAT6Cw1bRDA4Cbcf2+QARzX2vRiLiWcVhb/G4DyP8QG4B+PsEPg2ZiGKxMR2J8b8y2hCh0+XqXCQ/UhlA1x2WVVpl5l07Cyo8gCzmBXS4fcRno+OFEv8C5HH+/ACdmrEQugNhM7uI0LGc8R7ZWxNevwnqXNDmdmlJJqJ7WpOFJJAwS495cGwprMFdhYKibOmLE+TiLR+mmJCGtShIMh1GYgklw0i2ZffgDJ51/1bx5q+p3VaYMWMUCv6gP6pPe54XUec03EIs2D3DtrYurXab73bmKH2/ZVXYiZXZSjTAGOz7q/95/9vuZHjYv8Q87ffM0w9gcL5zs3pKw9XnQ5T5CMZSRNR+NWE8QV4uz1o2jgFCUWhKnYthkkovGrWStjTVp3T1YAgXqUbxJWOf5DG3RXQdvx3/VtzFxKNtMdEu0jHwdniVK56+FbbA1nOvWGSok6U04BqpPcOCbTBPUt78BstyU4T5fyXQWo/0Xx5Qb0Il77OGxuUwUFKnVMJTUMHahRmp/qOgJBxWXqobOfB0QFyrEa78BKRFQtb1h0L3pMpmdLZAUh/hFWFjq75HFnLlsXs9mYcVv8flj+ddPZSilEFfrHe/SYEu1OJnxEqexYDe3KYBfECA5UXHrJRvsUtsVhzT9jFTAx0I/XeZG1wMqRVPo6dAUI+7oQy+lBoZJGU8KaFSBA/8jtKV4GQT+LFhtoV8MiiHOALP4WVyDq7pq5ca4YPJmB4gDZFtDoNM0Meqgsv+PZOinMMnGnFOjK4m8ivIK9wrI/7fYbMHk3IzfRpceiRca7vUZcyQR3FkVMtJqya2V5EwF7ZU3omvC0KE65NK15xlUeagG/pAhWRPsyK7wtGESMcDAOKl6lxdFoO/8QX3E9n1I1idM9854/ZDU20obAvAHH84LvqjXwZeqDF3wHHAfCxF0SC6jNqUNUB+XXNFxFgmhukUgwgo0CWjo/imtCFyJ81/RIIDyBONHojruCZ8/H7OGqleQBEbijljtJQRYO1aKIBW+Ebru5NO1QIM2AkKpTfDE14t7AERzPlief8rWVADpxLLGY3OSL2+CEFKJYIDPG/+uAtrg6VRQtwEkR6d2ZPzxBs+OXLNShss+OrT+2CjX4PCAcXcLg6VFsDVBOG9egzZoOPpIWnC59kh6fCT+kZWI9QTErRx7t3m/7mls2yPrCiuLtcbz0B7YaEmxAqAnzHm+coI/1/4DWFswU/Uke2D7YrkyHoNmYvLfBx21TYZvWLrHVj9i4AHOlVrqugzP+KbpFwUAzfiH8Y3d1JpUCDlWvjCl7zB/jdywwqAZDgik9uq0rxoJ8k0L7Caxhkri/GYJC/Kr0NgU85qQ/7K1eettiuBMuBeymQqDi8rihNI3Nhhl0ZUEIRdfDoD4LxVYwYHxeNlOKPTvKCVUfKU+WWG3xbKa1Hwt/4YkY1Q66I1Yr6g6sD5glWsvVPqG4vIYmopb6CQEPSZvDnI/fq6SQg4GIhp8fummLXPme4OuFWFsRyZA7k4Z4KplhBy5PGgDPZoFin3Dv522SKFhRS2x8PqwWZRN7ay3D16+LHPFiRqi3FzRGGHZuiWKTN1NyE2nik2S34+LsPWLrHEFZX5BLi4pSXGp8QC2HelNbDBZvQXOCtZRFTCSg5n84tAOKaXOSJ9aeBLZoWj0q2Pz46GhcPMkTm5zWpqCrxQ0S1M89YzgJBbD0IlcWDQ10lIxMdODsTCe7uvCN6Z3MOZjY+LxoZ9yGJ5hBVBn6MKlIlpcQmwQuGmVdgJZcx0vuB0w0McfL+GzKvIDqSXVDrI5lNKN3wbC8+dMQjx3Mz7AtF5u/Lplq2dxPJLySfi+P8n65kEdxieNAY5XFdObG0ZH/A0Q06ogTZHDuhJQuDrmtGwkKKy6EvNSfhZ6NNGZ+EH6owaTHovXbT6RkY305e7ngn+t+bO1/kLpKy+7OVYNsa8klDVx1K7i2zdRL8gcli5AX/wagiWjdoeWVSHYY8yPDPNteEQcWNcFwpS6F/pqYSujeXEoqZTuAYPRMFdAYZdHx/4lU3PrhsQOM8hutXXPIh2WuZ2bEuEc1HdSYWIkLo7Lduda3U2Jnd2CvHVjW7x/EPTVkpeAl33bjxuq6GMFevdY+krjSDU1VuIFikdufkqLeWnq8S++CB5+KMNvbFgwmzvHGqV3RgMPZIkPmEVJ+0XX/VMREspYzsDQYw0681TraHqRgiMHe68qMZ+0+d5sOP7u2L7jwBOYLS7cIZIbors5Ab402M78pIGBHod8rZ70r32s9TC7G4ObtgHtt0RrH9JzLD+mOQYFB1jSZ3hX9fOd22/wh81jDwj//7p6WpVM9yjzttrFnUtn7tMbq4wCoiHUaIap97DYcaSKmloXbyOeQhbJMMovrgpUj4Gigf41HLFqWR6gL7LTPp7Ld17NtbrORDpyIcaPSQ7mUJc0J25hu2jjM+C93gaae80Lr8TNNUO+gIc05sJN4igeuUUSLB+4MHXSwmzS0vM6UnNbQyvMjlboHUROqo38WN5aprT62mr/CU621yqtRsHad+xxN5KRfMAgFBpWKIqZwVGIF0a6lAM/rOQMElgLEWg6VGvoxyg94PBao5QNrLb45rcFy3XA061eOaDsrt6h6O44l5bdcTPOXmElkl3xU7dYa/ZYKq8v27h0eigwtAImsUljBDCQ5Op9sBKTgrnj3Jw91prlxdstsppbmzGHtAZpKUwFzSKsHqtFna2/HAIIFuaja+IB7SMdLPXepk7FstOlkMbx8Mpq7dFaTqw/M0qQQqtvv0WyFtzyTK5Jk+RO6foTMT3dRmv9yyohR3HKVfK+3LduwfJK4KPu/lLpEvYi7N5Dqkn/ziykEVtHGBJ/3H3dJk8we5DGGdHr1YtDCnzjI5g7sQdSM92GEXqVLiI2es09563OAutyc8CGA3/RzCLSagHJUjP29tOQDgtqY8X+r4lzLZ4rLLNYnrpuFCTOIRlYpk3WPlGPBtAuyFx5BW36LQn0Bvl+83SONJvznCqWRNGoIQLTcHulULbjcnhOHWgJn6d6X54N0cvZC3BD3ZWp735jsYtmkkmPdcwOAuxrvOJsvK6peH6Jj9tYo/J3AzqBI0w2lTS0nvTnV7g4baNOa5xQLZeZ5eaaB27ue+b7PpREsueNXoDWaErppgvcvegmsRhWy1SnamWmKvnwmS0naFu6XbotT/DSc4npfqunLrreRcYf/b7W4BliJA/PRx2GVgr8E+rQARIRFHPgbEZU7f4szqsw3cjJ3gcxp0Npke4rrUWq663TGRJJta3//d8YY5bjSyoHO2tSbJpGROOZ3Ef3JMNGPaOmQMc5FSw3MZYV3oxX+AWDOuAt0gXRA2VR7vxDCr5cd4KUDNeqW7vviVCDRqgj5ev7a1ccrm8GxrgnaylHiOvipg192cbo0mU7fRg1L+7HmOdGuo2jYJlMgZy1caPDeJkyNhZA4t8PMNC+I50RalzfgBEPrQh5tz+eZSWsicqBIraKBdD00FPe+EgRSw5taFqcY3jRzqt+0TEqGH58FV7CTMNfgf3dKKPgCqlSZ2pdz66AwpT9d4O2pUpI6n24fkd16w1dChXvLcCg60MWCrqZp3PuoE315mPLnJqpy3WY79KTBrZpaS16Qx+xMlhU4fBs349jSQJHYfUAVy1d3IJr2Oq/7agcpE8mC3P4m9gnwqtsNvLM+Ke7LF7oAMD/3o6VlDzw8UdyZoTU6I19t/p9lYsDHa79vweoeVQN/s+y465Bet7Ck6JYlLmR2NDQUtepuUI32XamkgI/P4b+hfOi8eh8Z5B3txfuOD4JbmsC4tWqLFu2aLKiRLcn78+U/IGO2zRYIAwP1Cw/SX/7js/oanfFt+efiaA/Zxvqz6u3+fXK9B+8oZfHAYthwxQzSWjtrHku77/BDSMATDbyPPxlFlOe6Lxmg8OqFvQi+fTo2Xio9DVb6FMTfnL5BO+aYDQceIvJ3i5A9njArU009UBpsSM3aGPfwoxNeQfx3xYBvWE6HyORlR79Y/exAA+vrMn1G7D/O4tsyRSVb3Kmuxi+DfgGVoN+y6uvp1OHxkM5fD1A06mM7KS6lY4bA5FXDYn/hTzG1jVko7szSOdvVJNZk/xAfyc3BKa85tWf0U/B6SVjjzco19xaSsobsT2o/CH4OLNIceIIdJE+2X2HV1tIN4xYSGin4Jo69OGHA/HVdKrGTa798d6lkJghFOy0rz6q7SHJ+gA6J91RqEJBYO8aVz4lv7Ay3fB0mXBmPdZk59z++TAjVa8rt2G1xO5Lw/YyGjdYyxJ+yLtjRKQnnbzydgxEARXxZGGwQ7KdO00BgOsyvc9ll6mqvzj6JW9N6v1VbIfLW1qkiLD4VBChXqFO1pBwGB+OYCgdOwn+0bpcenRaUFyEVNwblCd8MY5Nwh4znR68zJCwv4bMFUvaykcqgmbrqI40dBqH+YEAH0YgsShDYjbtTq065wuKYBi3Pg20eU2bnSNc0If3QLrjZKTS5RyctZt8jHq+HMNq6uqVXJaATKz60KN12M9wzasCbqXll/MdGbBgtrOmTEMfmXlFj4dPpE2EeQLeBl95Z+ptVlrp+WksaWLaLf1cjqPZ0I1bCt2HILK0kyrimVSeh09Q/iu3DxEx6NUuyeeiA3qyYACsax6qu+xmos8yRhceXAZ6wpi8HG2dr5oStgi/qsgvYFDSHju9KX5MhqjVLoFpswf/a3Hkm/24CJH89g+qHkubdYPHgYcpCuiT22VPpTdzpyEPVlGPLy+ZJHKuXg2+5paxSDDPLfFpvvvz5epbom2NMfL5nPPr+oNC6dWF9C8MaqWe2tOvwyvsDWbf7VSB7OwxDzPTgUoOfYTGlu1vAT2lmqTbIjl7h7fiU7sTtDDuQZgHYR+IDASOWCeGYatoE8/ei+qwA/+3QPJs5lt5H1RNQ7+abRlagXXR1jN8eJHXT26daSe5WLj5y7+LQA98wjx46IZj+K3BDwUPPDTBTmVZ2q8aTDJrrzFSgzwks8OQIk/e7Ej9nsiqT+dSj4RE5C3OrBe5/yK2urcCTkVn9Pa5zetJ03N+qomwcPnb62OPTuWJN9zkTSOZr62mGHlBe/jh1ATx8Dh565iKz80193BGSzMIR6NMuTLleUvPSuFOxBCeld8ZNlELLBUWGQD2nVlLCs7xGSrPO3e6RIWuYQxLR6hO7PHKscIsHRxomClluqPSpZUM3rqaFw13bjSfvWwAqzzS+IMqpfcak54/EqdQ7YWHNC48xjLBac9xeBQHdCqb8xuPVG7Slq1a4lextTP1OXU3j6NkgZ2E1IXbqL7q0QYo8P9/QlBmP6eKe4JyaRAeDBY/l7znxr1V1UQSFjgCGSh6LwsH3isT7i+dA/vABA50M53uscj7QpA2Fd/pCtIeeJXlskn6zdkyDjukJhv1fzJsw79iGVGVfzrBkslxTZOHAn3HfoDisGMQ95qfh3a1mjfboq1Bsnstf8DRt7EAMOz6oxoOscbIGflqeRZsB2wIRpBIls7ejHSIxjlv891ubGvwQ0XnczR8tRZ4lODzJ671XQD57Y/xnvNPyrGrgvwimdODHQKy9quQBadtU9XkZoy8fM6ROB3w8pIC68g0rmNCw2bkq9z9bjqFZdvZt+rWfZjW8yheap4SGyYodTjgfCTR/OsY3gt0fzOqywfoPL2Xz7oUJtpcl7f2dbMlpyoEBwBMV/WrLYjPJYxkDPq8+Cpm4s3rSc1a4KkEIoOuWe4OTHLZnMN+pRFxuTDGKN33w47IXMMbuPtUo5Ou3Jcjjbo8YFlySdFK92e1ZoNdyoLuENDFwEIibwSr0Epm5SDwPoKPuOpxJFSAcp+yM+K+7Hm6o7NLJH1lCLmEPymF7zJLhN/AF/8euaYctyIdjY5CSoJkHLmo+5rABUdyas/BKfhjA/NN2puKckbeEDxtDV61vuijeaj/fycpvYt8aY4lu6nknnrQueRvZNQ5l04/wab99qrMKzFKVD45oRNXtuX7/5cbwM3FYuxmkSxu1LlxiJbVDrcd6TNMFZYMaLDfrJ9+P84ddOPtJg0ZlYEq2/iZPAGf2l4KlsSRQgZS6ZExrdkymG6E4vMiAvfGabKiDQimf/KtJuJyte3C6A/hqNUjU/SqGRQfZLcUrst1H/XxlhICzZ6XmQ1aexNaijwhHy56L8gm2oTXezwXtuFfRMC/q/dbV5z7/yr+1LXYiVgSbPl0Dihfxs1dvKMQbeBb68ITMnWaTZ0YS0oCYlSu29WvO1lI/2EfOzygSWLBKg4dZzrt48hJyINuRj7JVYZoGH439c2qQZufKcJ/LfR54zgDlFhuXPiUy0GxE96XF8/xCY3XfXCq2gemkqFdtDfUZhwrSLcZm39tP5fzyWjoMdaz+Zwbo2rPkKC3OqTQkrNw0rBAwp8JQnCg76uyUhnv8ft9e39HxWJX3fQ8UMRcBWy9yo5Xuzif2P6Y5dV41VNVbrmyImmWcjmiDzacrPffj/K5/lFZG9ItnY9mljj7PUVl6IQ7w1P5mlhxwZB/8GAcLWUN5utfkCEP/AIKjaR9+cFpfmCKstig3veZZEUdrq7O4/VSkkeCFvdOngF40TfgCfLDXfAJXmYgWth5p/ZmKYQFarFc9mVG7F2YK1SThEYqnSjR/AIJOoNlrKhDyYoSGYCy5UH7RO6NAR9XbBjeR9O4TVbzP7VFDWgiyQHHqMAQRhpaNWtkV4OUnxLn1MvSgDWYcmYOjZ8jSU26WeGNT2GzPOHmEfX87teMsyvk9Bjol68ldpm3od9mia4nM0BNlno/TNH5wkRONYKfcgBu6Nbj0SqNrAn0VetDAsTTrPlEcroCp1mihQ5yVBj09IU5xM2b78FFU4/dF5GaPNeqPBs59Ie0wkUhSHsbeGo3PpfTbumbc1xczTarfitw6PEYNKAJfDNyFGjqFpn7eM7hevyEHE0uupJC3hSRC1KzSlfvtJLkumRBo5Y8D48D9BWxmZZeDa7o/qNWWSEYBETZiTZSo12+L5eOkrGcQj0vv5KvMn29RJ1bKx1YYl1oxFN2zRD6gctSCgRQUFlDKM8g5tYvBNtdf1v+AIqyHvk0iON66+b/nL+S/Gz4uXFUDoMe+lFK1WWEZT8HYdZDnyZCTtoj/SeL/r8OJyMeJjspMxroSIi7hClBQ4X57gZlKA+ssO5rVFeJwQuSU6E+XOLVLoNdncQz2PxUdHbMVBZoq6YedbkacPAnOgFAssH4WmJZKnl1QQYxUJhvhGyyChWPAx+jhIDFjQGXYnJ2k2ykLS/YpV9/Fm8I8bvTL/J5NqUFbROlTLCfyrrAAojqWv9WN7+4ZuwIxMkv9iu2Kdd/ynDFz0dAlLFWBC1hUeB64aoh95rk5cvNx0+O/mkKvb2xD1sifRuMibYgmbKlTnHvY1NCrUoFlXofASwRU6YBEmB5pAdvRI8SX+Xnv4u0Bz2tYMxiVojwdXex9+Zd+5KXkYLsJVPgCKPagroEUk1ZGqLPpx+myEneiMtGnlMb/mj4+ZQl9c1/MkzoE3LTTBpOc2dNj8QZ1QMfw9wk8kZp63aTOe1gUULPKxUqc09uKwQJLq1VnzZdDsBkHiTrkvav+VumwAINPOy9LVcPpErmhBzjIQO2DXH4AIZrM4mVbNe3x/S70yKlAx7/mNfHxnHgS8WASPzlWKvViGnQeK2PoFo1Jt5KD5c2HC71gM6l4p+VSMzBGOxW7tjBV58sqd0Eu/72hAtrt9JK7mexK2TUJEuHgv6mHLlAkIOn6QnIZl2ZCnO6VJfghXYfN120wlYg2NN3GXjAY2Vj1UcxsO+kkvxiwA7vHqiw6MIxIGa+yVX2+jT9t7P1IoRcHhDs5fOcKoaeEx0zlgmoGRy4Iw5xElteuMbqNs92dV+AWOZ9l8s6LwM7JqZHPAiwd0hncEieoMdeaNhh1G0M+hqjyrdOB/hcEowaSxuojyi4f92HYZ5lStQwOUgsP7+mObyguJycYdOhAUze/KDpGmk4+syruh42NQ56oS3r4iSjgo+cE6hB1tiq9HzZD0+MgtxBldV+yzeOgJQ9PvaQkt3vCqF+QDc0vBAbudsVTUIgDsG24FNX2hnMMHuRI1NbA+eUG5qwNdlI7b0lJigBUy3N5GdWzLl1310j700NfHt5O8PfOyyT3SpuzPUeFbEyexz/YmooLoQ4F5TYgqZBZDoAlojRqjY7ZTaHzI//XSKoREW8wfZohjYDszrzu2zTOOvQuDZylScffZI+zeL/gWEN4KBh8uV854LgHDk4v5u7QZp77tP4JUno70E4ANJdgLzoJcZFRA/QY3Ekl3achfigaMoFA2ZFfImXfvWxOnEXZcJ+jL39gMbFEH/dcS5xXMGa2HktC0KjolRU2MUVbDjadiY5GjdpE3miNkLgVKFaey34Uz1shTzoNFoNX82PETGnLsY6o3QSFj696dTCc/y2jHyX3V3J8f4T2pe+1QX411lWtf0uNJqLWM5GHoDp9eGh6qRcYe0POenvhpCKQwFU/NK4DlGQfXgOyF+9p2ClpVAXbrt+UG2dlhvHsQZajk+Jiv3fXNOpqHUOoLOeRaHd5twGognzKNs0BZJUP0NXLxlJ9gfgAcM/TfQjhgZ4VDQIPdmvSxyJkwff0xPzv+TcABOGDJaFIYl3ipX/vR+biFIluhUYFXXzVwgBW4DYLv6zsm2p05CPhW/VcYFjZvAWYt5+/BlqcU33biZ8IymwyLfxOySuBQcySHCRzM7+SiIieD1P4nXIMs5DA4VfQ4HEmSHBDVl0bo0SGtKD8mSc5aVM6blD6o1P9CnHN/jQWR7FSfqS0YUY0d9XPBoFNOR6U1sUHiUy20uHCbh4rbwh8egQ1pUPbAFL82e81IfBgL6GmHO307DmBm7h7FeXaKSFQo2YWIWLZlwPbclRaKAf7++4AAAzS2g8p8ETKTxJ/XpQHYbWfa2HrCBOxvbDgy+DJfN6JsHcMsrsnLZWD9CBX6mugNTfVmMwDH+s4OtrXWowe658Ie09SIW+qlRrGQD5+Wkm/PBfIU2P9Ce6R9+ArCeur3qZap6ZowhYME5tFLP/yVnRVJJQvfyXS3DaLC9ZHIS0412lWjB0Ps1XpoTTOVlysfWw8NmToKihk6f66HP8PJDxGSf5p7g2dJ5Pa0JHeRs9mPIXfAhQZWCzY5Ged2mp/3NpoZWaw8QE5cmnbpOlhKZmK76QXikaXExGd2lTAAKeI2fI4nwbiTHQP8ONmycNGqFKlrAAAAAOUER9bOKkweecWrZahnxeY2IAJZKzaBvgAAAA" alt="" aria-hidden="true" />`;
      document.body.appendChild(d);
      setTimeout(()=>{ try{ d.remove(); }catch(_){} horseRunBusy = false; }, 2400);
    }catch(_){ horseRunBusy = false; }
  }

  // =========================
  // Zoom compensation
  // =========================
  const CGD_BASE_DPR = Math.max(1, Number(window.devicePixelRatio) || 1);
  function applyZoomCompensation(){
    try{
      const current = Math.max(1, Number(window.devicePixelRatio) || 1);
      const inv = Math.min(1.5, Math.max(0.66, CGD_BASE_DPR / current));
      const doc = document.documentElement;
      doc.style.setProperty("--cgdInvZoom", String(inv));
      const app = document.getElementById("cgdApp");
      if(app){
        const top = app.querySelector(".cgdTop");
        const bottom = app.querySelector(".cgdBottom");
        const queue = app.querySelector(".cgdQueueSide");
        if(top) top.style.marginBottom = `${Math.round((1 - inv) * 18)}px`;
        if(bottom) document.body.style.paddingBottom = `${Math.max(70, Math.round(70 * inv))}px`;
        if(queue) queue.style.flex = `0 0 ${Math.round(390 * inv)}px`;
      }
    }catch(_){}
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
}
.cgdTop{
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: rgba(18,20,24,.92);
  color: #fff;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  padding: calc(4px * var(--cgdInvZoom,1)) calc(9px * var(--cgdInvZoom,1));
  min-height: calc(42px * var(--cgdInvZoom,1));
  max-height: calc(42px * var(--cgdInvZoom,1));
  transform: scale(var(--cgdInvZoom,1));
  transform-origin: top center;
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
.cgdGrid{ flex: 1 1 auto; display:grid; grid-template-columns: 0.82fr 2.18fr; gap: 12px; }

.cgdQueueSide{
  width: calc(390px * var(--cgdInvZoom,1));
  min-width: calc(390px * var(--cgdInvZoom,1));
  max-width: calc(390px * var(--cgdInvZoom,1));
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
  grid-template-columns: minmax(0,1fr) 96px;
  align-items:center;
  gap: 8px;
}
.cgdQueueRowItem .nm{ font-weight: 950; font-size: 12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cgdQueueRowItem .ord{ font-weight: 950; opacity:.65; font-size: 12px; }
.cgdQueueArrows{ display:flex; gap:6px; align-items:center; justify-content:flex-end; align-self:center; min-width:96px; flex:0 0 96px; }
.cgdQueueArrows .cgdMiniBtn{ min-width: 40px; width: 40px; height: 32px; padding: 0; line-height: 1; display:inline-flex; align-items:center; justify-content:center; flex:0 0 40px; }

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

.cgdZoomCtl{
  border: 1px solid rgba(30,40,70,.16);
  background: rgba(255,255,255,.95);
  color: rgba(18,26,40,.92);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 950;
  height: 28px;
}
.cgdZoomPane{
  transform-origin: top center;
  transition: transform .12s ease;
  will-change: transform;
}
body.cgdDark .cgdZoomCtl{
  background: rgba(255,255,255,.12);
  color: #fff;
  border-color: rgba(255,255,255,.14);
}

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

#listWho.cgdWhoGrid{ display:grid !important; grid-template-columns: repeat(auto-fit, minmax(255px, 1fr)); gap: 8px; align-content:start; }
@media (max-width: 1100px){ #listWho.cgdWhoGrid{ grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); } }

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
  padding: calc(6px * var(--cgdInvZoom,1)) calc(12px * var(--cgdInvZoom,1));
  min-height: calc(52px * var(--cgdInvZoom,1));
  max-height: calc(52px * var(--cgdInvZoom,1));
  transform: scale(var(--cgdInvZoom,1));
  transform-origin: bottom center;
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

.cgdHorseRun{
  position: fixed;
  top: 54px;
  left: -520px;
  width: 420px;
  height: 220px;
  z-index: 2147483647;
  pointer-events:none;
  opacity: .99;
  animation: horseRunAcross 2.2s linear forwards;
}
.cgdHorseRun img{ width:100%; height:100%; object-fit:contain; display:block; filter: drop-shadow(0 8px 20px rgba(0,0,0,.18)); }

@keyframes cgdHotBlink{
  0%{
    background: #00FF00;
    color: #111;
  }
  100%{
    background: #FFFFFF;
    color: #111;
  }
}
@keyframes horseRunAcross{
  0%   { transform: translateX(0); opacity: 0; }
  8%   { opacity: .98; }
  100% { transform: translateX(calc(100vw + 980px)); opacity: 0; }
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
    const zn = document.getElementById("zoomNew"); if(zn) zn.value = String(state.columnZoom.new);
    const zw = document.getElementById("zoomWho"); if(zw) zw.value = String(state.columnZoom.who);
    const zq = document.getElementById("zoomQueue"); if(zq) zq.value = String(state.columnZoom.queue);
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

            <select class="cgdSelect" id="searchScope">
              <option value="ALL">Busca geral</option>
              ${CONFIG.USERS.map(u=>`<option value="${esc(u.id)}">Busca: ${esc(u.name)}</option>`).join("")}
            </select>
            <input class="cgdInput" id="searchBox" placeholder="Buscar lead por nome…" style="min-width:220px" />
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
                    <select class="cgdZoomCtl" id="zoomNew"><option value="0.9">90%</option><option value="1" selected>100%</option><option value="1.1">110%</option><option value="1.2">120%</option><option value="1.3">130%</option></select>
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
                    <select class="cgdZoomCtl" id="zoomWho"><option value="0.9">90%</option><option value="1" selected>100%</option><option value="1.1">110%</option><option value="1.2">120%</option><option value="1.3">130%</option></select>
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
                <select class="cgdZoomCtl" id="zoomQueue"><option value="0.9">90%</option><option value="1" selected>100%</option><option value="1.1">110%</option><option value="1.2">120%</option><option value="1.3">130%</option></select>
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
        const data = dtuf ? fmtDateBRFromISO(dtuf) : "—";
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
          runHorseAcross();
          if(state.soundOn) playWhipAlert();
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
      const { startISO: dayS, endISO: dayE } = dayRangePortal();
      const { startISO: monS, endISO: monE } = monthRangePortal();
      const { startISO: r30S, endISO: r30E } = last30DaysRangePortal();

      const users = CONFIG.USERS.slice();
      for(let i=0;i<users.length;i+=4){
        const part = users.slice(i,i+4);
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
        await sleep(120);
      }
      renderWho();
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
    $("#btnSound")?.addEventListener("click", ()=>{
      state.soundOn = !state.soundOn;
      updateSoundUI();
    });

    $("#btnSilence")?.addEventListener("click", ()=>{
      state.soundOn = false;
      updateSoundUI();
    });

    $("#btnSoundOn")?.addEventListener("click", ()=>{
      state.soundOn = true;
      updateSoundUI();
      if((state.newLeadsAll||[]).length > 0) playWhipAlert();
    });

    $("#btnDark")?.addEventListener("click", ()=>{
      state.dark = !state.dark;
      applyDark();
    });

    $("#btnRefresh")?.addEventListener("click", hardRefreshAll);

    $("#btnBatch")?.addEventListener("click", modalBatchTransfer);
    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);

    $("#btnGET")?.addEventListener("click", ()=> window.open(CONFIG.LINKS.GET, "_blank", "noopener"));
    $("#btnVendas")?.addEventListener("click", ()=> window.open(CONFIG.LINKS.VENDAS, "_blank", "noopener"));

    $("#btnQueueManage")?.addEventListener("click", modalQueueManage);

    $("#zoomNew")?.addEventListener("change", (e)=>{ state.columnZoom.new = Number(e.target.value)||1; saveColumnZoom(); applyColumnZoom(); });
    $("#zoomWho")?.addEventListener("change", (e)=>{ state.columnZoom.who = Number(e.target.value)||1; saveColumnZoom(); applyColumnZoom(); });
    $("#zoomQueue")?.addEventListener("change", (e)=>{ state.columnZoom.queue = Number(e.target.value)||1; saveColumnZoom(); applyColumnZoom(); });

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
