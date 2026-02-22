/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - SEM storage do navegador (NADA de localStorage/sessionStorage)
   - Fila multi-PC e ocultar usuárias via QUEUE_JSON (Deal em Pipeline 27 / Stage QUEUE_JSON)
   - Layout/estética base mantida + ajustes solicitados
*/
(function(){
  "use strict";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    // Campo UF usado no Follow-up (no LEAD)
    UF_PRAZO: "UF_CRM_1768175087",

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

    // Logo topo
    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=awjcg85eqrbi",

    // Links
    LINKS: {
      GET: "https://getcgdcorretora.bitrix24.site/tfequipes/",
      VENDAS: "https://cgdcorretorabase.bitrix24.site/vendas/"
    },

    // Refresh
    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 7000,
    REFRESH_QUEUE_MS: 2500,
    REFRESH_WHO_MS: 6000,

    // Limites
    LIMIT_NEW_RENDER: 30,
    LIMIT_BATCH_MAX:  600,
    LIMIT_USER_LAST:  120,

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

    // ✅ Status/Stages de LEADS (inclui ATENDIDO)
    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      ATENDIDO: "UC_JT9G60",
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

  const COUNT_STATUSES = [
    CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
    CONFIG.LEAD_STATUS.ATENDIDO,
    CONFIG.LEAD_STATUS.QUALIFICADO,
    CONFIG.LEAD_STATUS.PERDIDO,
    CONFIG.LEAD_STATUS.CONVERTIDO
  ];

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
    return `${dd}/${mm}/${yy}`;
  }

  async function withRetry(fn, tries=3, base=260){
    let last;
    for(let i=0;i<tries;i++){
      try{ return await fn(); }
      catch(e){ last=e; await sleep(base + i*420); }
    }
    throw last;
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

  async function bx(method, params={}, options={}){
    const timeoutMs = Math.max(6000, Number(options.timeoutMs || 14000));
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

/* Topo mais "preto agradável" + letras brancas */
.cgdTop{
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(26,26,26,.92);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.18);
  color: #fff;
}
.cgdTopLeft{ display:flex; align-items:center; gap:10px; min-width: 280px; }
.cgdLogo{
  width: 53px; height: 53px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.16);
  object-fit: cover;
  background: #111;
}
.cgdTitle{ font-weight: 950; letter-spacing:.2px; font-size: 13px; white-space: nowrap; color:#fff; }
.cgdTopRight{ display:flex; gap:8px; align-items:center; flex-wrap: wrap; justify-content: flex-end; }

.cgdPill{
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.10);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 900;
  color:#fff;
}
.cgdBtn{
  cursor:pointer;
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.12);
  color:#fff;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 950;
}
.cgdBtn:active{ transform: translateY(1px); }

.cgdInput, .cgdSelect{
  border: 1px solid rgba(255,255,255,.16);
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
  font-size: 12px;
  background: rgba(255,255,255,.10);
  color:#fff;
  outline:none;
}
.cgdInput::placeholder{ color: rgba(255,255,255,.72); }

