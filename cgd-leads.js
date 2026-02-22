/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - SEM storage do navegador (NADA de localStorage/sessionStorage)
   - Cloudflare Worker PROXY + Realtime (WS) para atualização rápida entre navegadores
   - Fila multi-PC e ocultar usuárias via QUEUE_JSON (Deal em Pipeline 27 / Stage QUEUE_JSON)
   - Layout/estética MANTIDOS (apenas ajustes solicitados: topbar dark, fotos, barra inferior etc.)
   - Leads (crm.lead.*) — NOVO LEAD, EM ATENDIMENTO, ATENDIDO, QUALIFICADO, PERDIDO, CONVERTIDO
*/
(function(){
  "use strict";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    // ✅ Cloudflare Worker (Proxy do Bitrix)
    WEBHOOK: "https://painelleads.cgdseguros.workers.dev/bx/",
    // ✅ Cloudflare Worker (Realtime)
    REALTIME_BASE: "https://painelleads.cgdseguros.workers.dev",

    // Campo UF usado no Follow-up (no LEAD) + também no DEAL do follow-up
    UF_PRAZO: "UF_CRM_1768175087",
    // ✅ Se o campo de prazo no DEAL tiver outro ID, troque aqui:
    UF_PRAZO_DEAL: "UF_CRM_1768175087",

    // Campos no card/badges (se existirem)
    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD:   "UF_CRM_1771333014", // Data/Hora do Lead (UF)
    UF_IDADE:     "UF_CRM_1771339221", // Idade (texto)
    UF_BAIRRO:    "UF_CRM_LEAD_1731909705398",
    UF_FONTE:     "UF_CRM_1767285733843",
    UF_TELEFONE:  "UF_CRM_1771282207",

    // Fila multi-PC via PIPELINE 27 (controle)
    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",
      UF_QUEUE_JSON: "UF_CRM_1771293519",
      TITLE_KEY: "__QUEUE__CGD__"
    },

    // Pipeline 17 (Negócios) — Follow-up cria Deal aqui
    FOLLOWUP_DEALS: {
      CATEGORY_ID: 17,
      // STAGE_ID por usuária (coluna da usuária)
      STAGE_BY_USER: {
        "15":   "C17:UC_FQ8UPI",   // ALINE
        "19":   "C17:UC_1HXNTB",   // ADRIANA
        "17":   "C17:UC_RRQKAQ",   // ANDREYNA
        "23":   "C17:UC_4HQGI1",   // MARIANA
        "811":  "C17:UC_8Y4R4V",   // JOSIANE
        "3081": "C17:EXECUTING",   // BRUNA LUISA
        "3083": "C17:UC_8O5UFO",   // FERNANDA SILVA
        "3079": "C17:UC_P1P9RJ",   // LIVIA ALVES
        "3085": "C17:UC_U8AAGB",   // NICOLLE BELMONTE
        "3389": "C17:UC_A6LSS8",   // ANNA CLARA
        "815":  "C17:UC_ZT6WEB",   // GABRIEL
        "3387": "C17:UC_RXISLQ"    // BEATRIZ
      }
    },

    // ✅ Logo (nova solicitada)
    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=awjcg85eqrbi",

    // ✅ GET EQUIPES (URL única)
    GET_EQUIPES_URL: "https://getcgdcorretora.bitrix24.site/tfequipes/",

    // Refresh (mantendo seus tempos)
    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 7000,
    REFRESH_QUEUE_MS: 2500,
    REFRESH_WHO_MS: 6000,

    // Limites
    LIMIT_NEW_RENDER: 30,          // renderiza 30 (visual), mas busca/conta mais no background
    LIMIT_BATCH_MAX:  600,         // transferir lote (puxa até 600 pendentes)
    LIMIT_USER_LAST:  140,         // histórico por usuária

    // Usuárias do painel
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

    // ✅ Sócios (para fotos no rodapé)
    PARTNERS: [27, 1, 15],

    // ✅ Status/Stages de LEADS (IDs reais)
    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      // ⚠️ Ajuste se ATENDIDO tiver um ID específico no seu Bitrix:
      ATENDIDO: "UC_ATENDIDO_TROQUE_AQUI",
      QUALIFICADO: "UC_0NFA3H",
      PERDIDO: "UC_5IMTI4",
      CONVERTIDO: "UC_B3RQAF",
    },

    // Select do lead
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
  // Helpers DOM
  // =========================
  const $ = (q, el=document)=> el.querySelector(q);
  const $$ = (q, el=document)=> Array.from(el.querySelectorAll(q));
  const esc = (s)=> String(s??"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
  const clamp = (n, a,b)=> Math.max(a, Math.min(b, n));

  function nowBRTime(){
    try{ return new Date().toLocaleTimeString("pt-BR"); }catch(_){ return ""; }
  }
  function todayISOStart(){
    const d = new Date(); d.setHours(0,0,0,0);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da= String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}T00:00:00`;
  }
  function monthISOStart(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    return `${y}-${m}-01T00:00:00`;
  }
  function isoFromLocalInput(v){
    if(!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!m) return "";
    const y=+m[1], mo=+m[2]-1, d=+m[3], hh=+m[4], mi=+m[5];
    const dt = new Date(y, mo, d, hh, mi, 0, 0);
    if(Number.isNaN(dt.getTime())) return "";
    return dt.toISOString();
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

  // =========================
  // Realtime (Cloudflare WS)
  // =========================
  let _ws = null;
  function realtimeConnect(){
    try{
      if(!CONFIG.REALTIME_BASE) return null;

      const wsUrl = String(CONFIG.REALTIME_BASE)
        .replace(/^https:/i, "wss:")
        .replace(/^http:/i, "ws:")
        .replace(/\/+$/,"") + "/realtime/connect";

      const ws = new WebSocket(wsUrl);
      _ws = ws;

      ws.onmessage = (ev)=>{
        try{
          const msg = JSON.parse(ev.data);
          if(msg.type === "QUEUE_UPDATED"){
            refreshQueue();
            refreshUsers();
          }
          if(msg.type === "LEADS_UPDATED"){
            refreshNewLeads();
            refreshPendingCount();
            refreshUsers();
          }
        }catch(_){}
      };

      ws.onclose = ()=> setTimeout(realtimeConnect, 1200);
      ws.onerror = ()=> { try{ ws.close(); }catch(_){} };

      return ws;
    }catch(_){
      setTimeout(realtimeConnect, 1500);
      return null;
    }
  }

  async function realtimePublish(type, payload){
    try{
      if(!CONFIG.REALTIME_BASE) return;
      await fetch(String(CONFIG.REALTIME_BASE).replace(/\/+$/,"") + "/realtime/publish", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({ type, payload: payload||{} })
      });
    }catch(_){}
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

  // chamadas resilientes
  async function bx(method, params={}, options={}){
    const timeoutMs = Math.max(6000, Number(options.timeoutMs || 12000));
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
          signal: ctrl.signal,
          cache: "no-store"
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
        return data.result;
      }catch(err){
        lastErr = err;
        const http = err && err._httpStatus;
        const transientHTTP = (http===429 || http===500 || http===502 || http===503 || http===504);
        const aborted = (err && (err.name==="AbortError"));
        const net = (err && String(err.message||err).toLowerCase().includes("failed to fetch"));

        if(attempt < 2 && (transientHTTP || aborted || net)){
          clearTimeout(t);
          await sleep(220 + attempt*420);
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
  // “Offline”: fila de ações (só RAM)
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
  // Audio — 3 bipes
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
  // UI / CSS
  // =========================
  function injectCSS(){
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
  background: rgba(18,18,20,.92);        /* ✅ topbar dark */
  color: #fff;                           /* ✅ texto branco */
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  box-shadow: 0 14px 34px rgba(10,10,12,.22);
}
.cgdTopLeft{ display:flex; align-items:center; gap:10px; min-width: 280px; }
.cgdLogo{
  width: 53px; height: 53px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.18);
  object-fit: cover;
  background: #fff;
}
.cgdTitle{ font-weight: 950; letter-spacing:.2px; font-size: 13px; white-space: nowrap; color:#fff; }
.cgdTopRight{ display:flex; gap:8px; align-items:center; flex-wrap: wrap; justify-content: flex-end; }
.cgdPill{
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.10);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 900;
  color: #fff;
}
.cgdBtn{
  cursor:pointer;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(255,255,255,.12);
  color:#fff;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 950;
}
.cgdBtn:active{ transform: translateY(1px); }
.cgdBtn:disabled{ opacity:.55; cursor:not-allowed; }

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
  gap: 8px;
}
.cgdQueueRow{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:space-between; }
.cgdQueueRowLeft{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.cgdQueueRowRight{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
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

/* ✅ QUEM PEGOU HOJE em 2 colunas */
#listWho.cgdWhoGrid{
  display:grid !important;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 1100px){
  #listWho.cgdWhoGrid{ grid-template-columns: 1fr; }
}

/* ===== Modals ===== */
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
  width: min(1100px, 96vw);
  max-height: min(88vh, 920px);
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
  vertical-align: top;
}
.cgdTable th{ text-align:left; font-weight: 950; background: rgba(245,248,255,.8); }
.cgdTable tr:last-child td{ border-bottom: 0; }

.cgdUserCard{
  display:flex;
  gap:10px;
  align-items:flex-start;
}
.cgdAvatar{
  width: 46px;
  height: 46px;
  border-radius: 999px;
  background: rgba(0,0,0,.08);
  border: 1px solid rgba(0,0,0,.10);
  object-fit: cover;
  flex: 0 0 auto;
}
.cgdAvatarPH{
  width: 46px;
  height: 46px;
  border-radius: 999px;
  background: rgba(0,0,0,.08);
  border: 1px solid rgba(0,0,0,.10);
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:950;
  font-size: 12px;
  color: rgba(18,26,40,.80);
  flex: 0 0 auto;
}

.bitrix-footer{
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  top: auto !important;
  z-index: 5 !important;
}
body{ padding-bottom: 120px !important; }

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
  function escClose(e){
    if(e.key === "Escape"){ closeModal(); }
  }
  function closeModal(){
    const ov = $(".cgdModalOverlay");
    if(ov) ov.remove();
    document.removeEventListener("keydown", escClose, {capture:true});
  }

  // =========================
  // State (somente RAM)
  // =========================
  const state = {
    soundOn: true,
    lastNewLeadId: null,
    newLeadsAll: [],
    newLeadsRender: [],
    pendingCount: 0,
    stats: { day:0, month:0 },
    userStats: {},           // id -> { day, month, convertedMonth, convRate, lastTwo, list }
    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] },
    lastServedUserName: "—",
    userPhotos: {},          // id -> url
    partnerPhotos: {}        // id -> url
  };

  // =========================
  // User photos (Bitrix user.get)
  // =========================
  function initials(name){
    const parts = String(name||"").trim().split(/\s+/).filter(Boolean);
    const a = parts[0] ? parts[0][0] : "";
    const b = parts[1] ? parts[1][0] : (parts[0] && parts[0][1] ? parts[0][1] : "");
    return (a + b).toUpperCase();
  }

  function normalizePhotoUrl(v){
    // Bitrix pode devolver URL absoluta ou relativa; tenta normalizar
    const s = String(v||"").trim();
    if(!s) return "";
    if(/^https?:\/\//i.test(s)) return s;
    // se vier /upload/...
    if(s.startsWith("/")){
      // não temos domínio do portal aqui (proxy), então devolve vazio para não quebrar.
      // Se seu user.get já retorna absoluto, ok.
      return "";
    }
    return "";
  }

  async function fetchUserPhotos(ids){
    const uniq = Array.from(new Set((ids||[]).map(x=> String(x))));
    const need = uniq.filter(id => !state.userPhotos[id] && !state.partnerPhotos[id]);
    if(need.length === 0) return;

    // Bitrix user.get aceita FILTER[ID]=... mas pode variar; aqui buscamos por ID 1 a 1 (mais seguro)
    for(const id of need){
      try{
        const r = await bx("user.get", { FILTER: { ID: String(id) } });
        const u = Array.isArray(r) ? r[0] : null;
        const photo = normalizePhotoUrl(u?.PERSONAL_PHOTO) || normalizePhotoUrl(u?.UF_USR_...); // fallback (se existir)
        if(photo){
          state.userPhotos[String(id)] = photo;
          if(CONFIG.PARTNERS.map(String).includes(String(id))) state.partnerPhotos[String(id)] = photo;
        }
      }catch(_){}
      await sleep(60);
    }
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
            <div class="cgdPill" id="pillDay">Leads do dia: 0</div>
            <div class="cgdPill" id="pillMonth">Leads do mês: 0</div>
            <button class="cgdBtn" id="btnGet">GET (Equipes)</button>
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
              <div style="width:100%">
                <div class="hTitle">QUEM PEGOU HOJE</div>
                <div class="hSub">Ordenação: última que puxou → fila → fora da fila</div>
              </div>
              <div class="hActions">
                <button class="cgdBtn" id="btnHideUsers">Ocultar usuárias</button>
                <button class="cgdBtn" id="btnRefreshWho">Atualizar</button>
              </div>
            </div>
            <div class="cgdList cgdWhoGrid" id="listWho">
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>
        </div>

        <!-- ✅ Barra inferior em 3 linhas (com créditos + fotos sócios) -->
        <div class="cgdBottom">
          <div class="cgdQueueRow">
            <div class="cgdQueueRowLeft" id="queueRowLeft">
              <button class="cgdBtn" id="btnQueue">Fila de atendimento</button>
              <div class="cgdQueueChip" id="queueHint">Fila vazia. Clique em Fila e selecione quem entra.</div>
            </div>
            <div class="cgdQueueRowRight" id="queueRowRight"></div>
          </div>

          <div class="cgdQueueRow" style="justify-content:flex-start">
            <button class="cgdBtn" id="btnQueueReset">Resetar</button>
            <button class="cgdBtn" id="btnNext">Próxima disponível</button>
            <div class="cgdQueueChip">Última: <b id="lastServed">—</b></div>
            <div class="cgdStatusLine" id="statusLine">Atualizado: —</div>
          </div>

          <div class="cgdQueueRow" style="justify-content:space-between">
            <div style="font-style:italic;font-weight:900;opacity:.75">System created by GRUPO CGD</div>
            <div style="display:flex; gap:8px; align-items:center" id="partnersBar"></div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================
  // LEADS: fetch / actions
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
    const items = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: ["ID"]
    }, 2000);
    return (items||[]).length;
  }

  async function fetchStats(){
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    const dayItems = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO, ">DATE_MODIFY": startToday },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 2000);

    const monthItems = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO, ">DATE_MODIFY": startMonth },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 4000);

    return { day: (dayItems||[]).length, month: (monthItems||[]).length };
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

  function firstPhone(it){
    // tenta UF_TELEFONE, depois PHONE do bitrix
    const uf = pickUF(it, CONFIG.UF_TELEFONE);
    if(uf) return String(uf);
    const ph = it && it.PHONE;
    if(Array.isArray(ph) && ph[0] && ph[0].VALUE) return String(ph[0].VALUE);
    if(ph && ph.VALUE) return String(ph.VALUE);
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

    if(oper)  b.push(["OPERADORA", oper]);
    if(idade) b.push(["IDADE", idade]);
    if(firstPhone(it)) b.push(["TEL", firstPhone(it)]);
    if(bairro)b.push(["BAIRRO", bairro]);
    if(fonte) b.push(["FONTE", fonte]);
    if(dt)    b.push(["DATA", dt]);

    if(b.length < 2){
      if(it.SOURCE_ID) b.push(["FONTE", it.SOURCE_ID]);
      if(it.DATE_CREATE) b.push(["CRIADO", String(it.DATE_CREATE).replace("T"," ").slice(0,16)]);
    }
    return b.slice(0, 8);
  }

  async function leadUpdate(id, fields){
    return bx("crm.lead.update", { id: String(id), fields });
  }

  // =========================
  // Queue JSON via Pipeline 27 (multi-PC)
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

          // ✅ Realtime (todos os navegadores)
          realtimePublish("QUEUE_UPDATED");

          return;
        }catch(err){
          lastErr = err;
          await sleep(220 + attempt*420);
        }
      }
      throw lastErr || new Error("Falha ao salvar fila");
    });
  }

  function rotateToEnd(order, userId){
    const uid = String(userId);
    const arr = (order||[]).map(String).filter(Boolean);
    const idx = arr.indexOf(uid);
    if(idx >= 0) arr.splice(idx, 1);
    arr.push(uid);
    return arr;
  }

  // =========================
  // Render
  // =========================
  function renderPendingCount(n){
    state.pendingCount = n || 0;
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
    if(alert) alert.style.display = has ? "flex" : "none";

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
      const badges = leadBadgesRich(it).map(([k,v]) =>
        `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`
      ).join("");

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div class="cgdLeadName">${esc(title)}</div>
          <div style="font-weight:950; font-size:12px; opacity:.7">ID: ${esc(id)}</div>
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
    const queueSet = new Set((state.queue.order||[]).map(String));
    const hiddenSet = new Set((state.queue.hiddenUsers||[]).map(String));
    const visible = users.filter(u => !hiddenSet.has(String(u.id)));

    function lastTs(u){
      const h = state.userStats[u.id];
      const d = h?.lastTwo?.[0]?.DATE_MODIFY;
      if(!d) return 0;
      const t = Date.parse(String(d));
      return Number.isFinite(t) ? t : 0;
    }

    const inQueue = visible.filter(u => queueSet.has(String(u.id)));
    const outQueue = visible.filter(u => !queueSet.has(String(u.id)));

    inQueue.sort((a,b)=> lastTs(b)-lastTs(a));
    outQueue.sort((a,b)=> lastTs(b)-lastTs(a));

    return inQueue.concat(outQueue);
  }

  function avatarHTML(u){
    const id = String(u.id);
    const url = state.userPhotos[id];
    if(url){
      return `<img class="cgdAvatar" src="${esc(url)}" alt="${esc(u.name)}" />`;
    }
    return `<div class="cgdAvatarPH" aria-hidden="true">${esc(initials(u.name))}</div>`;
  }

  function renderWho(){
    const list = $("#listWho");
    if(!list) return;
    list.innerHTML = "";

    const ordered = computeUserOrder();

    ordered.forEach(u=>{
      const us = state.userStats[u.id] || { day:0, month:0, convertedMonth:0, convRate:0, lastTwo:[] };
      const l1 = us.lastTwo[0];
      const l2 = us.lastTwo[1];

      const last1 = l1 ? `Último: ${leadDisplayName(l1)}` : "Último: —";
      const last2 = l2 ? `Anterior: ${leadDisplayName(l2)}` : "Anterior: —";

      const conv = clamp(Number(us.convRate||0), 0, 100).toFixed(0) + "%";

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdUserCard">
          ${avatarHTML(u)}
          <div style="width:100%">
            <div class="cgdCardRow">
              <div style="font-weight:950">${esc(u.name)} <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></div>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
                <span class="cgdBadge">dia: ${esc(us.day||0)}</span>
                <span class="cgdBadge">mês: ${esc(us.month||0)}</span>
                <span class="cgdBadge">conv: ${esc(conv)}</span>
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

    if(ordered.length===0){
      const empty = document.createElement("div");
      empty.style.opacity=".75";
      empty.style.fontWeight="900";
      empty.textContent="Nenhuma usuária para mostrar (todas ocultas).";
      list.appendChild(empty);
    }
  }

  function renderQueue(){
    const left = $("#queueRowLeft");
    const hint = $("#queueHint");
    if(!left || !hint) return;

    // mantém o botão fila
    const keepBtn = $("#btnQueue");
    left.innerHTML = "";
    if(keepBtn) left.appendChild(keepBtn);

    const order = state.queue.order || [];
    if(order.length === 0){
      hint.textContent = "Fila vazia. Clique em Fila e selecione quem entra.";
      left.appendChild(hint);
      return;
    }

    hint.textContent = "";
    left.appendChild(hint);

    order.forEach((id, idx)=>{
      const u = CONFIG.USERS.find(x=> String(x.id)===String(id));
      const chip = document.createElement("div");
      chip.className = "cgdQueueChip";
      chip.innerHTML = `<b>${esc(u ? u.name : ("USER "+id))}</b> <span style="opacity:.65">#${idx+1}</span>`;
      left.appendChild(chip);
    });
  }

  function renderPartnersBar(){
    const bar = $("#partnersBar");
    if(!bar) return;
    bar.innerHTML = "";
    CONFIG.PARTNERS.forEach(pid=>{
      const url = state.partnerPhotos[String(pid)] || state.userPhotos[String(pid)] || "";
      if(url){
        const img = document.createElement("img");
        img.className = "cgdAvatar";
        img.src = url;
        img.alt = "Sócio";
        bar.appendChild(img);
      }else{
        const ph = document.createElement("div");
        ph.className = "cgdAvatarPH";
        ph.textContent = "CG";
        bar.appendChild(ph);
      }
    });
  }

  function setStatus(txt){
    const el = $("#statusLine");
    if(el) el.textContent = txt;
  }
  function setLastServed(name){
    state.lastServedUserName = name || "—";
    const el = $("#lastServed");
    if(el) el.textContent = state.lastServedUserName;
  }

  // =========================
  // User stats (dia/mês) conforme solicitado (5 etapas)
  // - SEM storage: calcula via Bitrix
  // =========================
  async function countByStatus(userId, statusId, sinceISO, max=4000){
    if(!statusId || String(statusId).includes("TROQUE_AQUI")) return 0;
    const items = await bxListAll("crm.lead.list", {
      filter: {
        "ASSIGNED_BY_ID": String(userId),
        "STATUS_ID": String(statusId),
        ">DATE_MODIFY": sinceISO
      },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, max);
    return (items||[]).length;
  }

  async function fetchUserStats(userId){
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    const statusesAll = [
      CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
      CONFIG.LEAD_STATUS.ATENDIDO,
      CONFIG.LEAD_STATUS.QUALIFICADO,
      CONFIG.LEAD_STATUS.PERDIDO,
      CONFIG.LEAD_STATUS.CONVERTIDO
    ];

    // dia/mês = soma das 5 etapas
    let day = 0, month = 0, convertedMonth = 0;
    for(const st of statusesAll){
      day += await countByStatus(userId, st, startToday, 2500);
      month += await countByStatus(userId, st, startMonth, 6000);
    }
    convertedMonth = await countByStatus(userId, CONFIG.LEAD_STATUS.CONVERTIDO, startMonth, 6000);

    const convRate = month > 0 ? (convertedMonth / month) * 100 : 0;

    // últimos leads para “Último/Anterior”
    const last = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_USER_LAST);

    const lastTwo = (last||[]).filter(x=>{
      const st = String(x.STATUS_ID||"");
      return st===CONFIG.LEAD_STATUS.EM_ATENDIMENTO || st===CONFIG.LEAD_STATUS.QUALIFICADO || st===CONFIG.LEAD_STATUS.CONVERTIDO;
    }).slice(0,2);

    return { day, month, convertedMonth, convRate, lastTwo, list: last || [] };
  }

  // =========================
  // Actions
  // =========================
  async function actionPickLead(leadId, userId, rotateQueue=true){
    // UI otimista (sai mais rápido de NOVO LEAD)
    state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(leadId));
    state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
    renderNewLeads(state.newLeadsRender);
    // puxa histórico da user mais rápido
    setTimeout(()=>{ refreshUsers(); }, 350);

    enqueueOp("pickLead", async ()=>{
      await leadUpdate(leadId, {
        ASSIGNED_BY_ID: String(userId),
        STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO
      });

      // ✅ se escolher uma USER, manda ela pro final da fila
      if(rotateQueue){
        try{
          const q = state.queue.dealId ? state.queue : await fetchQueue();
          const newOrder = rotateToEnd(q.order||[], userId);
          await saveQueue(q.dealId, { order: newOrder, hiddenUsers: q.hiddenUsers||[] });
          state.queue.order = newOrder;
        }catch(_){}
      }

      realtimePublish("LEADS_UPDATED");
      // (queue já publica dentro do saveQueue)
    });
    flushOps();
  }

  async function actionDiscardLead(leadId){
    state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(leadId));
    state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
    renderNewLeads(state.newLeadsRender);
    setTimeout(()=>{ refreshUsers(); }, 350);

    enqueueOp("discardLead", async ()=>{
      await leadUpdate(leadId, { STATUS_ID: CONFIG.LEAD_STATUS.PERDIDO });
      realtimePublish("LEADS_UPDATED");
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
      realtimePublish("LEADS_UPDATED");
    });
    flushOps();
  }

  async function actionSetPrazo(leadId, iso){
    enqueueOp("setPrazo", async ()=>{
      await leadUpdate(leadId, { [CONFIG.UF_PRAZO]: iso });
      realtimePublish("LEADS_UPDATED");
    });
    flushOps();
  }

  async function actionTransferLead(leadId, toUserId){
    enqueueOp("transferLead", async ()=>{
      await leadUpdate(leadId, { ASSIGNED_BY_ID: String(toUserId) });
      // manda pro final da fila
      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        const newOrder = rotateToEnd(q.order||[], toUserId);
        await saveQueue(q.dealId, { order: newOrder, hiddenUsers: q.hiddenUsers||[] });
        state.queue.order = newOrder;
      }catch(_){}
      realtimePublish("LEADS_UPDATED");
    });
    flushOps();
  }

  async function createFollowUpDeal(userId, lead, prazoIso){
    const stage = CONFIG.FOLLOWUP_DEALS.STAGE_BY_USER[String(userId)];
    const title = `FOLLOW-UP • ${leadDisplayName(lead)} • Lead #${lead.ID}`;

    enqueueOp("createDealFollowUp", async ()=>{
      const fields = {
        CATEGORY_ID: CONFIG.FOLLOWUP_DEALS.CATEGORY_ID,
        STAGE_ID: stage || "C17:NEW",
        ASSIGNED_BY_ID: String(userId),
        TITLE: title,
        COMMENTS: `Gerado pelo Painel de Leads • Referência: Lead #${lead.ID}`
      };
      if(prazoIso){
        fields[CONFIG.UF_PRAZO_DEAL] = prazoIso; // ✅ cria o card na pipeline com dia/hora
      }
      await bx("crm.deal.add", { fields });
    });
    flushOps();
  }

  // =========================
  // Modals
  // =========================
  function modalGetEquipes(){
    const body = `
      <div style="font-weight:950; margin-bottom:10px">GET (Equipes)</div>
      <div class="cgdRow" style="margin-bottom:12px">
        <a class="cgdBtn" href="${esc(CONFIG.GET_EQUIPES_URL)}" target="_blank" rel="noopener">Abrir Equipes</a>
      </div>
      <div style="font-size:11px;font-weight:900;opacity:.75">Abre em nova guia.</div>
    `;
    openModal("GET (Equipes)", body);
  }

  function usersOrderedForQueueModal(q){
    // ✅ mostra primeiro quem está na fila, na ordem da fila; depois o resto
    const inOrder = (q.order||[]).map(String);
    const set = new Set(inOrder);
    const queueUsers = inOrder
      .map(id => CONFIG.USERS.find(u=>String(u.id)===String(id)))
      .filter(Boolean);
    const others = CONFIG.USERS.filter(u => !set.has(String(u.id)));
    return queueUsers.concat(others);
  }

  async function modalQueue(){
    openModal("FILA DE ATENDIMENTO", `<div style="font-weight:900;opacity:.75">Carregando fila…</div>`);
    let q;
    try{
      q = await fetchQueue();
    }catch(_){
      closeModal();
      return openModal("FILA DE ATENDIMENTO", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    state.queue = { ...state.queue, ...q };
    const current = q.order || [];
    const currentSet = new Set(current.map(String));

    function rowFor(u){
      const checked = currentSet.has(String(u.id)) ? "checked" : "";
      return `<tr data-u="${esc(u.id)}">
        <td style="width:90px"><input type="checkbox" data-q-user="${esc(u.id)}" ${checked} /></td>
        <td>
          <b>${esc(u.name)}</b> <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span>
          <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap">
            <button class="cgdBtn" data-up="${esc(u.id)}">↑</button>
            <button class="cgdBtn" data-down="${esc(u.id)}">↓</button>
          </div>
        </td>
      </tr>`;
    }

    const body = `
      <div style="font-weight:950; margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="qAll">Selecionar todas</button>
        <button class="cgdBtn" id="qNone">Limpar</button>
        <button class="cgdBtn" id="qApply">Aplicar alterações</button>
      </div>

      <div style="font-weight:900;opacity:.75;margin:6px 0 10px">
        Dica: use ↑ ↓ para ordenar. A ordem salva em todos os navegadores.
      </div>

      <table class="cgdTable">
        <thead><tr><th>Na fila</th><th>Usuária</th></tr></thead>
        <tbody id="qTbody">${usersOrderedForQueueModal(q).map(rowFor).join("")}</tbody>
      </table>
    `;

    openModal("FILA DE ATENDIMENTO", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`);

    const tbody = $("#qTbody");
    const getChecked = ()=> $$('input[type=checkbox][data-q-user]', tbody)
      .filter(ch=>ch.checked)
      .map(ch=> String(ch.getAttribute("data-q-user")));

    function moveInTable(userId, dir){
      const sel = `tr[data-u="${CSS.escape(String(userId))}"]`;
      const tr = tbody.querySelector(sel);
      if(!tr) return;
      if(dir==="up" && tr.previousElementSibling){
        tbody.insertBefore(tr, tr.previousElementSibling);
      }
      if(dir==="down" && tr.nextElementSibling){
        tbody.insertBefore(tr.nextElementSibling, tr);
      }
    }

    tbody.addEventListener("click", (e)=>{
      const up = e.target.closest("[data-up]");
      const dn = e.target.closest("[data-down]");
      if(up) moveInTable(up.getAttribute("data-up"), "up");
      if(dn) moveInTable(dn.getAttribute("data-down"), "down");
    });

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

        const visualOrder = $$("tr[data-u]", tbody).map(tr=> String(tr.getAttribute("data-u")));
        const checked = new Set(getChecked());
        const next = visualOrder.filter(id=> checked.has(id));

        await saveQueue(q.dealId, { order: next, hiddenUsers: q.hiddenUsers||[] });

        const fresh = await fetchQueue();
        state.queue = { ...state.queue, ...fresh };
        renderQueue();
        renderWho();
        setStatus(`Atualizado: ${nowBRTime()}`);
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalHideUsers(){
    openModal("OCULTAR USUÁRIAS", `<div style="font-weight:900;opacity:.75">Carregando…</div>`);
    let q;
    try{
      q = await fetchQueue();
    }catch(_){
      closeModal();
      return openModal("OCULTAR USUÁRIAS", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

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
              <td><b>${esc(u.name)}</b> <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></td>
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
        renderQueue();
        renderWho();
        setStatus(`Atualizado: ${nowBRTime()}`);
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalPickLead(leadId){
    const uops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");
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
        Ao confirmar: muda responsável, envia para <b>EM ATENDIMENTO</b> e coloca a usuária no final da fila.
      </div>
    `;
    openModal("PEGAR LEAD", body, `<button class="cgdBtn" data-close-modal>Cancelar</button>`);

    $("#pickFirst")?.addEventListener("click", async ()=>{
      const btn = $("#pickFirst");
      try{
        btn.disabled = true;

        const q = state.queue.dealId ? state.queue : await fetchQueue();
        const order = (q.order||[]).slice();
        if(order.length === 0) return;

        const firstId = order.shift();
        order.push(firstId);

        // UI imediata
        state.queue.order = order.slice();
        renderQueue();
        setLastServed((CONFIG.USERS.find(x=>String(x.id)===String(firstId))||{}).name || ("USER "+firstId));
        setStatus(`Próxima: ${state.lastServedUserName} • ${nowBRTime()}`);

        enqueueOp("saveQueueRotate", async ()=>{
          await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
        });
        flushOps();

        await actionPickLead(leadId, firstId, false); // já rotacionou fila acima
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
        await actionPickLead(leadId, uid, true); // ✅ manda usuário pro final da fila
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

    const opsUser = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    function uniq(arr){
      const s = new Set(arr.filter(Boolean).map(String));
      return Array.from(s).sort((a,b)=> String(a).localeCompare(String(b)));
    }

    const operadoras = uniq(all.map(it=> pickUF(it, CONFIG.UF_OPERADORA)));
    const opsOper = [`<option value="ALL">Todas</option>`].concat(
      operadoras.map(o=> `<option value="${esc(o)}">${esc(o)}</option>`)
    ).join("");

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Operadora:</label>
        <select class="cgdSelect" id="btOper">${opsOper}</select>

        <label style="font-weight:950">Data do Lead:</label>
        <input class="cgdInput" type="date" id="btDate" />

        <label style="font-weight:950">Transferir para:</label>
        <select class="cgdSelect" id="btUser">${opsUser}</select>

        <button class="cgdBtn" id="btApply">Aplicar filtro</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Leads listados: <b id="btCount">0</b></div>
        <div class="cgdBadge">Pendentes total: <b>${esc(state.pendingCount||all.length)}</b></div>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:80px">Sel.</th>
            <th>Lead</th>
            <th style="width:280px">Info</th>
          </tr>
        </thead>
        <tbody id="btTbody"></tbody>
      </table>
    `;

    openModal("TRANSFERIR EM LOTE", body, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
      <button class="cgdBtn" id="btDo">Transferir selecionados</button>
    `);

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
        const info = leadBadgesRich(it);
        const infoHtml = info.map(([k,v])=> `<div style="font-weight:900;opacity:.85">${esc(k)}: ${esc(v)}</div>`).join("");
        return `
          <tr>
            <td><input type="checkbox" data-bt-id="${esc(it.ID)}" checked /></td>
            <td>
              <b>${esc(leadDisplayName(it))}</b>
              <div style="opacity:.7;font-weight:900;font-size:11px">ID: ${esc(it.ID)} • STATUS: ${esc(it.STATUS_ID||"—")}</div>
            </td>
            <td>${infoHtml}</td>
          </tr>
        `;
      }).join("") : `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    draw(filtered());

    $("#btApply")?.addEventListener("click", ()=> draw(filtered()));

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

  function leadDetailsHTML(it){
    const oper = pickUF(it, CONFIG.UF_OPERADORA);
    const idade = pickUF(it, CONFIG.UF_IDADE);
    const tel = firstPhone(it);
    const bairro= pickUF(it, CONFIG.UF_BAIRRO);
    const fonte = pickUF(it, CONFIG.UF_FONTE);
    const dtuf  = pickUF(it, CONFIG.UF_DT_LEAD);
    const dt = dtuf ? fmtDateBRFromISO(dtuf) : "";

    const rows = [
      ["OPERADORA", oper],
      ["IDADE", idade],
      ["TELEFONE", tel],
      ["BAIRRO", bairro],
      ["LEAD FONTE", fonte],
      ["DATA/HORA DO LEAD", dt],
      ["STAGE", String(it.STATUS_ID||"")],
      ["MODIFICADO", String(it.DATE_MODIFY||"").replace("T"," ").slice(0,19)],
    ].filter(r => r[1]);

    return `
      <table class="cgdTable">
        <thead><tr><th style="width:220px">Campo</th><th>Valor</th></tr></thead>
        <tbody>
          ${rows.map(([k,v])=> `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  async function modalManageUser(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    openModal(`ABRIR • ${u.name} (${u.id})`, `
      <div style="font-weight:950;margin-bottom:10px">Carregando leads…</div>
      <div style="opacity:.75;font-weight:900">Isso pode levar alguns segundos dependendo da conexão.</div>
    `);

    let us;
    try{
      us = await fetchUserStats(u.id);
    }catch(_){
      closeModal();
      return openModal(`ABRIR • ${u.name}`, `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    state.userStats[u.id] = us;
    renderWho();

    const body = `
      <div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:950">ABRIR • Buscar • Dados • Transferir • Follow-up</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Leads do dia (5 etapas): <b>${esc(us.day||0)}</b></div>
        <div class="cgdBadge">Leads do mês (5 etapas): <b>${esc(us.month||0)}</b></div>
        <div class="cgdBadge">Convertidos no mês: <b>${esc(us.convertedMonth||0)}</b></div>
        <div class="cgdBadge">Taxa conversão: <b>${esc((clamp(us.convRate||0,0,100)).toFixed(0))}%</b></div>
      </div>

      <div class="cgdRow" style="margin-bottom:12px">
        <input class="cgdInput" id="muSearch" placeholder="Buscar por palavra-chave…" style="min-width:260px" />
        <select class="cgdSelect" id="muStage">
          <option value="ALL">Todos os stages</option>
          <option value="${esc(CONFIG.LEAD_STATUS.EM_ATENDIMENTO)}">Em atendimento</option>
          <option value="${esc(CONFIG.LEAD_STATUS.ATENDIDO)}">Atendido</option>
          <option value="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">Qualificado</option>
          <option value="${esc(CONFIG.LEAD_STATUS.PERDIDO)}">Perdido</option>
          <option value="${esc(CONFIG.LEAD_STATUS.CONVERTIDO)}">Convertido</option>
        </select>
        <button class="cgdBtn" id="muAll">Marcar todos</button>
        <button class="cgdBtn" id="muNone">Desmarcar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:12px">
        <input class="cgdInput" type="datetime-local" id="muBulkDate" />
        <button class="cgdBtn" id="muBulkPrazo">FOLLOW-UP em lote</button>

        <select class="cgdSelect" id="muMoveTo">
          <option value="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">Mover p/ QUALIFICADO (🔥)</option>
          <option value="${esc(CONFIG.LEAD_STATUS.PERDIDO)}">Mover p/ PERDIDO</option>
          <option value="${esc(CONFIG.LEAD_STATUS.CONVERTIDO)}">Mover p/ CONVERTIDO</option>
        </select>
        <button class="cgdBtn" id="muBulkMove">Mover em lote</button>

        <button class="cgdBtn" id="muCreate">Criar lead (indicação)</button>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:70px">Sel.</th>
            <th>Lead</th>
            <th style="width:320px">Dados + FOLLOW-UP</th>
            <th style="width:320px">Mover / Transferir</th>
          </tr>
        </thead>
        <tbody id="muTbody"></tbody>
      </table>
    `;

    openModal(`ABRIR • ${u.name} (${u.id})`, body);

    const tbody = $("#muTbody");
    const search = $("#muSearch");
    const stageSel = $("#muStage");
    const allUsersOps = CONFIG.USERS.map(x=> `<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.id)})</option>`).join("");

    function listFiltered(){
      const q = (search.value||"").trim().toLowerCase();
      const st = (stageSel.value||"ALL");
      return (us.list||[]).filter(it=>{
        const title = leadDisplayName(it).toLowerCase();
        const rawT = String(it.TITLE||"").toLowerCase();
        if(q && !(title.includes(q) || rawT.includes(q))) return false;
        if(st!=="ALL" && String(it.STATUS_ID)!==String(st)) return false;
        return true;
      });
    }

    function renderRows(){
      const list = listFiltered();
      tbody.innerHTML = list.length ? list.map(it=>{
        const id = String(it.ID);
        const name = leadDisplayName(it);
        const st = String(it.STATUS_ID||"—");
        const dm = (it.DATE_MODIFY||"").replace("T"," ").slice(0,19);
        const hot = String(it.TITLE||"").trim().startsWith(CONFIG.HOT_EMOJI) ? CONFIG.HOT_EMOJI+" " : "";
        return `<tr>
          <td><input type="checkbox" data-sel="${esc(id)}" /></td>
          <td>
            <b>${esc(hot + name)}</b>
            <div style="opacity:.7;font-weight:900;font-size:11px">ID: ${esc(id)} • ${esc(dm||"—")} • STAGE: ${esc(st)}</div>
          </td>
          <td>
            ${leadDetailsHTML(it)}
            <div style="height:8px"></div>
            <div class="cgdRow">
              <input class="cgdInput" type="datetime-local" data-prazo="${esc(id)}" />
              <button class="cgdBtn" data-save-prazo="${esc(id)}">Salvar</button>
              <button class="cgdBtn" data-save-fupdeal="${esc(id)}">Salvar + Criar CARD</button>
            </div>
          </td>
          <td>
            <div class="cgdRow" style="margin-bottom:10px">
              <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">Qualificado</button>
              <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.PERDIDO)}">Perdido</button>
              <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.CONVERTIDO)}">Convertido</button>
            </div>

            <div style="font-weight:950; margin-bottom:6px">Transferir para outra usuária:</div>
            <div class="cgdRow">
              <select class="cgdSelect" data-xfer-user="${esc(id)}">${allUsersOps}</select>
              <button class="cgdBtn" data-xfer-go="${esc(id)}">Transferir</button>
            </div>
          </td>
        </tr>`;
      }).join("") : `<tr><td colspan="4" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    renderRows();

    $("#muRefresh")?.addEventListener("click", async ()=>{
      closeModal();
      await modalManageUser(userId);
    });

    search?.addEventListener("input", renderRows);
    stageSel?.addEventListener("change", renderRows);

    $("#muAll")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-sel]').forEach(ch=> ch.checked = true);
    });
    $("#muNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-sel]').forEach(ch=> ch.checked = false);
    });

    function selectedIds(){
      return $$('input[type=checkbox][data-sel]')
        .filter(ch=> ch.checked)
        .map(ch=> ch.getAttribute("data-sel"));
    }

    $("#muBulkPrazo")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const iso = isoFromLocalInput($("#muBulkDate")?.value || "");
      if(!iso) return alert("Preencha a data/hora do FOLLOW-UP.");
      for(const id of ids){
        await actionSetPrazo(id, iso);
        await sleep(60);
      }
      alert("FOLLOW-UP em lote enfileirado ✅ (sincroniza quando a conexão normalizar)");
    });

    $("#muBulkMove")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const to = $("#muMoveTo")?.value;
      for(const id of ids){
        await actionMoveLead(id, to);
        await sleep(60);
      }
      alert("Movimento em lote enfileirado ✅ (sincroniza quando a conexão normalizar)");
    });

    $("#muCreate")?.addEventListener("click", ()=>{
      const b = `
        <div style="font-weight:950;margin-bottom:10px">Criar LEAD (indicação)</div>
        <div class="cgdRow" style="margin-bottom:10px">
          <input class="cgdInput" id="clName" placeholder="Nome do cliente" style="min-width:260px" />
          <input class="cgdInput" id="clPhone" placeholder="Telefone" style="min-width:220px" />
        </div>
        <div class="cgdRow" style="margin-bottom:10px">
          <input class="cgdInput" id="clOper" placeholder="Operadora" style="min-width:220px" />
          <input class="cgdInput" id="clBairro" placeholder="Bairro" style="min-width:220px" />
          <input class="cgdInput" id="clIdade" placeholder="Idade" style="min-width:120px" />
        </div>
        <div style="font-size:11px;font-weight:900;opacity:.75">
          Será criado em <b>QUALIFICADO</b> e responsável será <b>${esc(u.name)}</b>.
        </div>
      `;
      openModal("CRIAR LEAD", b, `
        <button class="cgdBtn" data-close-modal>Cancelar</button>
        <button class="cgdBtn" id="clGo">Criar</button>
      `);

      $("#clGo")?.addEventListener("click", async ()=>{
        const btn = $("#clGo");
        try{
          btn.disabled = true;
          const name = ($("#clName").value||"").trim();
          if(!name) return alert("Preencha o nome.");
          const phone = ($("#clPhone").value||"").trim();
          const oper = ($("#clOper").value||"").trim();
          const bairro=($("#clBairro").value||"").trim();
          const idade = ($("#clIdade").value||"").trim();

          enqueueOp("createLeadInd", async ()=>{
            await bx("crm.lead.add", {
              fields: {
                TITLE: name,
                NAME: name,
                STATUS_ID: CONFIG.LEAD_STATUS.QUALIFICADO,
                ASSIGNED_BY_ID: String(u.id),
                [CONFIG.UF_OPERADORA]: oper,
                [CONFIG.UF_BAIRRO]: bairro,
                [CONFIG.UF_IDADE]: idade,
                PHONE: phone ? [{ VALUE: phone, VALUE_TYPE: "WORK" }] : undefined
              }
            });
            realtimePublish("LEADS_UPDATED");
          });
          flushOps();
          closeModal();
          alert("Lead criado ✅ (sincroniza quando normalizar a conexão)");
        } finally{
          btn.disabled = false;
        }
      });
    });

    // delegação de ações
    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const sp = e.target.closest("[data-save-prazo]");
      const sd = e.target.closest("[data-save-fupdeal]");
      const mv = e.target.closest("[data-move]");
      const xf = e.target.closest("[data-xfer-go]");

      if(sp){
        const leadId = sp.getAttribute("data-save-prazo");
        const inp = $(`input[data-prazo="${CSS.escape(String(leadId))}"]`, $(".cgdModalBody"));
        const iso = isoFromLocalInput(inp?.value || "");
        if(!iso) return alert("Preencha data/hora corretamente.");
        await actionSetPrazo(leadId, iso);
        alert("FOLLOW-UP salvo ✅ (sincroniza quando normalizar a conexão)");
      }

      if(sd){
        const leadId = sd.getAttribute("data-save-fupdeal");
        const lead = (us.list||[]).find(x=> String(x.ID)===String(leadId));
        const inp = $(`input[data-prazo="${CSS.escape(String(leadId))}"]`, $(".cgdModalBody"));
        const iso = isoFromLocalInput(inp?.value || "");
        if(iso) await actionSetPrazo(leadId, iso);
        if(lead) await createFollowUpDeal(u.id, lead, iso); // ✅ cria card com dia/hora no campo
        alert("FOLLOW-UP + CARD enfileirados ✅ (sincroniza quando normalizar a conexão)");
      }

      if(mv){
        const leadId = mv.getAttribute("data-move");
        const to = mv.getAttribute("data-to");
        await actionMoveLead(leadId, to);
        alert("Movimento enfileirado ✅ (sincroniza quando normalizar a conexão)");
      }

      if(xf){
        const leadId = xf.getAttribute("data-xfer-go");
        const sel = $(`select[data-xfer-user="${CSS.escape(String(leadId))}"]`, $(".cgdModalBody"));
        const toUser = sel?.value;
        if(!toUser) return;
        await actionTransferLead(leadId, toUser);
        alert("Transferência enfileirada ✅ (sincroniza quando normalizar a conexão)");
      }
    });
  }

  // =========================
  // Refresh orchestration
  // =========================
  async function refreshNewLeads(){
    try{
      const items = await fetchNewLeadsAll();
      state.newLeadsAll = items || [];
      state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
      renderNewLeads(state.newLeadsRender);

      const newest = items && items[0] ? String(items[0].ID) : null;
      if(items.length > 0 && state.soundOn){
        if(newest && newest !== state.lastNewLeadId){
          state.lastNewLeadId = newest;
          tripleBeep();
        }
      }
    }catch(err){
      console.warn("new leads fetch failed", err);
    }
  }

  async function refreshPendingCount(){
    try{
      const n = await fetchNewLeadsCount();
      renderPendingCount(n);
    }catch(err){
      console.warn("pending count failed", err);
    }
  }

  async function refreshStats(){
    try{
      const s = await fetchStats();
      state.stats = s;
      renderStats(s);
    }catch(err){
      console.warn("stats failed", err);
    }
  }

  async function refreshUsers(){
    try{
      // fotos (usuárias + sócios)
      const ids = CONFIG.USERS.map(u=>u.id).concat(CONFIG.PARTNERS||[]);
      await fetchUserPhotos(ids);
      renderPartnersBar();

      const jobs = CONFIG.USERS.map(async u=>{
        const st = await fetchUserStats(u.id);
        state.userStats[u.id] = st;
      });
      await Promise.all(jobs);
      renderWho();
    }catch(err){
      console.warn("user stats failed", err);
    }
  }

  async function refreshQueue(){
    try{
      const q = await fetchQueue();
      state.queue = { ...state.queue, ...q };
      renderQueue();
      renderWho();
    }catch(err){
      console.warn("queue failed", err);
    }
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()})`);
    await Promise.allSettled([
      refreshNewLeads(),
      refreshPendingCount(),
      refreshStats(),
      refreshUsers(),
      refreshQueue()
    ]);
    setStatus(`Atualizado: ${nowBRTime()}`);
  }

  // =========================
  // Events
  // =========================
  function updateSoundUI(){
    $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;
    const so = $("#btnSoundOn");
    if(so) so.style.display = state.soundOn ? "none" : "inline-block";
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
      if((state.newLeadsAll||[]).length > 0) tripleBeep();
    });

    $("#btnRefresh")?.addEventListener("click", hardRefreshAll);
    $("#btnRefreshNew")?.addEventListener("click", refreshNewLeads);
    $("#btnRefreshWho")?.addEventListener("click", refreshUsers);

    $("#btnGet")?.addEventListener("click", modalGetEquipes);

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

    $("#btnQueue")?.addEventListener("click", modalQueue);
    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);
    $("#btnBatch")?.addEventListener("click", modalBatchTransfer);

    // ✅ Próxima disponível (UI imediata; salva em background; realtime)
    $("#btnNext")?.addEventListener("click", async ()=>{
      try{
        if(!state.queue.dealId){
          const q = await fetchQueue();
          state.queue = { ...state.queue, ...q };
        }
        const order = (state.queue.order||[]).slice();
        if(order.length===0) return;

        const nextId = order.shift();
        order.push(nextId);

        state.queue.order = order.slice();
        renderQueue();

        const nm = (CONFIG.USERS.find(x=>String(x.id)===String(nextId))||{}).name || ("USER "+nextId);
        setLastServed(nm);
        setStatus(`Próxima: ${nm} • ${nowBRTime()}`);

        const dealId = state.queue.dealId;
        const hidden = state.queue.hiddenUsers || [];
        enqueueOp("queueRotate", async ()=>{ await saveQueue(dealId, { order, hiddenUsers: hidden }); });
        flushOps();
      }catch(err){
        console.error(err);
      }
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        state.queue = { ...state.queue, ...q };
        state.queue.order = [];
        renderQueue();
        enqueueOp("queueReset", async ()=>{ await saveQueue(q.dealId, { order: [], hiddenUsers: q.hiddenUsers||[] }); });
        flushOps();
      }catch(err){
        console.error(err);
      }
    });

    // Delegação cards
    document.addEventListener("click", (e)=>{
      const g = e.target.closest("[data-grab]");
      const d = e.target.closest("[data-discard]");
      const ou = e.target.closest("[data-open-user]");

      if(g){
        const id = g.getAttribute("data-grab");
        modalPickLead(id);
      }
      if(d){
        const id = d.getAttribute("data-discard");
        actionDiscardLead(id);
      }
      if(ou){
        const uid = ou.getAttribute("data-open-user");
        modalManageUser(uid);
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
    updateSoundUI();

    // ✅ conecta realtime
    realtimeConnect();

    await hardRefreshAll();

    setInterval(refreshNewLeads, CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(refreshPendingCount, Math.max(9000, CONFIG.REFRESH_NEW_LEADS_MS*2));
    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);
    setInterval(refreshUsers, CONFIG.REFRESH_WHO_MS);

    setInterval(flushOps, 2500);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
