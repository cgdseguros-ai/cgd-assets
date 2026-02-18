/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - SEM storage do navegador
   - FILA multi-PC via QUEUE_JSON (Pipeline 27 / Stage QUEUE_JSON)
   - Layout/estética: MANTIDOS (evitar mexer em CSS/estrutura já aprovada)
   - Leads (crm.lead.*) — NOVO LEAD, EM ATENDIMENTO, QUALIFICADO, PERDIDO, CONVERTIDO (IDs custom do seu Bitrix)
*/
(function(){
  "use strict";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    // Campo UF usado no Follow-up (lead)
    UF_PRAZO: "UF_CRM_1768175087",

    // Campos do lead que você pediu pra exibir
    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD:   "UF_CRM_1771333014",      // Data/Hora do Lead (pode vir em string DD/MM/AAAA ou ISO)
    UF_IDADE:     "UF_CRM_1771339221",      // Idade (texto)
    UF_BAIRRO:    "UF_CRM_LEAD_1731909705398",
    UF_FONTE_TXT: "UF_CRM_1767285733843",

    // Fila multi-PC via PIPELINE 27 (controle)
    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",          // QUEUE_JSON
      UF_QUEUE_JSON: "UF_CRM_1771293519", // QUEUE_JSON (campo)
      TITLE_KEY: "__QUEUE__CGD__"
    },

    // ✅ Pipeline 17 (TF SAÚDE) — stages por usuária (você mandou)
    DEAL_PIPELINE17: {
      CATEGORY_ID: 17,
      STAGE_BY_USER: {
        "15":   "C17:UC_FQ8UPI",  // ALINE
        "19":   "C17:UC_1HXNTB",  // ADRIANA
        "17":   "C17:UC_RRQKAQ",  // ANDREYNA
        "23":   "C17:UC_4HQGI1",  // MARIANA
        "811":  "C17:UC_8Y4R4V",  // JOSIANE
        "3081": "C17:EXECUTING",  // BRUNA LUISA
        "3083": "C17:UC_8O5UFO",  // FERNANDA SILVA
        "3079": "C17:UC_P1P9RJ",  // LIVIA ALVES
        "3085": "C17:UC_U8AAGB",  // NICOLLE BELMONTE
        "3389": "C17:UC_A6LSS8",  // ANNA CLARA
        "815":  "C17:UC_ZT6WEB",  // GABRIEL
        "3387": "C17:UC_RXISLQ"   // BEATRIZ
      }
    },

    // Logo
    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=e6lxlp1bz9nz",

    // Refresh
    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 7000,
    REFRESH_QUEUE_MS: 2500,
    REFRESH_WHO_MS: 6000,

    // Limites de UI (exibição) vs backend (carregar tudo)
    LIMIT_NEW_DISPLAY: 30,     // quantos cards renderiza na coluna (UI)
    LIMIT_NEW_FETCH_MAX: 800,  // quantos pendentes pode puxar do Bitrix (para contar e transferir em lote)
    LIMIT_USER_HISTORY: 120,   // histórico mostrado no modal (sem storage; vem do Bitrix)
    LIMIT_USER_SEARCH: 200,    // quando buscar por palavra-chave no Bitrix

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
      { name:"BEATRIZ", id:3387 }
    ],

    // ✅ Status/Stages de LEADS (VOCÊ MANDOU)
    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      QUALIFICADO: "UC_0NFA3H",
      PERDIDO: "UC_5IMTI4",
      CONVERTIDO: "UC_B3RQAF"
    },

    // Para exibir nomes bonitos no modal ABRIR (stage name)
    LEAD_STATUS_NAME: {
      "NEW": "NOVO LEAD",
      "IN_PROCESS": "EM ATENDIMENTO",
      "UC_0NFA3H": "QUALIFICADO",
      "UC_5IMTI4": "PERDIDO",
      "UC_B3RQAF": "CONVERTIDO",
      "CONVERTED": "LEAD CONVERTIDO",
      "JUNK": "DESCARTADO"
    },

    // Campos do lead para listagem (inclui UFs específicos)
    LEAD_SELECT: [
      "ID","TITLE","NAME","LAST_NAME","SECOND_NAME",
      "STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
      "SOURCE_ID","PHONE","EMAIL",
      "ADDRESS_CITY","ADDRESS","ADDRESS_2","ADDRESS_REGION",
      "UF_CRM_1771282782",
      "UF_CRM_1771333014",
      "UF_CRM_1771339221",
      "UF_CRM_LEAD_1731909705398",
      "UF_CRM_1767285733843",
      "UF_*"
    ],

    // Badge “quente”
    HOT_EMOJI: "🔥",

    // Links do GET (Equipes) — ajuste as URLs aqui (sem mexer no layout)
    GET_LINKS: [
      { label: "Equipe Α ALPHA — Painel", url: "https://getcgdcorretora.bitrix24.site/alpha/" },
      { label: "Equipe Β BETA — Painel",  url: "https://getcgdcorretora.bitrix24.site/beta/"  },
      { label: "Equipe Δ DELTA — Painel", url: "https://getcgdcorretora.bitrix24.site/delta/" }
    ]
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

  // Parse da Data do Lead (UF_DT_LEAD)
  // Aceita:
  // - ISO (2026-02-18T12:34:00+03:00 / 2026-02-18T12:34:00)
  // - BR (DD/MM/AAAA HH:MM ou DD/MM/AAAA)
  function parseLeadDateAny(v){
    const s = String(v||"").trim();
    if(!s) return null;

    // BR dd/mm/yyyy [hh:mm]
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if(m){
      const dd=+m[1], mm=+m[2]-1, yy=+m[3], hh=+(m[4]||"0"), mi=+(m[5]||"0");
      const dt = new Date(yy, mm, dd, hh, mi, 0, 0);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    // ISO
    const t = Date.parse(s);
    if(Number.isFinite(t)){
      const dt = new Date(t);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    return null;
  }
  function formatBRDate(dt){
    if(!dt) return "";
    try{
      return `${pad2(dt.getDate())}/${pad2(dt.getMonth()+1)}/${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    }catch(_){ return ""; }
  }
  function dayKey(dt){
    if(!dt) return "";
    return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
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

  async function bx(method, params={}){
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
    return data.result;
  }

  // Paginação Bitrix (start)
  async function bxListAll(method, params, max=2000){
    let start = 0;
    let out = [];
    while(true){
      const r = await bx(method, { ...params, start });
      if(Array.isArray(r)){
        out = out.concat(r);
        break;
      }
      if(r && Array.isArray(r.items)){
        out = out.concat(r.items);
        if(!r.next) break;
        start = r.next;
      }else{
        break;
      }
      if(out.length >= max) break;
    }
    return out.slice(0, max);
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
  // UI / CSS (mantido)
  // =========================
  function injectCSS(){
    // (mantém o CSS que você já aprovou — sem mudanças visuais relevantes)
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
  width: 53px; height: 53px;
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

/* ✅ QUEM PEGOU HOJE em 2 colunas */
#listWho.cgdWhoGrid{
  display:grid !important;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 1100px){
  #listWho.cgdWhoGrid{ grid-template-columns: 1fr; }
}

/* ===== Modals modernos (mantidos) ===== */
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

/* Bitrix footer fix */
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

    // pendentes (carrega tudo) + subset (render)
    newLeadsAll: [],
    newLeadsTotal: 0,
    newLeadsShown: [],

    stats: { day:0, month:0 },
    userStats: {},

    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] }
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
                <div class="hTitle">NOVOS LEADS • PENDENTES <span style="opacity:.7">(<span id="pendingTotal">0</span>)</span></div>
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

        <div class="cgdBottom">
          <div class="cgdQueueRow" id="queueRow">
            <button class="cgdQueueChip" id="btnQueueBottom"><b>Fila de atendimento</b></button>
            <div class="cgdQueueChip" id="queueHint">Fila vazia. Clique em Fila de atendimento e selecione quem entra.</div>
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
  // LEADS: fetch / actions
  // =========================
  async function fetchNewLeadsAll(){
    const items = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_NEW_FETCH_MAX);
    return items || [];
  }

  // Contagem “Leads do dia/mês”: puxados (mudaram para EM ATENDIMENTO) no período
  async function fetchStatsPulled(){
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    // aproximamos via DATE_MODIFY + STATUS_ID = EM_ATENDIMENTO
    // (Bitrix não dá “data exata da mudança de etapa” via lead.list; essa é a forma estável que funciona no REST)
    const dayItems = await bxListAll("crm.lead.list", {
      filter: { ">DATE_MODIFY": startToday, "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 2000);

    const monthItems = await bxListAll("crm.lead.list", {
      filter: { ">DATE_MODIFY": startMonth, "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 6000);

    return { day: (dayItems||[]).length, month: (monthItems||[]).length };
  }

  async function fetchUserCounts(userId){
    const inproc = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 5000);

    const qual = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "STATUS_ID": CONFIG.LEAD_STATUS.QUALIFICADO },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 5000);

    return { emAtendimento: (inproc||[]).length, qualificado: (qual||[]).length };
  }

  async function fetchUserHistory(userId){
    const last = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","NAME","LAST_NAME","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID", CONFIG.UF_DT_LEAD]
    }, CONFIG.LIMIT_USER_HISTORY);

    // puxados hoje: aproximado por DATE_MODIFY + status EM_ATENDIMENTO
    const today = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), ">DATE_MODIFY": todayISOStart(), "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 5000);

    const month = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), ">DATE_MODIFY": monthISOStart(), "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 9000);

    return { pulledToday: (today||[]).length, pulledMonth: (month||[]).length, last: (last||[]) };
  }

  async function searchLeadsByKeyword(userId, keyword){
    const kw = String(keyword||"").trim();
    if(!kw) return [];
    // busca ampla: TITLE contém kw OR NAME contém kw (Bitrix não suporta OR fácil no lead.list; fazemos 2 buscas e unimos)
    const a = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "%TITLE": kw },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID","TITLE","NAME","LAST_NAME","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID", CONFIG.UF_DT_LEAD]
    }, CONFIG.LIMIT_USER_SEARCH);

    const b = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "%NAME": kw },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID","TITLE","NAME","LAST_NAME","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID", CONFIG.UF_DT_LEAD]
    }, CONFIG.LIMIT_USER_SEARCH);

    const map = new Map();
    (a||[]).concat(b||[]).forEach(it=> map.set(String(it.ID), it));
    return Array.from(map.values()).sort((x,y)=> (+y.ID) - (+x.ID));
  }

  async function leadUpdate(id, fields){
    return bx("crm.lead.update", { id: String(id), fields });
  }

  async function leadGet(id){
    return bx("crm.lead.get", { id: String(id) });
  }

  async function actionPickLead(leadId, userId){
    await leadUpdate(leadId, { ASSIGNED_BY_ID: String(userId), STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO });
  }

  async function actionPickLeadForFirstInQueue(leadId){
    const q = await fetchQueue();
    const order = (q.order||[]).slice();
    if(order.length===0) throw new Error("Fila vazia");
    const nextId = order.shift();
    order.push(nextId); // volta pro final da fila
    await actionPickLead(leadId, nextId);
    await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
    await refreshQueue();
  }

  async function actionDiscardLead(leadId){
    await leadUpdate(leadId, { STATUS_ID: CONFIG.LEAD_STATUS.PERDIDO });
  }

  async function actionMoveLead(leadId, statusId){
    const fields = { STATUS_ID: statusId };

    if(statusId === CONFIG.LEAD_STATUS.QUALIFICADO){
      const lead = await leadGet(leadId);
      const nm = leadDisplayName(lead);
      const t = String(lead.TITLE || nm || "").trim();

      // marca 🔥 no TITLE (sem duplicar)
      if(t && !t.includes(CONFIG.HOT_EMOJI)){
        fields.TITLE = `${CONFIG.HOT_EMOJI} ${t}`.trim();
      }
    }

    await leadUpdate(leadId, fields);
  }

  async function actionSetPrazo(leadId, iso){
    await leadUpdate(leadId, { [CONFIG.UF_PRAZO]: iso });
  }

  // ✅ FOLLOW-UP: cria negócio na Pipeline 17, coluna da usuária
  async function createFollowUpDealFromLead(leadId, userId, isoPrazo){
    const stage = CONFIG.DEAL_PIPELINE17.STAGE_BY_USER[String(userId)];
    if(!stage) throw new Error("Sem STAGE_ID para essa usuária (pipeline 17)");

    const lead = await leadGet(leadId);
    const nm = leadDisplayName(lead);
    const titleBase = nm || (lead.TITLE || `Lead #${leadId}`);
    const dealTitle = `FOLLOW-UP • [LEAD #${leadId}] ${titleBase}`.slice(0, 250);

    // cria deal “card” na pipeline 17
    await bx("crm.deal.add", {
      fields: {
        CATEGORY_ID: CONFIG.DEAL_PIPELINE17.CATEGORY_ID,
        STAGE_ID: stage,
        TITLE: dealTitle,
        ASSIGNED_BY_ID: String(userId),
        OPPORTUNITY: 0,
        COMMENTS: isoPrazo ? `FOLLOW-UP: ${isoPrazo}` : `FOLLOW-UP criado pelo painel (Lead #${leadId}).`
      }
    });
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
  }

  // =========================
  // Render helpers
  // =========================
  function leadDisplayName(it){
    // prioridade: NAME + LAST_NAME (cliente) -> TITLE -> fallback
    const n = [it.NAME, it.LAST_NAME].filter(Boolean).map(String).join(" ").trim();
    if(n) return n;
    const t = String(it.TITLE||"").trim();
    if(t) return t;
    return `Lead #${it.ID}`;
  }

  function getUF(it, key){
    return it ? it[key] : null;
  }

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

    // status bonito
    const st = String(it.STATUS_ID||"");
    if(st) b.push(["STAGE", (CONFIG.LEAD_STATUS_NAME[st]||st)]);

    return b.slice(0, 8);
  }

  function renderNewLeads(items){
    const list = $("#listNew");
    if(!list) return;

    const alert = $("#alertNew");
    const btnSoundOn = $("#btnSoundOn");
    list.innerHTML = "";

    if(alert) list.appendChild(alert);

    const totalEl = $("#pendingTotal");
    if(totalEl) totalEl.textContent = String(state.newLeadsTotal||0);

    const has = (items||[]).length > 0;
    if(alert) alert.style.display = has ? "flex" : "none";

    if(btnSoundOn){
      btnSoundOn.style.display = state.soundOn ? "none" : "inline-block";
    }

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

      const badges = badgesFromLead(it).map(([k,v]) =>
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
      const d = h?.last?.[0]?.DATE_MODIFY;
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
      const us = state.userStats[u.id] || { pulledToday:0, pulledMonth:0, last:[] };
      const l0 = us.last && us.last[0] ? leadDisplayName(us.last[0]) : "—";
      const l1 = us.last && us.last[1] ? leadDisplayName(us.last[1]) : "—";

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div style="font-weight:950">${esc(u.name)} <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></div>
          <div style="display:flex; gap:8px; align-items:center">
            <span class="cgdBadge">dia: ${esc(us.pulledToday||0)}</span>
            <span class="cgdBadge">mês: ${esc(us.pulledMonth||0)}</span>
            <button class="cgdMiniBtn" data-open-user="${esc(u.id)}">Abrir</button>
          </div>
        </div>
        <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">Último: ${esc(l0)}</div>
        <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">Anterior: ${esc(l1)}</div>
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
    const row = $("#queueRow");
    const hint = $("#queueHint");
    if(!row || !hint) return;

    const keepBtn = $("#btnQueueBottom");
    row.innerHTML = "";
    if(keepBtn) row.appendChild(keepBtn);

    const order = state.queue.order || [];
    if(order.length === 0){
      hint.textContent = "Fila vazia. Clique em Fila de atendimento e selecione quem entra.";
      row.appendChild(hint);
      return;
    }

    hint.textContent = "";
    row.appendChild(hint);

    order.forEach((id, idx)=>{
      const u = CONFIG.USERS.find(x=> String(x.id)===String(id));
      const chip = document.createElement("div");
      chip.className = "cgdQueueChip";
      chip.innerHTML = `<b>${esc(u ? u.name : ("USER "+id))}</b> <span style="opacity:.65">#${idx+1}</span>`;
      row.appendChild(chip);
    });
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
    }).join("") || `<div style="font-weight:900;opacity:.75">Configure as URLs em CONFIG.GET_LINKS.</div>`;

    openModal("GET (Equipes)", `
      <div style="font-weight:900;opacity:.8;margin-bottom:10px">Acessos rápidos</div>
      ${links}
    `);
  }

  async function modalQueue(){
    const q = await fetchQueue();

    state.queue = { ...state.queue, ...q };

    const currentSet = new Set((q.order||[]).map(String));

    const body = `
      <div style="font-weight:950; margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="qAll">Selecionar todas</button>
        <button class="cgdBtn" id="qNone">Limpar</button>
        <button class="cgdBtn" id="qApply">Aplicar alterações</button>
      </div>

      <div style="font-weight:950;margin-bottom:8px">Ordem da fila</div>
      <table class="cgdTable" style="margin-bottom:12px">
        <thead><tr><th style="width:80px">#</th><th>Usuária</th><th style="width:140px">Mover</th></tr></thead>
        <tbody id="qOrderTbody">
          ${(q.order||[]).map((id, idx)=>{
            const u = CONFIG.USERS.find(x=>String(x.id)===String(id));
            return `<tr data-qord="${esc(id)}">
              <td><b>${esc(idx+1)}</b></td>
              <td><b>${esc(u?u.name:("USER "+id))}</b> <span style="opacity:.65;font-weight:900">(${esc(id)})</span></td>
              <td>
                <button class="cgdBtn" data-up="${esc(id)}">↑</button>
                <button class="cgdBtn" data-down="${esc(id)}">↓</button>
              </td>
            </tr>`;
          }).join("") || `<tr><td colspan="3" style="opacity:.75;font-weight:900">Fila vazia.</td></tr>`}
        </tbody>
      </table>

      <div style="font-weight:950;margin-bottom:8px">Quem entra na fila</div>
      <table class="cgdTable">
        <thead><tr><th style="width:90px">Na fila</th><th>Usuária</th></tr></thead>
        <tbody id="qTbody">
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

    openModal("FILA DE ATENDIMENTO", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`, { modalWidthPx: 1100 });

    const moveInOrder = async (id, dir)=>{
      const ord = (state.queue.order||[]).slice();
      const i = ord.findIndex(x=>String(x)===String(id));
      if(i<0) return;
      const j = i + dir;
      if(j<0 || j>=ord.length) return;
      const tmp = ord[i]; ord[i]=ord[j]; ord[j]=tmp;
      await saveQueue(state.queue.dealId, { order: ord, hiddenUsers: state.queue.hiddenUsers||[] });
      const fresh = await fetchQueue();
      state.queue = { ...state.queue, ...fresh };
      renderQueue();
      renderWho();
      closeModal();
      await modalQueue();
    };

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const up = e.target.closest("[data-up]");
      const dn = e.target.closest("[data-down]");
      if(up) return moveInOrder(up.getAttribute("data-up"), -1);
      if(dn) return moveInOrder(dn.getAttribute("data-down"), +1);
    });

    $("#qAll")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-q-user]').forEach(ch => ch.checked = true);
    });
    $("#qNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-q-user]').forEach(ch => ch.checked = false);
    });

    $("#qApply")?.addEventListener("click", async ()=>{
      try{
        $("#qApply").disabled = true;

        const checked = $$('input[type=checkbox][data-q-user]')
          .filter(ch=>ch.checked)
          .map(ch=> String(ch.getAttribute("data-q-user")));

        const prev = (q.order||[]).map(String);
        const next = [];
        for(const id of prev){ if(checked.includes(id)) next.push(id); }
        for(const id of checked){ if(!next.includes(id)) next.push(id); }

        await saveQueue(q.dealId, { order: next, hiddenUsers: q.hiddenUsers||[] });

        const fresh = await fetchQueue();
        state.queue = { ...state.queue, ...fresh };
        renderQueue();
        renderWho();
        setStatus(`Atualizado: ${nowBRTime()}`);
        closeModal();
        await modalQueue();
      }catch(err){
        console.error(err);
        alert("Falha ao salvar fila agora.");
      }finally{
        $("#qApply").disabled = false;
      }
    });
  }

  async function modalHideUsers(){
    const q = await fetchQueue();
    const hiddenSet = new Set((q.hiddenUsers||[]).map(String));

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Ocultar/mostrar cards de usuárias (sincroniza em todos os PCs)</div>

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
      try{
        $("#huApply").disabled = true;
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
        alert("Falha ao salvar agora.");
      }finally{
        $("#huApply").disabled = false;
      }
    });
  }

  async function modalBatchTransfer(){
    // usa a lista COMPLETA (state.newLeadsAll), não só a exibida
    const all = (state.newLeadsAll || []).slice();

    // valores de operadora (distinct)
    const ops = Array.from(new Set(all.map(it => String(getUF(it, CONFIG.UF_OPERADORA)||"").trim()).filter(Boolean))).sort();
    const opsOptions = [`<option value="">Todas</option>`].concat(ops.map(o=> `<option value="${esc(o)}">${esc(o)}</option>`)).join("");

    const usersOpt = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote (carrega TODOS os pendentes)</div>

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
        <div class="cgdBadge">Pendentes: <b>${esc(all.length)}</b></div>
        <div class="cgdBadge">Mostrando: <b id="btCount">${esc(all.length)}</b></div>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:70px">Sel.</th>
            <th>Lead</th>
            <th style="width:330px">Info</th>
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
          await sleep(120);
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

  async function modalPickLead(leadId){
    const uops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");
    openModal("PEGAR LEAD", `
      <div style="font-weight:950;margin-bottom:10px">Escolha como pegar este lead</div>

      <div class="cgdRow" style="margin-bottom:10px">
        <button class="cgdBtn" id="pickQueue">Pegar p/ próxima da fila</button>
      </div>

      <div style="height:10px"></div>

      <div style="font-weight:950;margin-bottom:8px">Ou selecionar usuária:</div>
      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Usuária:</label>
        <select class="cgdSelect" id="pickUser">${uops}</select>
        <button class="cgdBtn" id="pickGo">Confirmar</button>
      </div>

      <div style="font-size:11px;font-weight:900;opacity:.75">
        Ao confirmar: muda responsável e envia para <b>EM ATENDIMENTO</b>.
      </div>
    `);

    $("#pickQueue")?.addEventListener("click", async ()=>{
      try{
        $("#pickQueue").disabled = true;
        await actionPickLeadForFirstInQueue(leadId);
        closeModal();
        await hardRefreshAll();
      }catch(err){
        console.error(err);
        alert("Fila vazia ou falha ao pegar pela fila.");
      }finally{
        $("#pickQueue").disabled = false;
      }
    });

    $("#pickGo")?.addEventListener("click", async ()=>{
      try{
        const uid = $("#pickUser").value;
        $("#pickGo").disabled = true;
        await actionPickLead(leadId, uid);
        closeModal();
        await hardRefreshAll();
      }catch(err){
        console.error(err);
        alert("Falha ao pegar agora.");
      }finally{
        $("#pickGo").disabled = false;
      }
    });
  }

  // ✅ Modal ABRIR (busca + filtro por stage + contagens + follow-up que cria negócio na pipeline 17)
  async function modalManageUser(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    // sempre vem do Bitrix (multi-PC, sem storage)
    const [hist, counts] = await Promise.all([fetchUserHistory(u.id), fetchUserCounts(u.id)]);

    const body = `
      <div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:950">GERENCIAR • ${esc(u.name)} (${esc(u.id)})</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">EM ATENDIMENTO: <b>${esc(counts.emAtendimento||0)}</b></div>
        <div class="cgdBadge">QUALIFICADO: <b>${esc(counts.qualificado||0)}</b></div>
        <div class="cgdBadge">puxados hoje: <b>${esc(hist.pulledToday||0)}</b></div>
        <div class="cgdBadge">puxados mês: <b>${esc(hist.pulledMonth||0)}</b></div>
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
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:70px">Sel.</th>
            <th>Lead</th>
            <th style="width:220px">Stage</th>
            <th style="width:370px">FOLLOW-UP</th>
            <th style="width:360px">Transferir</th>
          </tr>
        </thead>
        <tbody id="muTbody"></tbody>
      </table>
    `;

    openModal(`ABRIR • ${u.name} (${u.id})`, body, undefined, { modalWidthPx: 1200 });

    let listBase = (hist.last||[]).slice();

    const tbody = $("#muTbody");
    const filter = $("#muFilter");
    const search = $("#muSearch");

    function stageName(id){
      return CONFIG.LEAD_STATUS_NAME[String(id||"")] || String(id||"—");
    }

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

        return `<tr data-row="${esc(id)}">
          <td><input type="checkbox" data-sel="${esc(id)}" /></td>
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
              <button class="cgdBtn" data-move-stage="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.PERDIDO)}">Perder</button>
              <button class="cgdBtn" data-move-stage="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.CONVERTIDO)}">Converter</button>
            </div>
          </td>
        </tr>`;
      }).join("") : `<tr><td colspan="5" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    renderRows();

    $("#muRefresh")?.addEventListener("click", async ()=>{
      closeModal();
      await modalManageUser(userId);
    });

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

    // buscar no Bitrix (carrega mais, outros dias)
    $("#muSearchGo")?.addEventListener("click", async ()=>{
      const kw = ($("#muSearch").value||"").trim();
      if(!kw) return;
      try{
        $("#muSearchGo").disabled = true;
        const found = await searchLeadsByKeyword(u.id, kw);
        // junta com base atual e reordena por ID desc
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

    search?.addEventListener("input", renderRows);
    filter?.addEventListener("change", renderRows);

    // lote follow-up
    $("#muBulkPrazo")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const iso = isoFromLocalInput($("#muBulkDate")?.value || "");
      if(!iso) return alert("Preencha a data/hora do FOLLOW-UP.");
      try{
        $("#muBulkPrazo").disabled = true;
        for(const id of ids){
          await actionSetPrazo(id, iso);
          await createFollowUpDealFromLead(id, u.id, iso);
          await sleep(140);
        }
        closeModal();
        await hardRefreshAll();
        alert("FOLLOW-UP em lote criado ✅");
      }catch(err){
        console.error(err);
        alert("Falha ao salvar FOLLOW-UP agora.");
      }finally{
        $("#muBulkPrazo").disabled = false;
      }
    });

    // lote mover stage
    $("#muBulkMove")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const to = $("#muMoveTo")?.value;
      if(!to) return;
      try{
        $("#muBulkMove").disabled = true;
        for(const id of ids){
          await actionMoveLead(id, to);
          await sleep(140);
        }
        closeModal();
        await hardRefreshAll();
        alert("Movimento em lote concluído ✅");
      }catch(err){
        console.error(err);
        alert("Falha ao mover agora.");
      }finally{
        $("#muBulkMove").disabled = false;
      }
    });

    // ações individuais (delegação)
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

          // salva UF prazo + cria deal na pipeline 17
          await actionSetPrazo(leadId, iso);
          await createFollowUpDealFromLead(leadId, u.id, iso);

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
        alert("Falha ao executar agora.");
      }finally{
        if(sp) sp.disabled = false;
        if(tf) tf.disabled = false;
        if(mv) mv.disabled = false;
      }
    });
  }

  // =========================
  // Refresh orchestration
  // =========================
  async function refreshNewLeads(){
    const itemsAll = await fetchNewLeadsAll();

    state.newLeadsAll = itemsAll || [];
    state.newLeadsTotal = state.newLeadsAll.length;

    // subset UI
    state.newLeadsShown = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_DISPLAY);

    // alarme: só quando chega um novo ID
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

  async function refreshUsers(){
    const jobs = CONFIG.USERS.map(async u=>{
      const h = await fetchUserHistory(u.id);
      state.userStats[u.id] = h;
    });
    await Promise.all(jobs);
    renderWho();
  }

  async function refreshQueue(){
    const q = await fetchQueue();
    state.queue = { ...state.queue, ...q };
    renderQueue();
    renderWho();
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()})`);
    await Promise.allSettled([refreshNewLeads(), refreshStats(), refreshUsers(), refreshQueue()]);
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
    $("#btnRefreshNew")?.addEventListener("click", ()=> refreshNewLeads().catch(console.error));
    $("#btnRefreshWho")?.addEventListener("click", ()=> refreshUsers().catch(console.error));

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

    $("#btnBatch")?.addEventListener("click", ()=> modalBatchTransfer().catch(console.error));

    // fila: chip/botão inferior
    $("#btnQueueBottom")?.addEventListener("click", ()=> modalQueue().catch(console.error));

    $("#btnHideUsers")?.addEventListener("click", ()=> modalHideUsers().catch(console.error));

    $("#btnNext")?.addEventListener("click", async ()=>{
      try{
        const q = await fetchQueue();
        const order = (q.order||[]).slice();
        if(order.length===0) return;
        const nextId = order.shift();
        order.push(nextId);
        await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
        await refreshQueue();
        setStatus(`Próxima: ${(CONFIG.USERS.find(x=>String(x.id)===String(nextId))||{}).name || ("USER "+nextId)} • ${nowBRTime()}`);
      }catch(err){
        console.error(err);
      }
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      try{
        const q = await fetchQueue();
        await saveQueue(q.dealId, { order: [], hiddenUsers: q.hiddenUsers||[] });
        await refreshQueue();
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
        (async ()=>{
          try{
            await actionDiscardLead(id);
            await hardRefreshAll();
          }catch(err){
            console.error(err);
          }
        })();
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

    await hardRefreshAll();

    setInterval(()=> refreshNewLeads().catch(()=>{}), CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(()=> refreshStats().catch(()=>{}),    CONFIG.REFRESH_STATS_MS);
    setInterval(()=> refreshQueue().catch(()=>{}),    CONFIG.REFRESH_QUEUE_MS);
    setInterval(()=> refreshUsers().catch(()=>{}),    CONFIG.REFRESH_WHO_MS);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
