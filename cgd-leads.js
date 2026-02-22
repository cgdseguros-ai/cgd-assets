/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   ✅ Correções desta versão (baseada no lead 6979):
   - Contagens por "Data PEGAR" (UF_CRM_1771741018): filtro OR (ISO local + BR datetime)
   - Botão "DIAG 6979" para confirmar formato salvo no Bitrix e validar contagens
   - ABRIR com retry e timeout maior (reduz "Sem conexão no momento")
   - HISTÓRICO rápido: últimos 2 primeiro; contagens depois
*/
(function(){
  "use strict";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    UF_PRAZO: "UF_CRM_1768175087",
    UF_DATA_PEGAR: "UF_CRM_1771741018",

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

    FAST_NEW_PULSE_MS: 1500,
    FULL_NEW_LEADS_MS: 9000,

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

    HOT_EMOJI: "🔥",

    // ✅ Lead de diagnóstico (você passou 6979)
    DIAG_LEAD_ID: 6979,
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

  // Formato ISO local: YYYY-MM-DDTHH:mm:ss (sem Z)
  function bxLocalDateTime(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da= String(d.getDate()).padStart(2,"0");
    const hh= String(d.getHours()).padStart(2,"0");
    const mi= String(d.getMinutes()).padStart(2,"0");
    const ss= String(d.getSeconds()).padStart(2,"0");
    return `${y}-${m}-${da}T${hh}:${mi}:${ss}`;
  }

  // ✅ Formato Bitrix BR comum: DD.MM.YYYY HH:MM:SS
  function bxBRDateTime(d){
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,"0");
    const mi = String(d.getMinutes()).padStart(2,"0");
    const ss = String(d.getSeconds()).padStart(2,"0");
    return `${dd}.${mm}.${yy} ${hh}:${mi}:${ss}`;
  }

  function dayRangeLocal(){
    const d0 = new Date(); d0.setHours(0,0,0,0);
    const d1 = new Date(d0.getTime() + 24*60*60*1000);
    return {
      startISO: bxLocalDateTime(d0), endISO: bxLocalDateTime(d1),
      startBR:  bxBRDateTime(d0),    endBR:  bxBRDateTime(d1)
    };
  }
  function monthRangeLocal(){
    const d0 = new Date(); d0.setDate(1); d0.setHours(0,0,0,0);
    const d1 = new Date(d0); d1.setMonth(d1.getMonth()+1);
    return {
      startISO: bxLocalDateTime(d0), endISO: bxLocalDateTime(d1),
      startBR:  bxBRDateTime(d0),    endBR:  bxBRDateTime(d1)
    };
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
    const timeoutMs = Math.max(9000, Number(options.timeoutMs || 19000));
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
          await sleep(240 + attempt*420);
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

  async function retry(fn, tries=3, baseDelay=320){
    let last;
    for(let i=0;i<tries;i++){
      try{ return await fn(); }
      catch(e){ last = e; await sleep(baseDelay + i*520); }
    }
    throw last;
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
.cgdQueueSide{
  width: 390px;
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
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 8px;
}
.cgdQueueRowItem .nm{ font-weight: 950; font-size: 12px; }
.cgdQueueRowItem .ord{ font-weight: 950; opacity:.65; font-size: 12px; }
.cgdQueueArrows{ display:flex; gap:6px; align-items:center; }
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

.cgdUserLine{ display:flex; gap:10px; align-items:flex-start; }
.cgdUserPic{
  width: 52px; height: 52px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid rgba(0,0,0,.10);
  background:#fff;
  flex: 0 0 auto;
}

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
.cgdBossPics{ display:flex; gap:8px; align-items:center; }
.cgdBossPic{
  width: 34px; height: 34px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(255,255,255,.08);
}
.cgdAddr{ font-size: 11px; font-weight: 900; opacity: .92; line-height: 1.15; }
.cgdCnpj{ font-size: 11px; line-height: 1.25; }

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
  padding: 10px 10px;
  border-bottom: 1px solid rgba(30,40,70,.10);
  font-size: 12px;
  vertical-align: top;
}
.cgdTable th{ text-align:left; font-weight: 950; background: rgba(245,248,255,.8); }
.cgdTable tr:last-child td{ border-bottom: 0; }

body{ padding-bottom: 110px !important; }

.cgdPlane{
  position: fixed;
  top: 86px;
  left: -520px;
  width: 420px;
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
@media (max-width: 1200px){
  .cgdLayout{ flex-direction: column; }
  .cgdQueueSide{ width: auto; min-height: unset; }
}
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  // =========================
  // Modal system
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

    lastServedUserName: "—",

    userPhoto: new Map(),
    userPhotoTs: new Map(),
    userPhotoPending: new Set(),
  };

  // =========================
  // Fotos users (RAM cache)
  // =========================
  const BLANK_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  async function fetchUserPhotoOnce(userId){
    const r = await bx("user.get", { ID: String(userId) }, { timeoutMs: 15000 });
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
        await sleep(220 + i*320);
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
      await sleep(140);
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

            <button class="cgdBtn" id="btnDiag">DIAG ${esc(CONFIG.DIAG_LEAD_ID)}</button>

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
                <div class="hTitle">NOVOS LEADS</div>
                <div class="hActionsRow">
                  <button class="cgdBtn" id="btnBatch">Transferir em lote</button>
                  <button class="cgdBtn" id="btnRefreshNew">Atualizar</button>
                </div>
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

            <section class="cgdCol" id="colWho">
              <div class="cgdColHead">
                <div class="hTitle">HISTÓRICO DE LEADS</div>
                <div class="hActionsRow">
                  <button class="cgdBtn" id="btnHideUsers">Ocultar usuárias</button>
                  <button class="cgdBtn" id="btnRefreshWho">Atualizar</button>
                </div>
              </div>
              <div class="cgdList cgdWhoGrid" id="listWho">
                ${CONFIG.USERS.map(u=>`
                  <div class="cgdCard">
                    <div class="cgdUserLine">
                      <img class="cgdUserPic" alt="${esc(u.name)}" src="${BLANK_IMG}" />
                      <div style="width:100%">
                        <div class="cgdCardRow">
                          <div style="font-weight:950">${esc(u.name)}</div>
                          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
                            <span class="cgdBadge">dia: …</span>
                            <span class="cgdBadge">mês: …</span>
                            <button class="cgdMiniBtn" disabled>Abrir</button>
                          </div>
                        </div>
                        <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.55">Carregando últimos leads…</div>
                        <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.45">—</div>
                      </div>
                    </div>
                  </div>
                `).join("")}
              </div>
            </section>
          </div>

          <aside class="cgdQueueSide" id="queueSide">
            <div class="cgdQueueHead">
              <div class="qt">FILA</div>
              <button class="cgdBtn" id="btnQueueManage">Gerenciar</button>
            </div>
            <div class="cgdQueueBody" id="queueBody">
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
            <div class="cgdAddr">Av Ayrton Senna, 2500, SS109, Barra da Tijuca</div>
          </div>
          <div class="bCenter">System created by GRUPO CGD</div>
          <div class="bRight">
            <div class="cgdCnpj">
              <div><b>CGD CORRETORA</b></div>
              <div>CNPJ 01.654.471/0001-86 • SUSEP 202031791</div>
              <div style="height:6px"></div>
              <div><b>CGD BARRA</b></div>
              <div>CNPJ 53.013.848/0001-11 • SUSEP 242158650</div>
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
          await sleep(220 + attempt*420);
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
          await sleep(240 + attempt*520);
        }
      }
      throw lastErr || new Error("Falha ao salvar fila");
    });
  }

  function setStatus(txt){
    const el = $("#statusLine");
    if(el) el.textContent = txt;
  }
  function setLastServed(name){
    const el = $("#lastServed");
    if(el) el.textContent = name || "—";
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
        <div style="display:flex; gap:10px; align-items:center">
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
  // LEADS: fetch / actions
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
    }, { timeoutMs: 14000 });

    const total = Number(data && data.total);
    const items = Array.isArray(data?.result) ? data.result : [];
    const newestId = items && items[0] ? Number(items[0].ID) : 0;

    return {
      total: Number.isFinite(total) ? total : items.length,
      newestId: Number.isFinite(newestId) ? newestId : 0
    };
  }

  // ✅ Filtro OR (ISO + BR) para DATETIME do Bitrix
  function buildPegFilterBase(startISO, endISO, startBR, endBR){
    const F = CONFIG.UF_DATA_PEGAR;
    return {
      "STATUS_ID": CONFIG.COUNT_STATUS_FILTER,
      "LOGIC": "OR",
      "0": {
        [">=" + F]: startISO,
        ["<" + F]:  endISO
      },
      "1": {
        [">=" + F]: startBR,
        ["<" + F]:  endBR
      }
    };
  }

  async function fetchPegTotalRange(startISO, endISO, startBR, endBR){
    const data = await bxRaw("crm.lead.list", {
      filter: buildPegFilterBase(startISO, endISO, startBR, endBR),
      order: { ID: "DESC" },
      select: ["ID"],
      start: 0
    }, { timeoutMs: 20000 });

    const total = Number(data && data.total);
    if(Number.isFinite(total)) return total;
    const items = Array.isArray(data?.result) ? data.result : [];
    return items.length;
  }

  async function fetchPegTotalRangeUser(userId, startISO, endISO, startBR, endBR){
    const base = buildPegFilterBase(startISO, endISO, startBR, endBR);
    base["ASSIGNED_BY_ID"] = String(userId);

    const data = await bxRaw("crm.lead.list", {
      filter: base,
      order: { ID: "DESC" },
      select: ["ID"],
      start: 0
    }, { timeoutMs: 20000 });

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
    if(op.includes("PREVENT")) return { bg:"#0b2a6b", fg:"#fff" };
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
    if(fonte) b.push(["FONTE", fonte]);
    if(dt)    b.push(["DATA", dt]);

    if(b.length < 2){
      if(it.SOURCE_ID) b.push(["FONTE", it.SOURCE_ID]);
      if(it.DATE_CREATE) b.push(["CRIADO", String(it.DATE_CREATE).replace("T"," ").slice(0,16)]);
    }
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

    // ✅ salva Data PEGAR no formato BR (mais compatível com filtro)
    enqueueOp("pickLead", async ()=>{
      await leadUpdate(leadId, {
        ASSIGNED_BY_ID: String(userId),
        STATUS_ID: "IN_PROCESS",
        [CONFIG.UF_DATA_PEGAR]: bxBRDateTime(new Date())
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

    enqueueOp("discardLead", async ()=>{ await leadUpdate(leadId, { STATUS_ID: "JUNK" }); });
    flushOps();
  }

  async function actionTransferLead(leadId, toUserId){
    enqueueOp("transferLead", async ()=>{ await leadUpdate(leadId, { ASSIGNED_BY_ID: String(toUserId) }); });
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
    $("#pillDay").textContent = `Leads do dia: ${stats.day}`;
    $("#pillMonth").textContent = `Leads do mês: ${stats.month}`;
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
      const us = state.userStats[u.id] || {};
      const l1 = us.lastTwo?.[0];
      const l2 = us.lastTwo?.[1];

      const last1 = l1 ? `Último: ${leadDisplayName(l1)}` : "Último: —";
      const last2 = l2 ? `Anterior: ${leadDisplayName(l2)}` : "Anterior: —";

      const day = (us.pulledToday===0 || us.pulledToday) ? us.pulledToday : "…";
      const mon = (us.pulledMonth===0 || us.pulledMonth) ? us.pulledMonth : "…";

      const imgUrl = state.userPhoto.get(String(u.id)) || BLANK_IMG;

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdUserLine">
          <img class="cgdUserPic" alt="${esc(u.name)}" loading="lazy" src="${esc(imgUrl || BLANK_IMG)}" data-user-pic="${esc(u.id)}" />
          <div style="width:100%">
            <div class="cgdCardRow">
              <div style="font-weight:950">${esc(u.name)}</div>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
                <span class="cgdBadge">dia: ${esc(day)}</span>
                <span class="cgdBadge">mês: ${esc(mon)}</span>
                <button class="cgdMiniBtn" data-open-user="${esc(u.id)}">Abrir</button>
              </div>
            </div>
            <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">${esc(last1)}</div>
            <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">${esc(last2)}</div>
          </div>
        </div>
      `;
      list.appendChild(card);
    });

    setTimeout(async ()=>{
      const imgs = $$("img[data-user-pic]");
      const ids = imgs.map(img=>String(img.getAttribute("data-user-pic")));
      await Promise.all(ids.map(id=>ensureUserPhoto(id)));
      imgs.forEach(img=>{
        const id = String(img.getAttribute("data-user-pic"));
        const url = state.userPhoto.get(id) || "";
        if(url && img.src !== url) img.src = url;
      });
    }, 250);
  }

  // =========================
  // HISTÓRICO — FAST FIRST
  // =========================
  let usersLastTwoBusy = false;
  async function refreshUsersLastTwo(){
    if(usersLastTwoBusy) return;
    usersLastTwoBusy = true;
    try{
      const users = CONFIG.USERS.slice();
      for(let i=0;i<users.length;i+=4){
        const part = users.slice(i,i+4);
        await Promise.all(part.map(async u=>{
          const last = await bxListAll("crm.lead.list", {
            filter: { "ASSIGNED_BY_ID": String(u.id) },
            order: { DATE_MODIFY: "DESC" },
            select: ["ID","TITLE","NAME","LAST_NAME","SECOND_NAME","STATUS_ID","ASSIGNED_BY_ID","DATE_MODIFY"]
          }, CONFIG.LIMIT_LAST_TWO_FETCH);

          const lastTwo = (last||[]).filter(x=>{
            const st = String(x.STATUS_ID||"");
            return st==="IN_PROCESS" || st==="UC_JT9G60" || st==="UC_0NFA3H";
          }).slice(0,2);

          state.userStats[u.id] = { ...(state.userStats[u.id]||{}), lastTwo };
        }));
        renderWho();
        await sleep(140);
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
      const dayR = dayRangeLocal();
      const monR = monthRangeLocal();

      const users = CONFIG.USERS.slice();
      for(let i=0;i<users.length;i+=3){
        const part = users.slice(i,i+3);
        await Promise.all(part.map(async u=>{
          const [d, m] = await Promise.all([
            fetchPegTotalRangeUser(u.id, dayR.startISO, dayR.endISO, dayR.startBR, dayR.endBR),
            fetchPegTotalRangeUser(u.id, monR.startISO, monR.endISO, monR.startBR, monR.endBR)
          ]);
          state.userStats[u.id] = { ...(state.userStats[u.id]||{}), pulledToday: d||0, pulledMonth: m||0 };
        }));
        renderWho();
        await sleep(170);
      }
    }catch(err){
      console.warn("users counts failed", err);
    }finally{
      usersCountsBusy = false;
    }
  }

  // =========================
  // Diagnóstico (Lead 6979)
  // =========================
  async function runDiag(){
    const id = String(CONFIG.DIAG_LEAD_ID);
    openModal(`DIAGNÓSTICO • Lead #${id}`, `<div style="opacity:.75;font-weight:900">Consultando Bitrix…</div>`);
    try{
      const lead = await retry(()=> bx("crm.lead.get", { id }), 3, 350);
      const peg = lead?.[CONFIG.UF_DATA_PEGAR];

      const dayR = dayRangeLocal();
      const monR = monthRangeLocal();

      const dayISO = await fetchPegTotalRange(dayR.startISO, dayR.endISO, "00.00.0000 00:00:00", "00.00.0000 00:00:01").catch(()=> null);
      const dayBR  = await fetchPegTotalRange("0000-00-00T00:00:00", "0000-00-00T00:00:01", dayR.startBR, dayR.endBR).catch(()=> null);
      const dayOR  = await fetchPegTotalRange(dayR.startISO, dayR.endISO, dayR.startBR, dayR.endBR).catch(()=> null);

      const monISO = await fetchPegTotalRange(monR.startISO, monR.endISO, "00.00.0000 00:00:00", "00.00.0000 00:00:01").catch(()=> null);
      const monBR  = await fetchPegTotalRange("0000-00-00T00:00:00", "0000-00-00T00:00:01", monR.startBR, monR.endBR).catch(()=> null);
      const monOR  = await fetchPegTotalRange(monR.startISO, monR.endISO, monR.startBR, monR.endBR).catch(()=> null);

      openModal(`DIAGNÓSTICO • Lead #${id}`, `
        <div style="font-weight:950;margin-bottom:8px">Valor salvo no campo Data PEGAR (${esc(CONFIG.UF_DATA_PEGAR)}):</div>
        <div class="cgdBadge" style="display:inline-block;margin-bottom:12px"><b>${esc(peg || "— VAZIO —")}</b></div>

        <div style="font-weight:950;margin:12px 0 8px">Ranges do dia:</div>
        <div class="cgdBadge">ISO: ${esc(dayR.startISO)} → ${esc(dayR.endISO)}</div>
        <div class="cgdBadge">BR: ${esc(dayR.startBR)} → ${esc(dayR.endBR)}</div>

        <div style="font-weight:950;margin:12px 0 8px">Teste contagem do dia:</div>
        <div class="cgdBadge">Somente ISO = <b>${esc(dayISO)}</b></div>
        <div class="cgdBadge">Somente BR = <b>${esc(dayBR)}</b></div>
        <div class="cgdBadge">ISO OR BR = <b>${esc(dayOR)}</b></div>

        <div style="font-weight:950;margin:12px 0 8px">Teste contagem do mês:</div>
        <div class="cgdBadge">Somente ISO = <b>${esc(monISO)}</b></div>
        <div class="cgdBadge">Somente BR = <b>${esc(monBR)}</b></div>
        <div class="cgdBadge">ISO OR BR = <b>${esc(monOR)}</b></div>

        <div style="margin-top:14px;opacity:.75;font-weight:900">
          Se o campo estiver vazio no lead 6979, a contagem vai dar 0 mesmo. Se estiver preenchido em BR e “Somente BR” der certo, fechamos o diagnóstico.
        </div>
      `);
    }catch(err){
      console.error(err);
      closeModal();
      openModal(`DIAGNÓSTICO • Lead #${id}`, `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }
  }

  // =========================
  // ABRIR (retry)
  // =========================
  async function modalLeadDetails(leadId){
    openModal("LEAD", `<div style="opacity:.75;font-weight:900">Carregando…</div>`);
    try{
      const it = await retry(()=> bx("crm.lead.get", { id: String(leadId) }, { timeoutMs: 22000 }), 3, 380);
      const name = leadDisplayName(it);
      const st = stageName(it.STATUS_ID);

      const respId = String(it.ASSIGNED_BY_ID||"");
      const respNm = userNameById(respId);

      const oper = pickUF(it, CONFIG.UF_OPERADORA);
      const idade = pickUF(it, CONFIG.UF_IDADE);
      const tel = bestPhone(it);
      const bairro = pickUF(it, CONFIG.UF_BAIRRO);
      const fonte = pickUF(it, CONFIG.UF_FONTE);
      const dt = fmtDateBRFromISO(pickUF(it, CONFIG.UF_DT_LEAD));
      const pegar = it?.[CONFIG.UF_DATA_PEGAR];

      openModal(`LEAD • ${name}`, `
        <div class="cgdRow" style="margin-bottom:10px">
          <div class="cgdBadge">STAGE: <b>${esc(st)}</b></div>
          <div class="cgdBadge">RESPONSÁVEL: <b>${esc(respNm)}</b></div>
          <div class="cgdBadge">ID: <b>${esc(it.ID)}</b></div>
        </div>
        <div style="font-weight:900;opacity:.9;line-height:1.4">
          <div>DATA PEGAR: <b>${esc(pegar||"—")}</b></div>
          <div>OPERADORA: <b>${esc(oper||"—")}</b></div>
          <div>IDADE: <b>${esc(idade||"—")}</b></div>
          <div>TELEFONE: <b>${esc(tel||"—")}</b></div>
          <div>BAIRRO: <b>${esc(bairro||"—")}</b></div>
          <div>FONTE: <b>${esc(fonte||"—")}</b></div>
          <div>DATA/HORA: <b>${esc(dt||"—")}</b></div>
        </div>
      `);
    }catch(_){
      closeModal();
      openModal("LEAD", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }
  }

  // =========================
  // Refresh orchestration
  // =========================
  function setPending(n){
    state.pendingCount = Math.max(0, Number(n||0));
    const el = $("#pillPending");
    if(el) el.textContent = `Pendentes: ${state.pendingCount}`;
  }

  let pulseBusy = false;
  async function refreshNewPulse(){
    if(pulseBusy) return;
    pulseBusy = true;
    try{
      const p = await fetchNewLeadPulse();
      setPending(p.total);

      const newest = Number(p.newestId||0);
      if(!state._newLeadFirstPulseDone){
        state._newLeadFirstPulseDone = true;
        state.maxNewLeadIdSeen = newest || 0;
        return;
      }

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

  let statsBusy = false;
  async function refreshStats(){
    if(statsBusy) return;
    statsBusy = true;
    try{
      const dayR = dayRangeLocal();
      const monR = monthRangeLocal();

      const [day, month] = await Promise.all([
        fetchPegTotalRange(dayR.startISO, dayR.endISO, dayR.startBR, dayR.endBR),
        fetchPegTotalRange(monR.startISO, monR.endISO, monR.startBR, monR.endBR)
      ]);

      state.stats = { day: day||0, month: month||0 };
      renderStats(state.stats);
    }catch(err){
      console.warn("stats failed", err);
    }finally{
      statsBusy = false;
    }
  }

  async function refreshQueue(){
    try{
      if(Date.now() - state.queueLocalTouchTs < 1400) return;
      const q = await fetchQueue();
      state.queue = { ...state.queue, ...q };
      renderQueueSidebar();
    }catch(err){
      console.warn("queue failed", err);
      renderQueueSidebar();
    }
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()})`);
    await Promise.allSettled([ refreshNewPulse(), refreshNewLeadsFull(), refreshStats(), refreshQueue() ]);
    await refreshUsersLastTwo();
    refreshUsersCounts();
    setStatus(`Atualizado: ${nowBRTime()}`);
  }

  // =========================
  // UI
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
    $("#btnSound")?.addEventListener("click", ()=>{ state.soundOn = !state.soundOn; updateSoundUI(); });
    $("#btnSilence")?.addEventListener("click", ()=>{ state.soundOn = false; updateSoundUI(); });
    $("#btnSoundOn")?.addEventListener("click", ()=>{ state.soundOn = true; updateSoundUI(); if((state.newLeadsAll||[]).length > 0) tripleBeep(); });

    $("#btnDark")?.addEventListener("click", ()=>{ state.dark = !state.dark; applyDark(); });

    $("#btnRefresh")?.addEventListener("click", hardRefreshAll);
    $("#btnRefreshNew")?.addEventListener("click", refreshNewLeadsFull);
    $("#btnRefreshWho")?.addEventListener("click", async ()=>{ await refreshUsersLastTwo(); refreshUsersCounts(); });

    $("#btnDiag")?.addEventListener("click", runDiag);

    $("#btnGET")?.addEventListener("click", ()=> window.open(CONFIG.LINKS.GET, "_blank", "noopener"));
    $("#btnVendas")?.addEventListener("click", ()=> window.open(CONFIG.LINKS.VENDAS, "_blank", "noopener"));

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

    $("#btnQueueManage")?.addEventListener("click", async ()=>{
      await refreshQueue();
      alert("Gerenciar fila: se você quiser o modal completo aqui (add/remover/ordenar), eu reponho.");
    });

    $("#btnQueueWalk")?.addEventListener("click", async ()=>{
      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        const order = (q.order||[]).map(String);
        if(order.length===0){ alert("Fila vazia. Clique em Gerenciar para adicionar usuárias."); return; }
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

    // Clique nos cards
    document.addEventListener("click", (e)=>{
      const g = e.target.closest("[data-grab]");
      const d = e.target.closest("[data-discard]");
      const openLead = e.target.closest("[data-open-lead]");
      if(g){
        // mantém modal antigo simples (não incluído aqui por brevidade)
        alert("PEGAR está no seu modal atual. Se quiser, eu reponho o modal completo aqui.");
      }
      if(d) actionDiscardLead(d.getAttribute("data-discard"));
      if(openLead) modalLeadDetails(openLead.getAttribute("data-open-lead"));
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
    applyDark();

    warmUserPhotos().then(()=> renderBossPics()).catch(()=>{});

    await Promise.allSettled([ refreshNewPulse(), refreshNewLeadsFull(), refreshStats(), refreshQueue() ]);
    await refreshUsersLastTwo();
    refreshUsersCounts();

    setStatus(`Atualizado: ${nowBRTime()}`);

    setInterval(refreshNewPulse, CONFIG.FAST_NEW_PULSE_MS);
    setInterval(refreshNewLeadsFull, CONFIG.FULL_NEW_LEADS_MS);

    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);

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
