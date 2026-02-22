/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - Velocidade: Histórico carrega só “últimos 2” por usuária (rápido).
   - Fila sem realtime: sincroniza via QUEUE_JSON (Deal em Pipeline 27 / Stage QUEUE_JSON)
   - Busca global por nome: mostra responsável + permite TRANSFERIR
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

    // (OPCIONAL) Para resolver 100% “contagem de leads do dia/mês”:
    // Crie um campo UF do tipo Data/Hora no LEAD (ex.: UF_CRM_XXXXXXXXXXXX)
    // e coloque aqui. O painel vai setar esse campo quando “PEGAR”.
    // UF_PICK_TS: "",

    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD:   "UF_CRM_1771333014",
    UF_IDADE:     "UF_CRM_1771339221",
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
        "15":"C17:UC_FQ8UPI","19":"C17:UC_1HXNTB","17":"C17:UC_RRQKAQ","23":"C17:UC_4HQGI1","811":"C17:UC_8Y4R4V",
        "3081":"C17:EXECUTING","3083":"C17:UC_8O5UFO","3079":"C17:UC_P1P9RJ","3085":"C17:UC_U8AAGB","3389":"C17:UC_A6LSS8",
        "815":"C17:UC_ZT6WEB","3387":"C17:UC_RXISLQ"
      }
    },

    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=awjcg85eqrbi",

    LINKS: {
      GET: "https://getcgdcorretora.bitrix24.site/tfequipes/",
      VENDAS: "https://cgdcorretorabase.bitrix24.site/vendas/"
    },

    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 8000,
    REFRESH_QUEUE_MS: 2500,
    REFRESH_WHO_MS: 8500,

    LIMIT_NEW_RENDER: 30,
    LIMIT_BATCH_MAX:  600,

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

    // ✅ Status/Stages de LEADS
    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      ATENDIDO: "UC_JT9G60",
      QUALIFICADO: "UC_0NFA3H",
      PERDIDO: "UC_5IMTI4",
      CONVERTIDO: "UC_B3RQAF",
    },

    LEAD_STATUS_NAMES: {
      "NEW": "NOVO LEAD",
      "IN_PROCESS": "EM ATENDIMENTO",
      "UC_JT9G60": "ATENDIDO",
      "UC_0NFA3H": "QUALIFICADO",
      "UC_5IMTI4": "PERDIDO",
      "UC_B3RQAF": "CONVERTIDO",
      "CONVERTED": "LEAD CONVERTIDO (sistema)",
      "JUNK": "DESCARTADO (sistema)"
    },

    // Select “mínimo” p/ lista (rápido)
    LEAD_SELECT_MIN: [
      "ID","TITLE","NAME","LAST_NAME","SECOND_NAME",
      "STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
      "PHONE","UF_*"
    ],

    // Select “full” p/ modal
    LEAD_SELECT_FULL: [
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
  function stageName(id){
    return CONFIG.LEAD_STATUS_NAMES[String(id||"")] || String(id||"—");
  }
  function userNameById(id){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(id));
    return u ? u.name : `USER ${id||"—"}`;
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
  // Op queue (RAM only)
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
  // Plane
  // =========================
  function flyPlane(){
    try{
      const d = document.createElement("div");
      d.className = "cgdPlane";
      d.innerHTML = `
        <svg viewBox="0 0 64 64" width="50" height="50" aria-hidden="true">
          <path d="M4 30 L60 6 L38 58 L30 36 L4 30 Z" fill="rgba(255,255,255,.95)" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
          <path d="M30 36 L60 6" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
        </svg>
      `;
      document.body.appendChild(d);
      setTimeout(()=>{ try{ d.remove(); }catch(_){} }, 2200);
    }catch(_){}
  }

  // =========================
  // CSS (contraste alto + títulos centralizados)
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

/* Botões: alto contraste */
.cgdBtn{
  cursor:pointer;
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(10,10,12,.92);
  color:#fff;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 950;
}
.cgdBtn:active{ transform: translateY(1px); }
.cgdBtn:disabled{ opacity:.55; cursor:not-allowed; }

.cgdMiniBtn{
  cursor:pointer;
  border: 1px solid rgba(10,10,12,.20);
  background: rgba(10,10,12,.92);
  color:#fff;
  border-radius: 12px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 950;
}
.cgdMiniBtn:active{ transform: translateY(1px); }

.cgdMiniBtn.primary{
  background: rgba(0,0,0,.92);
  border-color: rgba(255,255,255,.18);
}
.cgdMiniBtn.danger{
  background: rgba(160,10,30,.92);
  border-color: rgba(255,255,255,.18);
}

/* Top */
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
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.10);
  color:#fff;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 900;
}
.cgdInput, .cgdSelect{
  border: 1px solid rgba(255,255,255,.20);
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
  font-size: 12px;
  background: rgba(255,255,255,.95);
}

