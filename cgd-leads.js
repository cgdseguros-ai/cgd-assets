/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - SEM storage do navegador
   - FILA multi-PC via QUEUE_JSON (Pipeline 27 / Stage QUEUE_JSON)
   - Layout/estética MANTIDOS
*/
(function(){
  "use strict";

  // ====== Sentinel do seu LOADER antigo ======
  const BUILD = "2026-02-19.1";
  function markSentinel(msg, ok){
    try{
      const box = document.getElementById("cgd-sentinel");
      if(!box) return;
      box.style.background = ok ? "#ecfff1" : "#fff";
      box.style.borderColor = ok ? "rgba(0,160,60,.35)" : "rgba(0,0,0,.12)";
      box.textContent = msg;
    }catch(_){}
  }

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    UF_PRAZO: "UF_CRM_1768175087",

    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD:   "UF_CRM_1771333014",
    UF_IDADE:     "UF_CRM_1771339221",
    UF_BAIRRO:    "UF_CRM_LEAD_1731909705398",
    UF_FONTE:     "UF_CRM_1767285733843",

    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",
      UF_QUEUE_JSON: "UF_CRM_1771293519",
      TITLE_KEY: "__QUEUE__CGD__"
    },

    // ✅ FOLLOW-UP cria DEAL na Pipeline 17 (TF SAÚDE) na coluna da usuária
    FOLLOWUP_DEAL: {
      ENABLED: true,
      CATEGORY_ID: 17,
      DEFAULT_STAGE_ID: "C17:NEW", // NOVA TAREFA
      STAGE_BY_USER: {
        "15":  "C17:UC_FQ8UPI",  // ALINE
        "19":  "C17:UC_1HXNTB",  // ADRIANA
        "17":  "C17:UC_RRQKAQ",  // ANDREYNA
        "23":  "C17:UC_4HQGI1",  // MARIANA
        "811": "C17:UC_8Y4R4V",  // JOSIANE
        "3081":"C17:EXECUTING",  // BRUNA LUISA
        "3083":"C17:UC_8O5UFO",  // FERNANDA SILVA
        "3079":"C17:UC_P1P9RJ",  // LIVIA ALVES
        "3085":"C17:UC_U8AAGB",  // NICOLLE BELMONTE
        "3389":"C17:UC_A6LSS8",  // ANNA CLARA
        "815": "C17:UC_ZT6WEB",  // GABRIEL
        "3387":"C17:UC_RXISLQ",  // BEATRIZ
      }
    },

    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=e6lxlp1bz9nz",

    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 7000,
    REFRESH_QUEUE_MS: 2500,
    REFRESH_WHO_MS: 6000,

    // Visual: mostra só 30 cards pra performance
    LIMIT_NEW_RENDER: 30,
    // Count: conta pendentes até 5000
    LIMIT_PENDING_COUNT: 5000,

    LIMIT_USER_HISTORY: 60,

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

    // ✅ Status reais do seu Bitrix (ENTITY_ID=STATUS)
    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      QUALIFICADO: "UC_0NFA3H", // Qualificado (custom)
      PERDIDO: "UC_5IMTI4",     // Perdido (custom)
      CONVERTIDO: "UC_B3RQAF",  // Convertido (custom)
    },

    LEAD_SELECT: [
      "ID","TITLE","NAME","LAST_NAME","SECOND_NAME",
      "STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
      "SOURCE_ID",
      "PHONE","EMAIL",
      "ADDRESS_CITY","ADDRESS_REGION",
      "UF_CRM_1771282782",
      "UF_CRM_1771333014",
      "UF_CRM_1771339221",
      "UF_CRM_LEAD_1731909705398",
      "UF_CRM_1767285733843",
    ],

    HOT_EMOJI: "🔥",
    TZ: "America/Sao_Paulo"
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
  const clean = (v)=> {
    const s = String(v??"").trim();
    return s && s !== "null" && s !== "undefined" ? s : "";
  };

  function nowBRTime(){
    try{ return new Date().toLocaleTimeString("pt-BR", { timeZone: CONFIG.TZ }); }catch(_){ return ""; }
  }
  function todayISOStart(){
    const d = new Date();
    d.setHours(0,0,0,0);
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
  function fmtDT(v){
    const s = clean(v);
    if(!s) return "";
    const t = Date.parse(s);
    if(Number.isFinite(t)){
      try{
        return new Date(t).toLocaleString("pt-BR", { timeZone: CONFIG.TZ }).slice(0,16);
      }catch(_){}
    }
    return s.replace("T"," ").slice(0,16);
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

  async function bxListAll(method, params, max=200){
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
  // UI/CSS (mantido)
  // =========================
  function injectCSS(){
    const st = document.createElement("style");
    st.textContent = document.getElementById("__cgd_css__")?.textContent || `
/* CSS idêntico ao aprovado — mantido */
#cgdApp{
  --radius:18px; --border: rgba(30,40,70,.12);
  --text: rgba(18,26,40,.92); --muted: rgba(18,26,40,.62);
  --card: rgba(255,255,255,.82); --card2: rgba(255,255,255,.92);
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
.cgdTop{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.72);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:999px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:var(--shadow);}
.cgdTopLeft{display:flex;align-items:center;gap:10px;min-width:280px;}
.cgdLogo{width:53px;height:53px;border-radius:999px;border:1px solid rgba(0,0,0,.10);object-fit:cover;background:#fff;}
.cgdTitle{font-weight:950;letter-spacing:.2px;font-size:13px;white-space:nowrap;}
.cgdTopRight{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
.cgdPill{border:1px solid var(--border);background:rgba(255,255,255,.78);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;}
.cgdBtn{cursor:pointer;border:1px solid rgba(30,40,70,.14);background:rgba(255,255,255,.86);border-radius:999px;padding:7px 12px;font-size:12px;font-weight:950;}
.cgdBtn:active{transform:translateY(1px);}
.cgdGrid{margin-top:12px;display:grid;grid-template-columns:1.05fr 1.95fr;gap:12px;}
.cgdCol{border:1px solid var(--border);border-radius:var(--radius);background:rgba(255,255,255,.62);box-shadow:var(--shadow);overflow:hidden;min-height:68vh;display:flex;flex-direction:column;}
.cgdColHead{padding:10px 12px;background:rgba(255,255,255,.78);border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.cgdColHead .hTitle{font-weight:950;font-size:12px;letter-spacing:.3px;text-transform:uppercase;line-height:1.25;width:100%;}
.cgdColHead .hSub{font-size:11px;color:var(--muted);font-weight:800;margin-top:2px;width:100%;}
.cgdColHead .hActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
.cgdList{padding:10px;display:flex;flex-direction:column;gap:10px;overflow:auto;min-height:0;}
.cgdCard{border:1px solid var(--border);border-radius:16px;background:var(--card2);box-shadow:0 8px 20px rgba(20,30,60,.08);padding:10px;}
.cgdCardRow{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.cgdLeadName{font-weight:950;font-size:14px;line-height:1.2;word-break:break-word;flex:1 1 auto;}
.cgdBadges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
.cgdBadge{font-size:10px;font-weight:950;border:1px solid rgba(30,40,70,.12);padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.9);}
.cgdActions{margin-top:10px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}
.cgdMiniBtn{cursor:pointer;border:1px solid rgba(30,40,70,.14);background:rgba(255,255,255,.92);border-radius:12px;padding:7px 10px;font-size:12px;font-weight:950;}
.cgdMiniBtn.primary{background:rgba(120,210,255,.25);}
.cgdMiniBtn.danger{background:rgba(255,80,120,.16);border-color:rgba(255,80,120,.30);}
.cgdAlertBox{border:1px solid rgba(255,80,140,.35);border-radius:16px;padding:12px;background:linear-gradient(135deg, rgba(255,210,230,.75), rgba(220,240,255,.70));display:flex;align-items:center;justify-content:space-between;gap:10px;}
.cgdAlertBox .txt{font-weight:950;font-size:12px;line-height:1.25;width:100%;}
.cgdAlertBox .txt small{display:block;margin-top:4px;font-size:11px;color:rgba(18,26,40,.70);font-weight:900;}
.cgdBottom{position:fixed;left:0;right:0;bottom:0;z-index:80;background:rgba(255,255,255,.76);backdrop-filter:blur(10px);border-top:1px solid rgba(30,40,70,.14);padding:10px 12px;display:flex;flex-direction:column;gap:10px;}
.cgdQueueRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.cgdQueueChip{border:1px solid rgba(30,40,70,.14);background:rgba(255,255,255,.9);border-radius:999px;padding:7px 10px;font-weight:950;font-size:12px;}
.cgdStatusLine{font-size:11px;color:rgba(18,26,40,.60);font-weight:900;}
.cgdOffline{display:none;}
.cgdModalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.28);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;}
.cgdModal{width:min(980px, 96vw);max-height:min(88vh, 900px);background:rgba(255,255,255,.94);border:1px solid rgba(30,40,70,.16);border-radius:20px;box-shadow:0 24px 70px rgba(20,30,60,.22);overflow:hidden;display:flex;flex-direction:column;}
.cgdModalHead{padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(30,40,70,.12);background:rgba(255,255,255,.75);}
.cgdModalTitle{font-weight:950;font-size:13px;}
.cgdModalBody{padding:12px 14px;overflow:auto;min-height:0;}
.cgdModalFoot{padding:12px 14px;border-top:1px solid rgba(30,40,70,.12);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;background:rgba(255,255,255,.75);}
.cgdInput, .cgdSelect{border:1px solid rgba(30,40,70,.18);border-radius:12px;padding:10px 12px;font-weight:900;font-size:12px;background:rgba(255,255,255,.95);}
.cgdRow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.cgdTable{width:100%;border-collapse:collapse;overflow:hidden;border-radius:14px;border:1px solid rgba(30,40,70,.12);}
.cgdTable th, .cgdTable td{padding:10px 10px;border-bottom:1px solid rgba(30,40,70,.10);font-size:12px;}
.cgdTable th{text-align:left;font-weight:950;background:rgba(245,248,255,.8);}
.cgdTable tr:last-child td{border-bottom:0;}
#listWho.cgdWhoGrid{display:grid!important;grid-template-columns:1fr 1fr;gap:10px;}
@media (max-width:1100px){#listWho.cgdWhoGrid{grid-template-columns:1fr;}}
.bitrix-footer{position:fixed!important;left:0!important;right:0!important;bottom:0!important;top:auto!important;z-index:5!important;}
body{padding-bottom:90px!important;}
@media (max-width:1100px){.cgdGrid{grid-template-columns:1fr;}.cgdTopLeft{min-width:unset;}}
    `;
    st.id = "__cgd_css__";
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
      if(e.target.closest("[data-close-modal]")) closeModal();
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
    newLeads: [],
    pendingTotal: 0,
    stats: { day:0, month:0 },
    userStats: {},
    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] },
    leadStatusMap: {}, // STATUS_ID -> NAME
    savingNext: false,
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

        <div class="cgdBottom">
          <div class="cgdQueueRow" id="queueRow">
            <div class="cgdQueueChip"><b>Fila de atendimento</b></div>
            <button class="cgdBtn" id="btnQueue">FILA</button>
            <div class="cgdQueueChip" id="queueHint">Fila vazia. Clique em FILA e selecione quem entra.</div>
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
  // Data fetch
  // =========================
  async function fetchLeadStatusMap(){
    const list = await bxListAll("crm.status.list", { filter: { ENTITY_ID: "STATUS" } }, 500);
    const map = {};
    (list||[]).forEach(x=>{
      if(x && x.STATUS_ID) map[String(x.STATUS_ID)] = String(x.NAME||x.STATUS_ID);
    });
    state.leadStatusMap = map;
  }

  async function fetchNewLeads(){
    return await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_PENDING_COUNT);
  }

  async function fetchStats(){
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    const dayItems = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO, ">DATE_MODIFY": startToday },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 5000);

    const monthItems = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO, ">DATE_MODIFY": startMonth },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 5000);

    return { day: (dayItems||[]).length, month: (monthItems||[]).length };
  }

  async function fetchUserHistory(userId){
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    const today = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO, ">DATE_MODIFY": startToday },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 5000);

    const month = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId), "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO, ">DATE_MODIFY": startMonth },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 5000);

    const last = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID","TITLE","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID"]
    }, CONFIG.LIMIT_USER_HISTORY);

    return { pulledToday: today.length, pulledMonth: month.length, last };
  }

  async function leadUpdate(id, fields){
    return bx("crm.lead.update", { id: String(id), fields });
  }

  async function actionPickLead(leadId, userId){
    await leadUpdate(leadId, { ASSIGNED_BY_ID: String(userId), STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO });
  }
  async function actionDiscardLead(leadId){
    await leadUpdate(leadId, { STATUS_ID: CONFIG.LEAD_STATUS.PERDIDO });
  }
  async function actionMoveLead(leadId, statusId){
    const fields = { STATUS_ID: statusId };
    if(statusId === CONFIG.LEAD_STATUS.QUALIFICADO){
      const lead = await bx("crm.lead.get", { id: String(leadId) });
      const t = clean(lead?.TITLE);
      if(t && !t.includes(CONFIG.HOT_EMOJI)){
        fields.TITLE = `${CONFIG.HOT_EMOJI} ${t}`.trim();
      }
    }
    await leadUpdate(leadId, fields);
  }

  async function actionSetPrazo(leadId, iso){
    await leadUpdate(leadId, { [CONFIG.UF_PRAZO]: iso });

    if(!CONFIG.FOLLOWUP_DEAL?.ENABLED) return;

    const lead = await bx("crm.lead.get", { id: String(leadId) });
    const assigned = clean(lead?.ASSIGNED_BY_ID);
    const title = clean(lead?.TITLE) || `Lead #${leadId}`;

    const stageByUser = CONFIG.FOLLOWUP_DEAL.STAGE_BY_USER || {};
    const stage = stageByUser[assigned] || clean(CONFIG.FOLLOWUP_DEAL.DEFAULT_STAGE_ID);

    const fields = {
      TITLE: `FOLLOW-UP • ${title}`,
      CATEGORY_ID: CONFIG.FOLLOWUP_DEAL.CATEGORY_ID,
      ASSIGNED_BY_ID: assigned || undefined,
      COMMENTS: `Criado via Painel CGD.\nLead ID: ${leadId}\nPrazo: ${iso}`
    };
    if(stage) fields.STAGE_ID = stage;

    try{
      await bx("crm.deal.add", { fields });
    }catch(err){
      try{
        const f2 = { ...fields };
        delete f2.STAGE_ID;
        await bx("crm.deal.add", { fields: f2 });
      }catch(_){}
    }
  }

  // =========================
  // Queue JSON via Deal
  // =========================
  async function ensureQueueDeal(){
    const items = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        "%TITLE": CONFIG.QUEUE.TITLE_KEY
      },
      order: { ID:"DESC" },
      select: ["ID","TITLE", CONFIG.QUEUE.UF_QUEUE_JSON]
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
    return { dealId: String(deal.ID), ...parseQueue(deal[CONFIG.QUEUE.UF_QUEUE_JSON]) };
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
    const t = clean(it?.TITLE);
    if(t) return t;
    const parts = [it.NAME, it.SECOND_NAME, it.LAST_NAME].filter(Boolean).map(String);
    return parts.join(" ").trim() || `Lead #${it.ID}`;
  }

  function getUF(it, uf){ return clean(it?.[uf]); }

  function badgesFromLead(it){
    const b = [];
    const oper = getUF(it, CONFIG.UF_OPERADORA);
    const idade= getUF(it, CONFIG.UF_IDADE);
    const bairro=getUF(it, CONFIG.UF_BAIRRO);
    const fonte =getUF(it, CONFIG.UF_FONTE);
    const dtLead=getUF(it, CONFIG.UF_DT_LEAD);

    if(oper)  b.push(["OPERADORA", oper]);
    if(idade) b.push(["IDADE", idade]);
    if(bairro)b.push(["BAIRRO", bairro]);
    if(fonte) b.push(["FONTE", fonte]);
    if(dtLead)b.push(["LEAD", fmtDT(dtLead)]);

    const st = clean(it.STATUS_ID);
    if(st){
      b.push(["STAGE", state.leadStatusMap[st] || st]);
    }
    return b.slice(0, 8);
  }

  function renderNewLeads(items){
    const list = $("#listNew");
    if(!list) return;

    const alert = $("#alertNew");
    const btnSoundOn = $("#btnSoundOn");

    list.innerHTML = "";
    if(alert) list.appendChild(alert);

    const has = (items||[]).length > 0;
    if(alert) alert.style.display = has ? "flex" : "none";
    if(btnSoundOn) btnSoundOn.style.display = state.soundOn ? "none" : "inline-block";

    if(!has){
      const empty = document.createElement("div");
      empty.style.opacity = ".75";
      empty.style.fontWeight = "900";
      empty.textContent = "Nenhum lead para mostrar.";
      list.appendChild(empty);
      return;
    }

    const render = items.slice(0, CONFIG.LIMIT_NEW_RENDER);

    render.forEach(it=>{
      const id = String(it.ID||"");
      const title = leadDisplayName(it);
      const badges = badgesFromLead(it).map(([k,v])=> `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`).join("");

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

  function renderStats(){
    $("#pillPending").textContent = `Pendentes: ${state.pendingTotal||0}`;
    $("#pillDay").textContent = `Leads do dia: ${state.stats.day||0}`;
    $("#pillMonth").textContent = `Leads do mês: ${state.stats.month||0}`;
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
      const last1 = us.last?.[0] ? `Último: ${us.last[0].TITLE || ("#"+us.last[0].ID)}` : "Último: —";
      const last2 = us.last?.[1] ? `Anterior: ${us.last[1].TITLE || ("#"+us.last[1].ID)}` : "Anterior: —";

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div style="font-weight:950">${esc(u.name)} <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></div>
          <div style="display:flex; gap:8px; align-items:center">
            <span class="cgdBadge">hoje: ${esc(us.pulledToday||0)}</span>
            <span class="cgdBadge">mês: ${esc(us.pulledMonth||0)}</span>
            <button class="cgdMiniBtn" data-open-user="${esc(u.id)}">Abrir</button>
          </div>
        </div>
        <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">${esc(last1)}</div>
        <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">${esc(last2)}</div>
      `;
      list.appendChild(card);
    });
  }

  function renderQueue(){
    const row = $("#queueRow");
    const hint = $("#queueHint");
    if(!row || !hint) return;

    const keepTitle = row.firstElementChild;
    const keepBtn = $("#btnQueue");
    row.innerHTML = "";
    if(keepTitle) row.appendChild(keepTitle);
    if(keepBtn) row.appendChild(keepBtn);

    const order = state.queue.order || [];
    if(order.length===0){
      hint.textContent = "Fila vazia. Clique em FILA e selecione quem entra.";
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
    openModal("GET (Equipes)", `
      <div style="font-weight:900; opacity:.8; margin-bottom:10px">
        GET (Equipes) — (atalhos/regras podem ser colocados aqui depois).
      </div>
      <div class="cgdRow">
        <button class="cgdBtn" data-close-modal>Ok</button>
      </div>
    `);
  }

  async function modalQueue(){
    let q;
    try{ q = await fetchQueue(); }catch(_){
      return openModal("FILA", `<div style="font-weight:900;color:#a00">Falha ao carregar fila agora.</div>`);
    }
    state.queue = { ...state.queue, ...q };

    const currentSet = new Set((q.order||[]).map(String));
    const body = `
      <div style="font-weight:950; margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>
      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="qAll">Selecionar todas</button>
        <button class="cgdBtn" id="qNone">Limpar</button>
        <button class="cgdBtn" id="qApply">Aplicar alterações</button>
      </div>
      <table class="cgdTable">
        <thead><tr><th>Na fila</th><th>Usuária</th></tr></thead>
        <tbody>
          ${CONFIG.USERS.map(u=>{
            const checked = currentSet.has(String(u.id)) ? "checked" : "";
            return `<tr>
              <td style="width:90px"><input type="checkbox" data-q-user="${esc(u.id)}" ${checked} /></td>
              <td><b>${esc(u.name)}</b> <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
    openModal("FILA", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`);

    $("#qAll")?.addEventListener("click", ()=> $$('input[type=checkbox][data-q-user]').forEach(ch=> ch.checked=true));
    $("#qNone")?.addEventListener("click", ()=> $$('input[type=checkbox][data-q-user]').forEach(ch=> ch.checked=false));

    $("#qApply")?.addEventListener("click", async ()=>{
      const btn = $("#qApply");
      try{
        btn.disabled = true;
        const checked = $$('input[type=checkbox][data-q-user]').filter(ch=>ch.checked).map(ch=> String(ch.getAttribute("data-q-user")));
        const prev = (q.order||[]).map(String);
        const next = [];
        for(const id of prev){ if(checked.includes(id)) next.push(id); }
        for(const id of checked){ if(!next.includes(id)) next.push(id); }
        await saveQueue(q.dealId, { order: next, hiddenUsers: q.hiddenUsers||[] });
        const fresh = await fetchQueue();
        state.queue = { ...state.queue, ...fresh };
        renderQueue(); renderWho();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalHideUsers(){
    let q;
    try{ q = await fetchQueue(); }catch(_){
      return openModal("OCULTAR USUÁRIAS", `<div style="font-weight:900;color:#a00">Falha ao carregar agora.</div>`);
    }
    const hiddenSet = new Set((q.hiddenUsers||[]).map(String));

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Ocultar/mostrar cards (sincroniza em todos os PCs)</div>
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

    $("#huNone")?.addEventListener("click", ()=> $$('input[type=checkbox][data-hu-user]').forEach(ch=> ch.checked=false));

    $("#huApply")?.addEventListener("click", async ()=>{
      const btn = $("#huApply");
      try{
        btn.disabled = true;
        const hidden = $$('input[type=checkbox][data-hu-user]').filter(ch=>ch.checked).map(ch=> String(ch.getAttribute("data-hu-user")));
        await saveQueue(q.dealId, { order: q.order||[], hiddenUsers: hidden });
        const fresh = await fetchQueue();
        state.queue = { ...state.queue, ...fresh };
        renderQueue(); renderWho();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalPickLead(leadId){
    const firstId = state.queue.order?.[0] ? String(state.queue.order[0]) : "";
    const firstName = firstId ? (CONFIG.USERS.find(x=>String(x.id)===firstId)?.name || ("USER "+firstId)) : "";

    const uops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");
    const body = `
      <div style="font-weight:950;margin-bottom:10px">Como você quer pegar este lead?</div>
      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="pickFirst" ${firstId ? "" : "disabled"}>Pegar p/ 1ª da fila ${firstId ? `(${esc(firstName)})` : ""}</button>
      </div>
      <div style="margin:10px 0; font-weight:900; opacity:.65">ou</div>
      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Selecionar usuária:</label>
        <select class="cgdSelect" id="pickUser">${uops}</select>
        <button class="cgdBtn" id="pickGo">Confirmar</button>
      </div>
    `;
    openModal("PEGAR LEAD", body, `<button class="cgdBtn" data-close-modal>Cancelar</button>`);

    $("#pickFirst")?.addEventListener("click", async ()=>{
      const btn = $("#pickFirst");
      try{
        if(!firstId) return;
        btn.disabled = true;

        await actionPickLead(leadId, firstId);

        const q = await fetchQueue();
        const order = (q.order||[]).slice();
        const moved = order.shift();
        if(moved) order.push(moved);
        await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });

        closeModal();
        await hardRefreshAll();
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
        await actionPickLead(leadId, uid);
        closeModal();
        await hardRefreshAll();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalBatchTransfer(){
    const items = state.newLeads || [];
    const ops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote</div>
      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Transferir para:</label>
        <select class="cgdSelect" id="btUser">${ops}</select>
      </div>
      <table class="cgdTable">
        <thead><tr><th style="width:90px">Sel.</th><th>Lead</th><th>Info</th></tr></thead>
        <tbody id="btTbody"></tbody>
      </table>
    `;

    openModal("TRANSFERIR EM LOTE", body, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
      <button class="cgdBtn" id="btDo">Transferir selecionados</button>
    `);

    const tbody = $("#btTbody");
    const render = items.slice(0, 500);
    tbody.innerHTML = render.length ? render.map(it=>{
      const info = badgesFromLead(it).slice(0,5).map(([k,v])=> `${k}: ${v}`).join(" • ");
      return `
        <tr>
          <td><input type="checkbox" data-bt-id="${esc(it.ID)}" checked /></td>
          <td><b>${esc(leadDisplayName(it))}</b> <span style="opacity:.65;font-weight:900">ID: ${esc(it.ID)}</span></td>
          <td style="opacity:.85;font-weight:900">${esc(info)}</td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;

    $("#btDo")?.addEventListener("click", async ()=>{
      const btn = $("#btDo");
      const toId = $("#btUser").value;
      const ids = $$("input[type=checkbox][data-bt-id]", tbody).filter(x=>x.checked).map(x=> x.getAttribute("data-bt-id"));
      if(!ids.length) return;
      try{
        btn.disabled = true;
        for(const id of ids){
          await actionPickLead(id, toId);
          await sleep(120);
        }
        closeModal();
        await hardRefreshAll();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalManageUser(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    let hist = { pulledToday:0, pulledMonth:0, last:[] };
    try{ hist = await fetchUserHistory(u.id); }catch(_){}

    const rows = (hist.last||[]).map(it=>{
      const id = String(it.ID);
      const title = clean(it.TITLE) || `Lead #${id}`;
      const stId = clean(it.STATUS_ID);
      const stName = state.leadStatusMap[stId] || stId || "—";
      const dm = fmtDT(it.DATE_MODIFY);

      return `<tr>
        <td>
          <b>${esc(title)}</b>
          <div style="opacity:.7;font-weight:900;font-size:11px">ID: ${esc(id)} • ${esc(dm||"—")}</div>
        </td>
        <td><span class="cgdBadge">${esc(stName)}</span></td>
        <td>
          <div class="cgdRow">
            <input class="cgdInput" type="datetime-local" data-prazo="${esc(id)}" />
            <button class="cgdBtn" data-save-prazo="${esc(id)}">Salvar</button>
          </div>
        </td>
        <td>
          <div class="cgdRow">
            <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">QUALIFICADO (🔥)</button>
            <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.CONVERTIDO)}">CONVERTIDO</button>
            <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.PERDIDO)}">PERDIDO</button>
          </div>
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="4" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;

    openModal(`GERENCIAR USUÁRIA • ${u.name} (${u.id})`, `
      <div class="cgdRow" style="justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:950">FOLLOW-UP + Mover</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>
      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Atendidos hoje: <b>${esc(hist.pulledToday||0)}</b></div>
        <div class="cgdBadge">Atendidos mês: <b>${esc(hist.pulledMonth||0)}</b></div>
        <div class="cgdBadge">Últimos: <b>${esc((hist.last||[]).length)}</b></div>
      </div>
      <table class="cgdTable">
        <thead><tr><th>Lead</th><th>Stage</th><th>FOLLOW-UP</th><th>Mover</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `);

    $("#muRefresh")?.addEventListener("click", async ()=>{
      closeModal();
      await modalManageUser(userId);
    });

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const sp = e.target.closest("[data-save-prazo]");
      const mv = e.target.closest("[data-move]");
      try{
        if(sp){
          const leadId = sp.getAttribute("data-save-prazo");
          const inp = $(`input[data-prazo="${CSS.escape(leadId)}"]`, $(".cgdModalBody"));
          const iso = isoFromLocalInput(inp?.value || "");
          if(!iso) return;
          sp.disabled = true;
          await actionSetPrazo(leadId, iso);
          await hardRefreshAll();
        }
        if(mv){
          const leadId = mv.getAttribute("data-move");
          const to = mv.getAttribute("data-to");
          mv.disabled = true;
          await actionMoveLead(leadId, to);
          await hardRefreshAll();
        }
      }catch(err){
        console.error(err);
      }finally{
        if(sp) sp.disabled = false;
        if(mv) mv.disabled = false;
      }
    });
  }

  // =========================
  // Refresh
  // =========================
  async function refreshNewLeads(){
    try{
      const all = await fetchNewLeads();
      state.pendingTotal = all.length;
      state.newLeads = all;

      const newest = all?.[0]?.ID ? String(all[0].ID) : null;
      if(all.length>0 && state.soundOn && newest && newest !== state.lastNewLeadId){
        state.lastNewLeadId = newest;
        tripleBeep();
      }

      renderNewLeads(all);
      renderStats();
    }catch(err){
      console.warn(err);
    }
  }

  async function refreshStats(){
    try{
      state.stats = await fetchStats();
      renderStats();
    }catch(err){ console.warn(err); }
  }

  async function refreshUsers(){
    try{
      await Promise.all(CONFIG.USERS.map(async u=>{
        state.userStats[u.id] = await fetchUserHistory(u.id);
      }));
      renderWho();
    }catch(err){ console.warn(err); }
  }

  async function refreshQueue(){
    try{
      const q = await fetchQueue();
      state.queue = { ...state.queue, ...q };
      renderQueue();
      renderWho();
    }catch(err){ console.warn(err); }
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()})`);
    await Promise.allSettled([refreshNewLeads(), refreshStats(), refreshQueue(), refreshUsers()]);
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
    $("#btnSound")?.addEventListener("click", ()=>{ state.soundOn = !state.soundOn; updateSoundUI(); });
    $("#btnSilence")?.addEventListener("click", ()=>{ state.soundOn = false; updateSoundUI(); });
    $("#btnSoundOn")?.addEventListener("click", ()=>{ state.soundOn = true; updateSoundUI(); if((state.newLeads||[]).length>0) tripleBeep(); });

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

    $("#btnBatch")?.addEventListener("click", modalBatchTransfer);
    $("#btnQueue")?.addEventListener("click", modalQueue);
    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);

    $("#btnNext")?.addEventListener("click", async ()=>{
      try{
        const order = (state.queue.order||[]).slice();
        if(order.length===0) return;

        const nextId = order.shift();
        order.push(nextId);

        state.queue.order = order;
        renderQueue();

        const nm = (CONFIG.USERS.find(x=>String(x.id)===String(nextId))||{}).name || ("USER "+nextId);
        setStatus(`Próxima: ${nm} • ${nowBRTime()}`);

        if(state.savingNext) return;
        state.savingNext = true;
        try{
          const dealId = state.queue.dealId || (await fetchQueue()).dealId;
          await saveQueue(dealId, { order, hiddenUsers: state.queue.hiddenUsers||[] });
        }finally{
          state.savingNext = false;
        }
      }catch(err){ console.error(err); }
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      try{
        const q = await fetchQueue();
        await saveQueue(q.dealId, { order: [], hiddenUsers: q.hiddenUsers||[] });
        await refreshQueue();
      }catch(err){ console.error(err); }
    });

    document.addEventListener("click", (e)=>{
      const g = e.target.closest("[data-grab]");
      const d = e.target.closest("[data-discard]");
      const ou = e.target.closest("[data-open-user]");

      if(g) modalPickLead(g.getAttribute("data-grab"));
      if(d){
        const id = d.getAttribute("data-discard");
        (async ()=>{ try{ await actionDiscardLead(id); await hardRefreshAll(); }catch(err){ console.error(err);} })();
      }
      if(ou) modalManageUser(ou.getAttribute("data-open-user"));
    });
  }

  // =========================
  // Start
  // =========================
  async function start(){
    markSentinel(`JS iniciou ✅ • BUILD ${BUILD}`, true);

    if(!CONFIG.WEBHOOK){
      markSentinel("⚠️ CONFIG.WEBHOOK vazio", false);
      return;
    }

    injectCSS();
    mount();
    wire();
    updateSoundUI();

    try{ await fetchLeadStatusMap(); }catch(_){}

    await hardRefreshAll();

    setInterval(refreshNewLeads, CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);
    setInterval(refreshUsers, CONFIG.REFRESH_WHO_MS);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