.cgdGrid{
  margin-top: 12px;
  display:grid;
  grid-template-columns: 0.70fr 0.60fr; /* left menor + right menor (ajusta se quiser) */
  gap: 12px;
  padding-right: 220px; /* espaço para fila vertical */
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

/* Cabeçalho em 1 linha, menor */
.cgdColHead{
  padding: 8px 12px !important;
  background: rgba(255,255,255,.78);
  border-bottom: 1px solid var(--border);
  display:flex;
  align-items:center !important;
  justify-content: space-between;
  gap: 10px;
}
.cgdColHead .hTitle{
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.3px;
  text-transform: uppercase;
  line-height: 1.1 !important;
  white-space: nowrap !important;
  margin:0 !important;
}
.cgdColHead .hSub{ display:none !important; }
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
  color: rgba(18,26,40,.92);
}
.cgdBadge.oper{ border: 0 !important; }
.cgdOper-LEVE{ background:#ff8a00 !important; color:#111 !important; }
.cgdOper-PREVENT{ background:#111 !important; color:#fff !important; }
.cgdOper-MEDSENIOR{ background:#7ad000 !important; color:#111 !important; }
.cgdOper-AMIL{ background:#7fc6ff !important; color:#111 !important; }
.cgdOper-UNIMED{ background:#2f6b3c !important; color:#fff !important; }
.cgdOper-ALICE{ background:#ff6fb1 !important; color:#111 !important; }

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
  color: rgba(18,26,40,.92);
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
  color: rgba(18,26,40,.92);
}
.cgdAlertBox .txt{ font-weight: 950; font-size: 12px; line-height: 1.25; width: 100%; }
.cgdAlertBox .txt small{ display:block; margin-top: 4px; font-size: 11px; color: rgba(18,26,40,.70); font-weight: 900; }

/* Quem pegou hoje em 2 colunas */
#listWho.cgdWhoGrid{ display:grid !important; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 1100px){ #listWho.cgdWhoGrid{ grid-template-columns: 1fr; } }

/* Avatar da usuária (+30%) */
.cgdUserAvatar{
  width: 52px;
  height: 52px;
  border-radius: 14px;
  object-fit: cover;
  border: 1px solid rgba(0,0,0,.10);
  background: #fff;
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
  color: rgba(18,26,40,.92);
}
.cgdModalTitle{ font-weight: 950; font-size: 13px; }
.cgdModalBody{
  padding: 12px 14px;
  overflow: auto;
  min-height: 0;
  color: rgba(18,26,40,.92);
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

/* Rodapé institucional (preto + branco) */
.cgdBottom{
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 80;
  background: rgba(20,20,20,.92) !important;
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255,255,255,.12) !important;
  padding: 10px 12px;
  display:flex;
  justify-content: space-between;
  gap: 12px;
  color:#fff !important;
}
.cgdBottom .footCol{
  display:flex;
  flex-direction: column;
  gap: 3px;
  font-weight: 900;
  font-size: 11px;
  line-height: 1.2;
}
.cgdBottom .muted{ opacity:.85; font-weight: 900; }
.cgdBottom .title{ font-weight: 950; font-size: 12px; }

/* Fila vertical à direita */
.cgdQueuePanel{
  position: fixed;
  top: 90px;
  right: 12px;
  width: 200px;
  z-index: 70;
  border: 1px solid rgba(30,40,70,.12);
  border-radius: 18px;
  background: rgba(255,255,255,.72);
  box-shadow: var(--shadow);
  overflow:hidden;
}
.cgdQueuePanelHead{
  padding: 10px;
  display:flex;
  gap:8px;
  align-items:center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(30,40,70,.10);
  background: rgba(255,255,255,.78);
}
.cgdQueuePanelTitle{ font-weight: 950; font-size: 12px; }
.cgdQueuePanelBody{
  padding: 10px;
  display:flex;
  flex-direction: column;
  gap: 8px;
}
.cgdQueueItem{
  border: 1px solid rgba(30,40,70,.12);
  background: rgba(255,255,255,.92);
  border-radius: 14px;
  padding: 8px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 8px;
}
.cgdQueueName{ font-weight: 950; font-size: 12px; line-height: 1.15; }
.cgdQueueBtns{ display:flex; gap:6px; }
.cgdQueueArrow{
  cursor:pointer;
  border: 1px solid rgba(30,40,70,.14);
  background: rgba(255,255,255,.92);
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 950;
}
.cgdQueuePanelFoot{
  padding: 10px;
  border-top: 1px solid rgba(30,40,70,.10);
  display:flex;
  gap:8px;
  justify-content: space-between;
  flex-wrap: wrap;
  background: rgba(255,255,255,.78);
}
.cgdQueueHint{
  font-size: 11px;
  font-weight: 900;
  opacity:.75;
}
@media (max-width: 1100px){
  .cgdGrid{ grid-template-columns: 1fr; padding-right: 0; }
  .cgdQueuePanel{ position: static; width: auto; margin-top: 12px; }
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
    stats: { day:0, month:0 },        // geral
    userStats: {},                     // id -> { pulledToday, pulledMonth, lastTwo, list, totals: {inproc, atendido, qual, allActive} }
    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] },
    userPhotos: {},                    // id -> url
    lastServedUserName: "—"
  };

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

            <input class="cgdInput" id="topSearch" placeholder="Buscar..." style="width:220px" />
            <select class="cgdSelect" id="topSearchMode">
              <option value="ALL">Geral</option>
              <option value="USER">Por usuária</option>
            </select>
            <button class="cgdBtn" id="btnSearch">Buscar</button>

            <a class="cgdBtn" href="${esc(CONFIG.LINKS.GET)}" target="_blank" rel="noopener">GET</a>
            <a class="cgdBtn" href="${esc(CONFIG.LINKS.VENDAS)}" target="_blank" rel="noopener">VENDAS</a>

            <button class="cgdBtn" id="btnRefresh">Atualizar</button>
            <button class="cgdBtn" id="btnSound">Som: ON</button>
          </div>
        </div>

        <div class="cgdGrid">
          <section class="cgdCol" id="colNew">
            <div class="cgdColHead">
              <div style="width:100%">
                <div class="hTitle">NOVOS LEADS</div>
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
                <div class="hTitle">HISTÓRICO DE LEADS</div>
              </div>
              <div class="hActions">
                <button class="cgdBtn" id="btnHideUsers">Ocultar usuária</button>
                <button class="cgdBtn" id="btnRefreshWho">Atualizar</button>
              </div>
            </div>
            <div class="cgdList cgdWhoGrid" id="listWho">
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>
        </div>

        <!-- Fila lateral direita -->
        <aside class="cgdQueuePanel" id="queuePanel">
          <div class="cgdQueuePanelHead">
            <div class="cgdQueuePanelTitle">FILA</div>
            <button class="cgdBtn" id="btnQueueModal" style="padding:6px 10px">Abrir</button>
          </div>
          <div class="cgdQueuePanelBody" id="queueBody">
            <div class="cgdQueueHint" id="queueHint">Fila vazia.</div>
          </div>
          <div class="cgdQueuePanelFoot">
            <button class="cgdBtn" id="btnQueueWalk" style="padding:6px 10px">ANDAR FILA</button>
            <button class="cgdBtn" id="btnQueueReset" style="padding:6px 10px">RESETAR</button>
          </div>
        </aside>

        <!-- Rodapé institucional -->
        <div class="cgdBottom">
          <div class="footCol">
            <div class="title">CGD CORRETORA</div>
            <div class="muted">CNPJ 01.654.471/0001-86 • SUSEP 202031791</div>
          </div>
          <div class="footCol" style="text-align:right">
            <div class="title">CGD BARRA</div>
            <div class="muted">CNPJ 53.013.848/0001-11 • SUSEP 242158650</div>
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

    // Geral: soma de todos os leads modificados no período nas 5 etapas (não usa storage)
    const dayItems = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": COUNT_STATUSES, ">DATE_MODIFY": startToday },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 6000);

    const monthItems = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": COUNT_STATUSES, ">DATE_MODIFY": startMonth },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 12000);

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

  function operClass(op){
    const s = String(op||"").toUpperCase();
    if(s.includes("LEVE")) return "cgdOper-LEVE";
    if(s.includes("PREVENT")) return "cgdOper-PREVENT";
    if(s.includes("MEDSENIOR") || s.includes("MED SENIOR")) return "cgdOper-MEDSENIOR";
    if(s.includes("AMIL")) return "cgdOper-AMIL";
    if(s.includes("UNIMED")) return "cgdOper-UNIMED";
    if(s.includes("ALICE")) return "cgdOper-ALICE";
    return "";
  }

  function leadBadgesRich(it){
    const b = [];
    const oper = pickUF(it, CONFIG.UF_OPERADORA);
    const idade = pickUF(it, CONFIG.UF_IDADE);
    const bairro= pickUF(it, CONFIG.UF_BAIRRO);
    const fonte = pickUF(it, CONFIG.UF_FONTE);
    const tel   = pickUF(it, CONFIG.UF_TELEFONE);
    const dtuf  = pickUF(it, CONFIG.UF_DT_LEAD);
    const dt = dtuf ? fmtDateBRFromISO(dtuf) : "";

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

  async function actionPickLead(leadId, userId){
    // UI otimista
    state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(leadId));
    state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
    renderNewLeads(state.newLeadsRender);

    enqueueOp("pickLead", async ()=>{
      await leadUpdate(leadId, {
        ASSIGNED_BY_ID: String(userId),
        STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO
      });
    });
    flushOps();

    // puxa o histórico da usuária mais rápido (melhora percepção do item 15 que você tinha pedido antes)
    enqueueOp("refreshUserAfterPick", async ()=>{
      const st = await fetchUserStats(userId);
      state.userStats[userId] = st;
      renderWho();
    });
    flushOps();
  }

  async function actionDiscardLead(leadId){
    state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(leadId));
    state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
    renderNewLeads(state.newLeadsRender);

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

  async function actionSetPrazo(leadId, iso){
    enqueueOp("setPrazo", async ()=>{
      await leadUpdate(leadId, { [CONFIG.UF_PRAZO]: iso });
    });
    flushOps();
  }

  async function createFollowUpDeal(userId, lead){
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
          [CONFIG.UF_PRAZO]: pickUF(lead, CONFIG.UF_PRAZO) || undefined
        }
      });
    });
    flushOps();
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
          await sleep(220 + attempt*350);
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
          await sleep(240 + attempt*420);
        }
      }
      throw lastErr || new Error("Falha ao salvar fila");
    });
  }

  // =========================
  // USER PHOTOS (Bitrix profile)
  // =========================
  function normalizePhoto(v){
    if(!v) return "";
    if(typeof v === "string"){
      if(v.startsWith("http")) return v;
      return "";
    }
    if(typeof v === "object"){
      // Bitrix costuma devolver {id, showUrl, downloadData}
      if(v.showUrl && String(v.showUrl).startsWith("http")) return String(v.showUrl);
      if(v.urlShow && String(v.urlShow).startsWith("http")) return String(v.urlShow);
    }
    return "";
  }

  async function fetchUserPhoto(userId){
    // tenta formatos comuns
    try{
      const r1 = await bx("user.get", { ID: String(userId) });
      const u = Array.isArray(r1) ? r1[0] : (r1 && r1.result ? r1.result[0] : null);
      if(u){
        const p = normalizePhoto(u.PERSONAL_PHOTO) || normalizePhoto(u.personal_photo);
        if(p) return p;
      }
    }catch(_){}

    try{
      const r2 = await bx("user.get", { FILTER: { ID: String(userId) } });
      const u2 = Array.isArray(r2) ? r2[0] : null;
      if(u2){
        const p2 = normalizePhoto(u2.PERSONAL_PHOTO) || normalizePhoto(u2.personal_photo);
        if(p2) return p2;
      }
    }catch(_){}

    return "";
  }

  async function loadAllUserPhotos(){
    const ids = CONFIG.USERS.map(u=> u.id);
    await Promise.allSettled(ids.map(async (id)=>{
      const url = await fetchUserPhoto(id);
      if(url) state.userPhotos[String(id)] = url;
    }));
    renderWho();
    renderQueuePanel();
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

      const badges = leadBadgesRich(it).map(([k,v])=>{
        if(String(k).toUpperCase()==="OPERADORA"){
          const cls = operClass(v);
          return `<span class="cgdBadge oper ${esc(cls)}">${esc(k)}: ${esc(v)}</span>`;
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

  function renderWho(){
    const list = $("#listWho");
    if(!list) return;
    list.innerHTML = "";

    const ordered = computeUserOrder();
    ordered.forEach(u=>{
      const us = state.userStats[u.id] || { pulledToday:0, pulledMonth:0, lastTwo:[], totals:{} };
      const l1 = us.lastTwo[0];
      const l2 = us.lastTwo[1];

      const last1 = l1 ? `Último: ${leadDisplayName(l1)}` : "Último: —";
      const last2 = l2 ? `Anterior: ${leadDisplayName(l2)}` : "Anterior: —";

      const photo = state.userPhotos[String(u.id)] || "";
      const img = photo ? `<img class="cgdUserAvatar" src="${esc(photo)}" alt="${esc(u.name)}" />`
                        : `<div class="cgdUserAvatar" style="display:flex;align-items:center;justify-content:center;font-weight:950;opacity:.6">${esc(u.name.slice(0,1))}</div>`;

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div style="display:flex; gap:10px; align-items:flex-start">
            ${img}
            <div>
              <div style="font-weight:950">${esc(u.name)}</div>
              <div class="cgdBadges" style="margin-top:6px">
                <span class="cgdBadge">dia: ${esc(us.pulledToday||0)}</span>
                <span class="cgdBadge">mês: ${esc(us.pulledMonth||0)}</span>
              </div>
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
            <button class="cgdMiniBtn" data-open-user="${esc(u.id)}">Abrir</button>
          </div>
        </div>
        <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">${esc(last1)}</div>
        <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">${esc(last2)}</div>
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

  function renderQueuePanel(){
    const body = $("#queueBody");
    const hint = $("#queueHint");
    if(!body) return;

    body.innerHTML = "";
    const order = state.queue.order || [];

    if(order.length === 0){
      const h = document.createElement("div");
      h.className = "cgdQueueHint";
      h.id = "queueHint";
      h.textContent = "Fila vazia.";
      body.appendChild(h);
      return;
    }

    order.forEach((id, idx)=>{
      const u = CONFIG.USERS.find(x=> String(x.id)===String(id));
      const nm = u ? u.name : ("USER "+id);

      const item = document.createElement("div");
      item.className = "cgdQueueItem";
      item.innerHTML = `
        <div class="cgdQueueName">${esc(nm)}</div>
        <div class="cgdQueueBtns">
          <button class="cgdQueueArrow" data-q-up="${esc(id)}">↑</button>
          <button class="cgdQueueArrow" data-q-down="${esc(id)}">↓</button>
        </div>
      `;
      body.appendChild(item);
    });
  }

  function setStatus(txt){
    // status opcional (não exibimos mais em barra inferior), mas deixo para debug futuro
    const el = $("#statusLine");
    if(el) el.textContent = txt;
  }
  function setLastServed(name){
    state.lastServedUserName = name || "—";
  }

  // =========================
  // Fetch Usuárias (SEM storage)
  // =========================
  async function fetchUserStats(userId){
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    const pulledToday = await withRetry(()=> bxListAll("crm.lead.list", {
      filter: {
        "ASSIGNED_BY_ID": String(userId),
        "STATUS_ID": COUNT_STATUSES,
        ">DATE_MODIFY": startToday
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID"]
    }, 4000), 3);

    const pulledMonth = await withRetry(()=> bxListAll("crm.lead.list", {
      filter: {
        "ASSIGNED_BY_ID": String(userId),
        "STATUS_ID": COUNT_STATUSES,
        ">DATE_MODIFY": startMonth
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID"]
    }, 9000), 3);

    const last = await withRetry(()=> bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_USER_LAST), 3);

    const lastTwo = (last||[]).filter(x=>{
      const st = String(x.STATUS_ID||"");
      return st===CONFIG.LEAD_STATUS.EM_ATENDIMENTO || st===CONFIG.LEAD_STATUS.QUALIFICADO || st===CONFIG.LEAD_STATUS.ATENDIDO;
    }).slice(0,2);

    return {
      pulledToday: (pulledToday||[]).length,
      pulledMonth: (pulledMonth||[]).length,
      lastTwo,
      list: last || []
    };
  }

  // =========================
  // Modals
  // =========================
  async function modalSearch(){
    const q = ($("#topSearch")?.value || "").trim();
    if(!q) return;

    const mode = $("#topSearchMode")?.value || "ALL";

    let userId = "";
    if(mode === "USER"){
      const opts = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");
      openModal("Buscar por usuária", `
        <div class="cgdRow" style="margin-bottom:10px">
          <div style="font-weight:950">Usuária:</div>
          <select class="cgdSelect" id="srUser" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)">${opts}</select>
          <button class="cgdBtn" id="srGo">Buscar</button>
        </div>
        <div style="opacity:.75;font-weight:900">Palavra-chave: <b>${esc(q)}</b></div>
      `);

      $("#srGo")?.addEventListener("click", async ()=>{
        userId = $("#srUser")?.value || "";
        closeModal();
        await runSearch(q, userId);
      });
      return;
    }

    await runSearch(q, "");
  }

  async function runSearch(q, userId){
    openModal("BUSCA", `<div style="font-weight:900;opacity:.75">Buscando…</div>`);

    const baseFilter = {};
    if(userId) baseFilter["ASSIGNED_BY_ID"] = String(userId);

    const [a,b,c] = await Promise.allSettled([
      bxListAll("crm.lead.list", { filter:{...baseFilter, "%TITLE": q}, order:{DATE_MODIFY:"DESC"}, select: CONFIG.LEAD_SELECT }, 80),
      bxListAll("crm.lead.list", { filter:{...baseFilter, "%NAME": q},  order:{DATE_MODIFY:"DESC"}, select: CONFIG.LEAD_SELECT }, 80),
      bxListAll("crm.lead.list", { filter:{...baseFilter, "%LAST_NAME": q}, order:{DATE_MODIFY:"DESC"}, select: CONFIG.LEAD_SELECT }, 80),
    ]);

    const list = []
      .concat(a.status==="fulfilled"?a.value:[])
      .concat(b.status==="fulfilled"?b.value:[])
      .concat(c.status==="fulfilled"?c.value:[]);

    const seen = new Set();
    const uniq = list.filter(x=>{
      const id = String(x?.ID||"");
      if(!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Resultados: <b>${esc(uniq.length)}</b></div>
      <table class="cgdTable">
        <thead><tr><th>Lead</th><th style="width:180px">Stage</th><th style="width:180px">Responsável</th></tr></thead>
        <tbody>
          ${uniq.map(it=>{
            const nm = leadDisplayName(it);
            const st = String(it.STATUS_ID||"—");
            const asg = String(it.ASSIGNED_BY_ID||"—");
            return `<tr>
              <td><b>${esc(nm)}</b><div style="opacity:.7;font-weight:900;font-size:11px">${esc((it.DATE_MODIFY||"").replace("T"," ").slice(0,16))}</div></td>
              <td style="font-weight:900">${esc(st)}</td>
              <td style="font-weight:900">${esc(asg)}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nada encontrado.</td></tr>`}
        </tbody>
      </table>
    `;

    openModal("BUSCA", body);
  }

  async function modalQueue(){
    openModal("FILA", `<div style="font-weight:900;opacity:.75">Carregando fila…</div>`);
    let q;
    try{
      q = await fetchQueue();
    }catch(_){
      closeModal();
      return openModal("FILA", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    state.queue = { ...state.queue, ...q };
    const current = q.order || [];
    const currentSet = new Set(current.map(String));

    const body = `
      <div style="font-weight:950; margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="qAll">Selecionar todas</button>
        <button class="cgdBtn" id="qNone">Limpar</button>
        <button class="cgdBtn" id="qApply">Aplicar alterações</button>
      </div>

      <table class="cgdTable">
        <thead><tr><th style="width:90px">Na fila</th><th>Usuária</th></tr></thead>
        <tbody id="qTbody">
          ${CONFIG.USERS.map(u=>{
            const checked = currentSet.has(String(u.id)) ? "checked" : "";
            return `<tr data-u="${esc(u.id)}">
              <td><input type="checkbox" data-q-user="${esc(u.id)}" ${checked} /></td>
              <td>
                <b>${esc(u.name)}</b>
                <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap">
                  <button class="cgdBtn" data-up="${esc(u.id)}">↑</button>
                  <button class="cgdBtn" data-down="${esc(u.id)}">↓</button>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;

    openModal("FILA", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`);

    const tbody = $("#qTbody");
    const getChecked = ()=> $$('input[type=checkbox][data-q-user]', tbody)
      .filter(ch=>ch.checked)
      .map(ch=> String(ch.getAttribute("data-q-user")));

    function moveInTable(userId, dir){
      const tr = tbody.querySelector(`tr[data-u="${CSS.escape(String(userId))}"]`);
      if(!tr) return;
      if(dir==="up" && tr.previousElementSibling) tbody.insertBefore(tr, tr.previousElementSibling);
      if(dir==="down" && tr.nextElementSibling) tbody.insertBefore(tr.nextElementSibling, tr);
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
        renderQueuePanel();
        renderWho();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalHideUsers(){
    openModal("OCULTAR USUÁRIA", `<div style="font-weight:900;opacity:.75">Carregando…</div>`);
    let q;
    try{
      q = await fetchQueue();
    }catch(_){
      closeModal();
      return openModal("OCULTAR USUÁRIA", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    const hiddenSet = new Set((q.hiddenUsers||[]).map(String));

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Ocultar/mostrar cards (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="huNone">Mostrar todas</button>
        <button class="cgdBtn" id="huApply">Aplicar</button>
      </div>

      <table class="cgdTable">
        <thead><tr><th style="width:90px">Oculta</th><th>Usuária</th></tr></thead>
        <tbody>
          ${CONFIG.USERS.map(u=>{
            const checked = hiddenSet.has(String(u.id)) ? "checked" : "";
            return `<tr>
              <td><input type="checkbox" data-hu-user="${esc(u.id)}" ${checked} /></td>
              <td><b>${esc(u.name)}</b></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;

    openModal("OCULTAR USUÁRIA", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`);

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
        renderQueuePanel();
        renderWho();
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
        <select class="cgdSelect" id="pickUser" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)">${uops}</select>
        <button class="cgdBtn" id="pickGo">Confirmar</button>
      </div>
      <div style="font-size:11px;font-weight:900;opacity:.75;margin-top:10px">
        Ao confirmar: muda responsável e envia para <b>EM ATENDIMENTO</b>.
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
        renderQueuePanel();
        setLastServed((CONFIG.USERS.find(x=>String(x.id)===String(firstId))||{}).name || ("USER "+firstId));

        enqueueOp("saveQueueRotate", async ()=>{
          await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
        });
        flushOps();

        await actionPickLead(leadId, firstId);
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

        // regra: ao selecionar, manda a usuária pro fim da fila
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        let order = (q.order||[]).slice().filter(x=> String(x)!==String(uid));
        order.push(String(uid));
        state.queue.order = order.slice();
        renderQueuePanel();
        enqueueOp("saveQueuePushSelected", async ()=>{
          await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
        });
        flushOps();

        await actionPickLead(leadId, uid);
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
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Operadora:</label>
        <select class="cgdSelect" id="btOper" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)">${opsOper}</select>

        <label style="font-weight:950">Data do Lead:</label>
        <input class="cgdInput" type="date" id="btDate" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)" />

        <label style="font-weight:950">Transferir para:</label>
        <select class="cgdSelect" id="btUser" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)">${opsUser}</select>

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
            <th style="width:260px">Info</th>
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
              <div style="opacity:.7;font-weight:900;font-size:11px">STATUS: ${esc(it.STATUS_ID||"—")}</div>
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
          await actionPickLead(id, toId);
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

  async function modalOpenUser(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    openModal(`ABRIR • ${u.name}`, `
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
        <div style="font-weight:950">Leads • Buscar • Mover • Follow-up</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Leads do dia: <b>${esc(us.pulledToday||0)}</b></div>
        <div class="cgdBadge">Leads do mês: <b>${esc(us.pulledMonth||0)}</b></div>
      </div>

      <div class="cgdRow" style="margin-bottom:12px">
        <input class="cgdInput" id="muSearch" placeholder="Buscar por palavra-chave…" style="min-width:260px;color:#111;background:#fff;border-color:rgba(30,40,70,.18)" />
        <select class="cgdSelect" id="muStage" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)">
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
        <input class="cgdInput" type="datetime-local" id="muBulkDate" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)" />
        <button class="cgdBtn" id="muBulkPrazo">FOLLOW-UP em lote</button>

        <select class="cgdSelect" id="muMoveTo" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)">
          <option value="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">Mover p/ QUALIFICADO (🔥)</option>
          <option value="${esc(CONFIG.LEAD_STATUS.PERDIDO)}">Mover p/ PERDIDO</option>
          <option value="${esc(CONFIG.LEAD_STATUS.CONVERTIDO)}">Mover p/ CONVERTIDO</option>
          <option value="${esc(CONFIG.LEAD_STATUS.ATENDIDO)}">Mover p/ ATENDIDO</option>
        </select>
        <button class="cgdBtn" id="muBulkMove">Mover em lote</button>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:70px">Sel.</th>
            <th>Lead</th>
            <th style="width:280px">Dados</th>
            <th style="width:280px">FOLLOW-UP</th>
          </tr>
        </thead>
        <tbody id="muTbody"></tbody>
      </table>
    `;

    openModal(`ABRIR • ${u.name}`, body);

    const tbody = $("#muTbody");
    const search = $("#muSearch");
    const stageSel = $("#muStage");

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

        const oper = pickUF(it, CONFIG.UF_OPERADORA);
        const idade = pickUF(it, CONFIG.UF_IDADE);
        const tel = pickUF(it, CONFIG.UF_TELEFONE);
        const bairro = pickUF(it, CONFIG.UF_BAIRRO);
        const fonte = pickUF(it, CONFIG.UF_FONTE);
        const dtLead = pickUF(it, CONFIG.UF_DT_LEAD);

        return `<tr>
          <td><input type="checkbox" data-sel="${esc(id)}" /></td>
          <td>
            <b>${esc(hot + name)}</b>
            <div style="opacity:.7;font-weight:900;font-size:11px">STAGE: ${esc(st)} • ${esc(dm||"—")}</div>
          </td>
          <td>
            <div style="font-weight:900;opacity:.90">OPERADORA: ${esc(oper||"—")}</div>
            <div style="font-weight:900;opacity:.85">IDADE: ${esc(idade||"—")}</div>
            <div style="font-weight:900;opacity:.85">TELEFONE: ${esc(tel||"—")}</div>
            <div style="font-weight:900;opacity:.85">BAIRRO: ${esc(bairro||"—")}</div>
            <div style="font-weight:900;opacity:.85">FONTE: ${esc(fonte||"—")}</div>
            <div style="font-weight:900;opacity:.75">DATA/HORA LEAD: ${esc(dtLead||"—")}</div>
          </td>
          <td>
            <div class="cgdRow">
              <input class="cgdInput" type="datetime-local" data-prazo="${esc(id)}" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)" />
              <button class="cgdBtn" data-save-prazo="${esc(id)}">Salvar</button>
              <button class="cgdBtn" data-save-fupdeal="${esc(id)}">Salvar + Criar CARD</button>
            </div>
            <div class="cgdRow" style="margin-top:8px">
              <select class="cgdSelect" data-transfer="${esc(id)}" style="color:#111;background:#fff;border-color:rgba(30,40,70,.18)">
                ${CONFIG.USERS.map(u2=> `<option value="${esc(u2.id)}">${esc(u2.name)}</option>`).join("")}
              </select>
              <button class="cgdBtn" data-do-transfer="${esc(id)}">Transferir</button>
            </div>
          </td>
        </tr>`;
      }).join("") : `<tr><td colspan="4" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    renderRows();

    $("#muRefresh")?.addEventListener("click", async ()=>{
      closeModal();
      await modalOpenUser(userId);
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
      alert("FOLLOW-UP em lote enfileirado ✅");
    });

    $("#muBulkMove")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const to = $("#muMoveTo")?.value;
      for(const id of ids){
        await actionMoveLead(id, to);
        await sleep(60);
      }
      alert("Movimento em lote enfileirado ✅");
    });

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const sp = e.target.closest("[data-save-prazo]");
      const sd = e.target.closest("[data-save-fupdeal]");
      const tr = e.target.closest("[data-do-transfer]");

      if(sp){
        const leadId = sp.getAttribute("data-save-prazo");
        const inp = $(`input[data-prazo="${CSS.escape(String(leadId))}"]`, $(".cgdModalBody"));
        const iso = isoFromLocalInput(inp?.value || "");
        if(!iso) return alert("Preencha data/hora corretamente.");
        await actionSetPrazo(leadId, iso);
        alert("FOLLOW-UP salvo ✅");
      }

      if(sd){
        const leadId = sd.getAttribute("data-save-fupdeal");
        const lead = (us.list||[]).find(x=> String(x.ID)===String(leadId));
        const inp = $(`input[data-prazo="${CSS.escape(String(leadId))}"]`, $(".cgdModalBody"));
        const iso = isoFromLocalInput(inp?.value || "");
        if(iso) await actionSetPrazo(leadId, iso);
        if(lead) await createFollowUpDeal(u.id, lead);
        alert("FOLLOW-UP + CARD enfileirados ✅");
      }

      if(tr){
        const leadId = tr.getAttribute("data-do-transfer");
        const sel = $(`select[data-transfer="${CSS.escape(String(leadId))}"]`, $(".cgdModalBody"));
        const toUser = sel?.value;
        if(!toUser) return;

        enqueueOp("transferLead", async ()=>{
          await leadUpdate(leadId, { ASSIGNED_BY_ID: String(toUser) });
        });
        flushOps();
        alert("Transferência enfileirada ✅");
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
      renderQueuePanel();
      renderWho();
    }catch(err){
      console.warn("queue failed", err);
    }
  }

  async function hardRefreshAll(){
    await Promise.allSettled([
      refreshNewLeads(),
      refreshPendingCount(),
      refreshStats(),
      refreshUsers(),
      refreshQueue()
    ]);
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

    $("#btnSearch")?.addEventListener("click", modalSearch);
    $("#topSearch")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") modalSearch(); });

    $("#btnQueueModal")?.addEventListener("click", modalQueue);
    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);

    $("#btnBatch")?.addEventListener("click", modalBatchTransfer);

    // Andar fila (primeira -> final)
    $("#btnQueueWalk")?.addEventListener("click", async ()=>{
      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        let order = (q.order||[]).slice();
        if(order.length===0) return;
        const first = order.shift();
        order.push(first);
        state.queue.order = order.slice();
        renderQueuePanel();

        enqueueOp("queueWalk", async ()=>{ await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] }); });
        flushOps();
      }catch(err){ console.error(err); }
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        state.queue = { ...state.queue, ...q, order: [] };
        renderQueuePanel();
        enqueueOp("queueReset", async ()=>{ await saveQueue(q.dealId, { order: [], hiddenUsers: q.hiddenUsers||[] }); });
        flushOps();
      }catch(err){ console.error(err); }
    });

    // Setas na fila lateral
    document.addEventListener("click", async (e)=>{
      const up = e.target.closest("[data-q-up]");
      const dn = e.target.closest("[data-q-down]");
      if(!up && !dn) return;

      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        let order = (q.order||[]).slice();
        const id = String((up||dn).getAttribute(up ? "data-q-up" : "data-q-down"));
        const idx = order.findIndex(x=> String(x)===id);
        if(idx < 0) return;

        const swap = (a,b)=>{ const t=order[a]; order[a]=order[b]; order[b]=t; };
        if(up && idx>0) swap(idx, idx-1);
        if(dn && idx<order.length-1) swap(idx, idx+1);

        state.queue.order = order.slice();
        renderQueuePanel();

        enqueueOp("queueReorder", async ()=>{ await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] }); });
        flushOps();
      }catch(err){ console.error(err); }
    });

    // Delegação cards: pegar/descartar/abrir
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
        modalOpenUser(uid);
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

    await hardRefreshAll();
    loadAllUserPhotos();

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