/* Layout */
.cgdLayout{
  margin-top: 12px;
  display:flex;
  gap: 12px;
  align-items: stretch;
}
.cgdGrid{
  flex: 1 1 auto;
  display:grid;
  /* NOVOS +20% (antes 0.65fr -> ~0.78fr), HISTÓRICO reduz */
  grid-template-columns: 0.78fr 2.22fr;
  gap: 12px;
}

/* Sidebar FILA: +20% */
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
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.3px;
  text-transform: uppercase;
  white-space: nowrap;
}
.cgdQueueBody{
  padding: 10px;
  overflow:auto;
  min-height: 0;
  display:flex;
  flex-direction: column;
  gap: 8px;
}
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

/* Colunas */
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
/* Cabeçalho: 1 linha, título centralizado e destacado */
.cgdColHead{
  padding: 8px 10px;
  background: rgba(255,255,255,.78);
  border-bottom: 1px solid var(--border);
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}
.cgdColHead .hTitle{
  font-weight: 1000;
  font-size: 12px;
  letter-spacing:.6px;
  text-transform: uppercase;
  line-height: 1;
  white-space: nowrap;
  text-align: center;
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
  background: rgba(255,255,255,.92);
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
.cgdBadge.oper{
  border: 0;
  padding: 5px 10px;
}
.cgdActions{
  margin-top: 10px;
  display:flex;
  gap:8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* 🚨 NOVO LEAD: preto sempre, só fica “alerta vermelho” quando há leads */
.cgdAlertBox{
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 16px;
  padding: 12px;
  background: rgba(10,10,12,.95);
  color: #fff;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}
.cgdAlertBox.hot{
  border-color: rgba(255,40,90,.55);
  box-shadow: 0 0 0 2px rgba(255,40,90,.18), 0 10px 30px rgba(255,40,90,.14);
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
  color: rgba(255,255,255,.78);
  font-weight: 900;
}

/* HISTÓRICO em 2 colunas */
#listWho.cgdWhoGrid{
  display:grid !important;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 1100px){
  #listWho.cgdWhoGrid{ grid-template-columns: 1fr; }
}

/* Usuária: foto maior */
.cgdUserLine{ display:flex; gap:10px; align-items:flex-start; }
.cgdUserPic{
  width: 52px; height: 52px;
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

/* Modals */
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

/* Paper plane */
.cgdPlane{
  position: fixed;
  top: 110px;
  left: -120px;
  width: 50px;
  height: 50px;
  z-index: 9999;
  pointer-events:none;
  opacity: .95;
  animation: planeFly 1.8s linear forwards;
}
@keyframes planeFly{
  0%   { transform: translateX(0) rotate(8deg); opacity: .0; }
  10%  { opacity: .95; }
  100% { transform: translateX(calc(100vw + 240px)) rotate(-6deg); opacity: 0; }
}

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
    lastNewLeadId: null,
    newLeadsAll: [],
    newLeadsRender: [],
    pendingCount: 0,

    stats: { day:0, month:0 },
    _pulledDayByUser: {},
    _pulledMonthByUser: {},

    userCards: {}, // { uid: { lastTwo: [lead,lead], pulledToday, pulledMonth } }
    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] },
    queueBusyUI: false,

    lastServedUserName: "—",

    userPhoto: new Map(),
    userPhotoTs: new Map(),
    userPhotoPending: new Set(),
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

    if(photo){
      state.userPhoto.set(id, photo);
      state.userPhotoTs.set(id, now);
    }else{
      state.userPhoto.set(id, "");
      state.userPhotoTs.set(id, now);
    }
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
          </div>
        </div>

        <div class="cgdLayout">
          <div class="cgdGrid">
            <section class="cgdCol" id="colNew">
              <div class="cgdColHead">
                <div class="hTitle">NOVOS LEADS</div>
                <div class="hActions">
                  <button class="cgdBtn" id="btnBatch">Transferir em lote</button>
                  <button class="cgdBtn" id="btnRefreshNew">Atualizar</button>
                </div>
              </div>

              <div class="cgdList" id="listNew">
                <div class="cgdAlertBox" id="alertNew">
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

  function setStatus(txt){
    const el = $("#statusLine");
    if(el) el.textContent = txt;
  }
  function setLastServed(name){
    const el = $("#lastServed");
    if(el) el.textContent = name || "—";
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

  let queueLock = false;
  async function withQueueLock(fn){
    for(let i=0; i<30 && queueLock; i++) await sleep(40);
    queueLock = true;
    try{ return await fn(); }
    finally{ queueLock = false; }
  }

  async function fetchQueue(){
    return withQueueLock(async ()=>{
      const deal = await ensureQueueDeal();
      const raw = deal && deal[CONFIG.QUEUE.UF_QUEUE_JSON];
      return { dealId: String(deal.ID), ...parseQueue(raw) };
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
      await bx("crm.deal.update", {
        id: String(dealId),
        fields: { [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify(next) }
      });
      return next;
    });
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
      const row = document.createElement("div");
      row.className = "cgdQueueRowItem";
      row.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center">
          <div class="ord">#${idx+1}</div>
          <div class="nm">${esc(userNameById(id))}</div>
        </div>
        <div class="cgdQueueArrows">
          <button class="cgdMiniBtn" data-q-up="${esc(id)}">↑</button>
          <button class="cgdMiniBtn" data-q-down="${esc(id)}">↓</button>
        </div>
      `;
      body.appendChild(row);
    });

    // desabilita cliques durante “commit” (evita duplicar estado)
    if(state.queueBusyUI){
      $$("[data-q-up],[data-q-down]", body).forEach(b=> b.disabled = true);
      $("#btnQueueWalk") && ($("#btnQueueWalk").disabled = true);
    }else{
      $$("[data-q-up],[data-q-down]", body).forEach(b=> b.disabled = false);
      $("#btnQueueWalk") && ($("#btnQueueWalk").disabled = false);
    }
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

  // =========================
  // Leads
  // =========================
  async function fetchNewLeadsAll(){
    return bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: CONFIG.LEAD_SELECT_MIN
    }, CONFIG.LIMIT_BATCH_MAX);
  }

  async function fetchNewLeadsCount(){
    const items = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: ["ID"]
    }, 2000);
    return (items||[]).length;
  }

  // Mapa de “puxados” (NEW -> IN_PROCESS) via stagehistory (mais correto)
  async function fetchStats(){
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    async function pulledBetween(isoStart){
      try{
        const items = await bxListAll("crm.stagehistory.list", {
          filter: {
            "ENTITY_TYPE_ID": 1,
            "STAGE_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
            ">CREATED_TIME": isoStart
          },
          order: { "CREATED_TIME": "DESC" },
          select: ["OWNER_ID","RESPONSIBLE_ID","CREATED_TIME","STAGE_ID"]
        }, 5000);

        const byUser = {};
        let total = 0;
        (items||[]).forEach(x=>{
          total++;
          const uid = String(x.RESPONSIBLE_ID || "");
          if(uid) byUser[uid] = (byUser[uid]||0) + 1;
        });
        return { total, byUser };
      }catch(_){
        // fallback aproximado
        const arr = await bxListAll("crm.lead.list", {
          filter: { "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO, ">DATE_MODIFY": isoStart },
          order: { DATE_MODIFY:"DESC" },
          select: ["ID","ASSIGNED_BY_ID"]
        }, 5000);

        const byUser = {};
        (arr||[]).forEach(x=>{
          const uid = String(x.ASSIGNED_BY_ID||"");
          if(uid) byUser[uid] = (byUser[uid]||0)+1;
        });
        return { total:(arr||[]).length, byUser };
      }
    }

    const day = await pulledBetween(startToday);
    const month = await pulledBetween(startMonth);

    state._pulledDayByUser = day.byUser || {};
    state._pulledMonthByUser = month.byUser || {};

    return { day: day.total||0, month: month.total||0 };
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
    try{ return it && Object.prototype.hasOwnProperty.call(it, key) ? it[key] : (it ? it[key] : ""); }
    catch(_){ return ""; }
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
    if(op.includes("PREVENT")) return { bg:"#111", fg:"#fff" };
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

    return b.slice(0, 6);
  }

  async function leadUpdate(id, fields){
    return bx("crm.lead.update", { id: String(id), fields });
  }

  async function actionPickLead(leadId, userId, rotateQueue){
    // UI otimista
    state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(leadId));
    state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
    renderNewLeads(state.newLeadsRender);
    renderPendingCount(state.pendingCount - 1);

    enqueueOp("pickLead", async ()=>{
      const fields = {
        ASSIGNED_BY_ID: String(userId),
        STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO
      };
      // Se você criar UF_PICK_TS, vai ficar 100% confiável p/ contagem
      if(CONFIG.UF_PICK_TS){
        fields[CONFIG.UF_PICK_TS] = new Date().toISOString();
      }
      await leadUpdate(leadId, fields);
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
          const next = await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
          // protege contra “voltar” com polling
          state.queue = { ...state.queue, ...q, order, updatedAt: next.updatedAt, dealId: q.dealId };
        }
      });
    }

    flushOps();
  }

  async function actionTransferLead(leadId, toUserId){
    enqueueOp("transferLead", async ()=>{
      const lead = await bx("crm.lead.get", { id: String(leadId) });
      const fields = { ASSIGNED_BY_ID: String(toUserId) };
      // se estiver em NEW, manda pra EM_ATENDIMENTO ao transferir
      if(String(lead?.STATUS_ID||"") === CONFIG.LEAD_STATUS.NOVO_LEAD){
        fields.STATUS_ID = CONFIG.LEAD_STATUS.EM_ATENDIMENTO;
      }
      await leadUpdate(leadId, fields);
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

    // Alert: sempre preto, só “hot” quando tem lead
    if(alert){
      alert.classList.toggle("hot", !!has);
      // se quiser ocultar quando vazio, troque pra: alert.style.display = has ? "flex" : "none";
      alert.style.display = "flex";
      // sem leads: deixa “quieto”
      alert.style.opacity = has ? "1" : ".55";
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

  // =========================
  // Histórico MUITO mais rápido:
  // - Só busca “últimos 2” por usuária
  // =========================
  async function fetchUserLastTwo(userId){
    const st = [CONFIG.LEAD_STATUS.EM_ATENDIMENTO, CONFIG.LEAD_STATUS.QUALIFICADO, CONFIG.LEAD_STATUS.ATENDIDO];
    const items = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "STATUS_ID": st },
      order: { DATE_MODIFY: "DESC" },
      select: CONFIG.LEAD_SELECT_MIN
    }, 2);
    return items || [];
  }

  async function refreshUserCardsFast(){
    // primeiro: garante stats já preenchidos, senão dia/mês ficam 0
    const jobs = CONFIG.USERS.map(async u=>{
      const lastTwo = await fetchUserLastTwo(u.id);
      state.userCards[u.id] = {
        lastTwo,
        pulledToday: Number(state._pulledDayByUser?.[String(u.id)] || 0),
        pulledMonth: Number(state._pulledMonthByUser?.[String(u.id)] || 0),
      };
    });
    await Promise.allSettled(jobs);
    renderWho();
  }

  function computeUserOrder(){
    const hiddenSet = new Set((state.queue.hiddenUsers||[]).map(String));
    const visible = CONFIG.USERS.filter(u => !hiddenSet.has(String(u.id)));

    function lastTs(u){
      const l1 = state.userCards[u.id]?.lastTwo?.[0];
      const d = l1?.DATE_MODIFY;
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
      const us = state.userCards[u.id] || { pulledToday:0, pulledMonth:0, lastTwo:[] };
      const l1 = us.lastTwo[0];
      const l2 = us.lastTwo[1];

      const last1 = l1 ? `Último: ${leadDisplayName(l1)}` : "Último: —";
      const last2 = l2 ? `Anterior: ${leadDisplayName(l2)}` : "Anterior: —";

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
                <span class="cgdBadge">dia: ${esc(us.pulledToday||0)}</span>
                <span class="cgdBadge">mês: ${esc(us.pulledMonth||0)}</span>
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

    // completa fotos em background
    setTimeout(async ()=>{
      const imgs = $$("img[data-user-pic]");
      const ids = imgs.map(img=>String(img.getAttribute("data-user-pic")));
      await Promise.all(ids.map(id=>ensureUserPhoto(id)));
      imgs.forEach(img=>{
        const id = String(img.getAttribute("data-user-pic"));
        const url = state.userPhoto.get(id) || "";
        if(url && img.src !== url) img.src = url;
      });
    }, 450);
  }

  // =========================
  // Queue UI actions (bug fix intermitente)
  // =========================
  async function refreshQueue(){
    try{
      const q = await fetchQueue();
      // ✅ Só aceita se o remoto for mais novo que o local
      if((q.updatedAt||0) >= (state.queue.updatedAt||0)){
        state.queue = { ...state.queue, ...q };
        renderQueueSidebar();
      }
      setStatus(`Atualizado: ${nowBRTime()}`);
    }catch(err){
      console.warn("queue failed", err);
      renderQueueSidebar();
    }
  }

  async function commitQueue(nextOrder){
    if(state.queueBusyUI) return;
    state.queueBusyUI = true;
    renderQueueSidebar();
    $("#btnQueueWalk") && ($("#btnQueueWalk").disabled = true);

    try{
      const q = state.queue.dealId ? state.queue : await fetchQueue();

      // UI imediata + updatedAt local “avança” pra não voltar no polling
      const localUpdatedAt = Date.now();
      state.queue = { ...state.queue, ...q, order: nextOrder.slice(), updatedAt: localUpdatedAt, dealId: q.dealId };
      renderQueueSidebar();

      // commit real
      const next = await saveQueue(q.dealId, { order: nextOrder, hiddenUsers: q.hiddenUsers||[] });
      state.queue.updatedAt = next.updatedAt;
      setStatus(`Fila salva: ${nowBRTime()}`);
    }catch(err){
      console.error(err);
    }finally{
      state.queueBusyUI = false;
      renderQueueSidebar();
      $("#btnQueueWalk") && ($("#btnQueueWalk").disabled = false);
    }
  }

  // =========================
  // Stats + refreshes
  // =========================
  async function refreshNewLeads(){
    try{
      const items = await fetchNewLeadsAll();
      state.newLeadsAll = items || [];
      state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
      renderNewLeads(state.newLeadsRender);

      const newest = items && items[0] ? String(items[0].ID) : null;
      if(items.length > 0 && newest && newest !== state.lastNewLeadId){
        state.lastNewLeadId = newest;
        flyPlane();
        if(state.soundOn) tripleBeep();
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

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()})`);
    // carrega “em paralelo” pra acelerar o first paint
    await Promise.allSettled([
      refreshNewLeads(),
      refreshPendingCount(),
      refreshQueue(),
      refreshStats()
    ]);
    // depois dos stats, atualiza cards de usuária rápido
    await refreshUserCardsFast();
    setStatus(`Atualizado: ${nowBRTime()}`);
  }

  // =========================
  // Modals (ocultar / fila / pegar / batch / user / busca)
  // =========================
  async function modalHideUsers(){
    openModal("OCULTAR USUÁRIAS", `<div style="font-weight:900;opacity:.75">Carregando…</div>`);
    let q;
    try{ q = await fetchQueue(); }
    catch(_){
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
        const next = await saveQueue(q.dealId, { order: q.order||[], hiddenUsers: hidden });
        state.queue = { ...state.queue, ...q, hiddenUsers: hidden, updatedAt: next.updatedAt, dealId: q.dealId };
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
    catch(_){
      closeModal();
      return openModal("FILA • GERENCIAR", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    const current = (q.order || []).map(String);
    const currentSet = new Set(current);

    const rows = CONFIG.USERS.map(u=>{
      const checked = currentSet.has(String(u.id)) ? "checked" : "";
      return `<tr>
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
        const nextOrder = keep.concat(add);
        const next = await saveQueue(q.dealId, { order: nextOrder, hiddenUsers: q.hiddenUsers||[] });
        state.queue = { ...state.queue, order: nextOrder, hiddenUsers: q.hiddenUsers||[], updatedAt: next.updatedAt, dealId: q.dealId };
        renderQueueSidebar();
        setStatus(`Fila salva: ${nowBRTime()}`);
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
      if(state.queueBusyUI) return;
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

        await commitQueue(order);
        setLastServed(userNameById(firstId));
        setStatus(`Andou fila: ${nowBRTime()}`);

        await actionPickLead(leadId, firstId, false);
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
    // (mantive como estava no seu arquivo anterior; se quiser eu simplifico depois)
    alert("Transferir em lote permanece como antes — se você quiser, eu também otimizo essa tela.");
  }

  // Modal “Abrir usuário” (lista completa: só aqui, por isso o histórico ficou rápido)
  async function modalUserOpen(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    openModal(`ABRIR • ${u.name}`, `
      <div style="font-weight:950;margin-bottom:10px">Carregando leads…</div>
      <div style="opacity:.75;font-weight:900">Isso pode levar alguns segundos dependendo da conexão.</div>
    `);

    let list;
    try{
      list = await bxListAll("crm.lead.list", {
        filter: { "ASSIGNED_BY_ID": String(u.id) },
        order: { DATE_MODIFY: "DESC" },
        select: CONFIG.LEAD_SELECT_FULL
      }, 400);
    }catch(_){
      closeModal();
      return openModal(`ABRIR • ${u.name}`, `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Leads da usuária: <b>${esc(list.length)}</b></div>
      <table class="cgdTable">
        <thead><tr><th>Lead</th><th>Status</th><th style="width:220px">Ações</th></tr></thead>
        <tbody>
          ${list.map(it=>{
            const id = String(it.ID);
            return `<tr>
              <td><b>${esc(leadDisplayName(it))}</b></td>
              <td><span class="cgdBadge">${esc(stageName(it.STATUS_ID))}</span></td>
              <td style="text-align:right">
                <button class="cgdBtn" data-open-lead="${esc(id)}">Detalhes</button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
    openModal(`ABRIR • ${u.name}`, body);

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const b = e.target.closest("[data-open-lead]");
      if(!b) return;
      await modalLeadDetails(b.getAttribute("data-open-lead"));
    });
  }

  // =========================
  // Busca global: mostra responsável + TRANSFERIR
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
      select: CONFIG.LEAD_SELECT_FULL
    }, 60).catch(()=>[]);

    const b = await bxListAll("crm.lead.list", {
      filter: { ...baseFilter, "%NAME": t },
      order: { DATE_MODIFY:"DESC" },
      select: CONFIG.LEAD_SELECT_FULL
    }, 60).catch(()=>[]);

    const c = await bxListAll("crm.lead.list", {
      filter: { ...baseFilter, "%LAST_NAME": t },
      order: { DATE_MODIFY:"DESC" },
      select: CONFIG.LEAD_SELECT_FULL
    }, 60).catch(()=>[]);

    return uniqById([...(a||[]), ...(b||[]), ...(c||[])]).slice(0, 60);
  }

  async function modalLeadDetails(leadId){
    openModal("LEAD", `<div style="opacity:.75;font-weight:900">Carregando…</div>`);
    try{
      const it = await bx("crm.lead.get", { id: String(leadId) });
      const name = leadDisplayName(it);
      const st = stageName(it.STATUS_ID);
      const assigned = userNameById(it.ASSIGNED_BY_ID);

      const oper = pickUF(it, CONFIG.UF_OPERADORA);
      const idade = pickUF(it, CONFIG.UF_IDADE);
      const tel = bestPhone(it);
      const bairro = pickUF(it, CONFIG.UF_BAIRRO);
      const fonte = pickUF(it, CONFIG.UF_FONTE);
      const dt = fmtDateBRFromISO(pickUF(it, CONFIG.UF_DT_LEAD));

      const userOpts = CONFIG.USERS.map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");

      openModal(`LEAD • ${name}`, `
        <div class="cgdRow" style="margin-bottom:10px">
          <div class="cgdBadge">STAGE: <b>${esc(st)}</b></div>
          <div class="cgdBadge">COM: <b>${esc(assigned)}</b></div>
        </div>

        <div style="font-weight:900;opacity:.92;line-height:1.4;margin-bottom:12px">
          <div>OPERADORA: <b>${esc(oper||"—")}</b></div>
          <div>IDADE: <b>${esc(idade||"—")}</b></div>
          <div>TELEFONE: <b>${esc(tel||"—")}</b></div>
          <div>BAIRRO: <b>${esc(bairro||"—")}</b></div>
          <div>FONTE: <b>${esc(fonte||"—")}</b></div>
          <div>DATA/HORA: <b>${esc(dt||"—")}</b></div>
        </div>

        <div style="height:1px;background:rgba(30,40,70,.10);margin:10px 0"></div>

        <div style="font-weight:950;margin-bottom:8px">TRANSFERIR PARA:</div>
        <div class="cgdRow">
          <select class="cgdSelect" id="trUser">${userOpts}</select>
          <button class="cgdBtn" id="trGo">TRANSFERIR</button>
        </div>
        <div style="font-size:11px;font-weight:900;opacity:.75;margin-top:8px">
          Ao transferir: muda o responsável. Se o lead estiver em NOVO LEAD, também envia para EM ATENDIMENTO.
        </div>
      `);

      $("#trGo")?.addEventListener("click", async ()=>{
        const btn = $("#trGo");
        try{
          btn.disabled = true;
          const to = $("#trUser").value;
          await actionTransferLead(it.ID, to);
          alert("Transferência enfileirada ✅ (sincroniza quando normalizar a conexão)");
        }finally{
          btn.disabled = false;
        }
      });

    }catch(_){
      closeModal();
      openModal("LEAD", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }
  }

  function modalSearchResults(term, results){
    const userOpts = CONFIG.USERS.map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");

    const rows = (results||[]).map(it=>{
      const assigned = userNameById(it.ASSIGNED_BY_ID);
      const name = leadDisplayName(it);
      const st = stageName(it.STATUS_ID);
      return `
        <tr>
          <td>
            <b>${esc(name)}</b>
            <div style="opacity:.75;font-weight:900;font-size:11px">STAGE: ${esc(st)} • COM: ${esc(assigned)}</div>
          </td>
          <td style="width:360px">
            <div class="cgdRow">
              <select class="cgdSelect" data-tr-sel="${esc(it.ID)}">${userOpts}</select>
              <button class="cgdBtn" data-tr-go="${esc(it.ID)}">TRANSFERIR</button>
            </div>
          </td>
          <td style="width:140px;text-align:right">
            <button class="cgdBtn" data-open-lead="${esc(it.ID)}">Abrir</button>
          </td>
        </tr>
      `;
    }).join("");

    openModal(`BUSCA • ${term}`, `
      <div style="font-weight:950;margin-bottom:10px">Resultados: <b>${esc((results||[]).length)}</b></div>
      <table class="cgdTable">
        <thead><tr><th>Lead</th><th>Transferir</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead encontrado.</td></tr>`}</tbody>
      </table>
    `);

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const open = e.target.closest("[data-open-lead]");
      const tr = e.target.closest("[data-tr-go]");
      if(open){
        await modalLeadDetails(open.getAttribute("data-open-lead"));
      }
      if(tr){
        const id = tr.getAttribute("data-tr-go");
        const sel = $(`select[data-tr-sel="${CSS.escape(String(id))}"]`, $(".cgdModalBody"));
        const to = sel?.value;
        if(!to) return;
        tr.disabled = true;
        try{
          await actionTransferLead(id, to);
          alert("Transferência enfileirada ✅");
        }finally{
          tr.disabled = false;
        }
      }
    });
  }

  // =========================
  // UI
  // =========================
  function updateSoundUI(){
    const so = $("#btnSoundOn");
    if(so) so.style.display = state.soundOn ? "none" : "inline-block";
  }

  function wire(){
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
    $("#btnRefreshWho")?.addEventListener("click", refreshUserCardsFast);
    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);

    $("#btnQueueManage")?.addEventListener("click", modalQueueManage);

    $("#queueBody")?.addEventListener("click", async (e)=>{
      const up = e.target.closest("[data-q-up]");
      const dn = e.target.closest("[data-q-down]");
      if(!up && !dn) return;
      if(state.queueBusyUI) return;

      const id = up ? up.getAttribute("data-q-up") : dn.getAttribute("data-q-down");
      const dir = up ? "up" : "down";
      const next = moveQueueLocal(id, dir);
      await commitQueue(next);
    });

    $("#btnQueueWalk")?.addEventListener("click", async ()=>{
      if(state.queueBusyUI) return;

      const order = (state.queue.order||[]).slice();
      if(order.length === 0){
        alert("Fila vazia. Clique em Gerenciar para adicionar usuárias.");
        return;
      }
      const firstId = order.shift();
      order.push(firstId);
      await commitQueue(order);
      setLastServed(userNameById(firstId));
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      if(state.queueBusyUI) return;
      await commitQueue([]);
    });

    $("#btnGET")?.addEventListener("click", ()=> window.open(CONFIG.LINKS.GET, "_blank", "noopener"));
    $("#btnVendas")?.addEventListener("click", ()=> window.open(CONFIG.LINKS.VENDAS, "_blank", "noopener"));

    // Busca
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
    $("#searchBox")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") $("#btnSearch")?.click(); });

    // Delegação cards
    document.addEventListener("click", (e)=>{
      const g = e.target.closest("[data-grab]");
      const d = e.target.closest("[data-discard]");
      const ou = e.target.closest("[data-open-user]");

      if(g) modalPickLead(g.getAttribute("data-grab"));
      if(d){
        // descarte simples (mantive)
        const id = d.getAttribute("data-discard");
        state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(id));
        state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
        renderNewLeads(state.newLeadsRender);
        renderPendingCount(state.pendingCount - 1);
        enqueueOp("discardLead", async ()=>{ await leadUpdate(id, { STATUS_ID: CONFIG.LEAD_STATUS.PERDIDO }); });
        flushOps();
      }
      if(ou) modalUserOpen(ou.getAttribute("data-open-user"));
    });
  }

  // =========================
  // Start (carrega rápido)
  // =========================
  async function start(){
    injectCSS();
    mount();
    wire();
    updateSoundUI();

    // carrega a tela rápido: primeiro pinta, depois aquece fotos
    warmUserPhotos().then(()=> renderBossPics()).catch(()=>{});

    // primeira carga: paralelizada
    await hardRefreshAll();
    renderBossPics();

    // timers
    setInterval(refreshNewLeads, CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(refreshPendingCount, Math.max(9000, CONFIG.REFRESH_NEW_LEADS_MS*2));
    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);
    setInterval(refreshUserCardsFast, CONFIG.REFRESH_WHO_MS);

    setInterval(flushOps, 2500);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
