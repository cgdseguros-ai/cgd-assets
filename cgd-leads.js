/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - SEM storage do navegador
   - Layout/estética MANTIDOS (não alterar estética)
*/
(function(){
  "use strict";

  const BUILD = "2026-02-18-LEADS-02";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    UF_PRAZO: "UF_CRM_1768175087",

    LEAD_UF: {
      UF_OPERADORA: "UF_CRM_1771282782",
      UF_DT_LEAD: "UF_CRM_1771333014",
      UF_IDADE: "UF_CRM_1771339221",
      UF_BAIRRO: "UF_CRM_LEAD_1731909705398",
      UF_FONTE: "UF_CRM_1767285733843",
    },

    // ✅ FOLLOW-UP cria CARD (DEAL) na PIPELINE 17
    // Ajuste STAGE_ID se necessário (ex.: "C17:NEW" ou seu stage inicial)
    FOLLOWUP_DEAL: {
      ENABLED: true,
      CATEGORY_ID: 17,
      STAGE_ID: "C17:NEW",
      // texto no card (pode manter)
      PREFIX_TITLE: "FOLLOW-UP"
    },

    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",
      UF_QUEUE_JSON: "UF_CRM_1771293519",
      TITLE_KEY: "__QUEUE__CGD__"
    },

    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=e6lxlp1bz9nz",

    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 7000,
    REFRESH_QUEUE_MS: 2500,
    REFRESH_WHO_MS: 6000,

    LIMIT_NEW: 30,
    LIMIT_USER_HISTORY: 80,

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

    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      QUALIFICADO: "PROCESSED",
      PERDIDO: "JUNK",
      CONVERTIDO: "CONVERTED",
    },

    LEAD_SELECT: [
      "ID","TITLE","NAME","LAST_NAME","SECOND_NAME",
      "STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
      "SOURCE_ID","PHONE","EMAIL",
      "ADDRESS_CITY","ADDRESS","ADDRESS_2","ADDRESS_REGION",

      // ✅ seus UFs explícitos
      "UF_CRM_1771282782",
      "UF_CRM_1771333014",
      "UF_CRM_1771339221",
      "UF_CRM_LEAD_1731909705398",
      "UF_CRM_1767285733843",

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
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`;
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
  // UI / CSS (ESTÉTICA MANTIDA)
  // (✅ modal um pouco maior para caber infos no lote)
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
.cgdOffline{
  display:none !important;
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
  width: min(1100px, 98vw); /* ✅ um pouco maior */
  max-height: min(90vh, 980px);
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

/* ✅ QUEM PEGOU HOJE em 2 colunas */
#listWho.cgdWhoGrid{
  display:grid !important;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 1100px){
  #listWho.cgdWhoGrid{ grid-template-columns: 1fr; }
}

/* ===== Forçar rodapé Bitrix no final ===== */
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
    newLeads: [],
    stats: { day:0, month:0 },
    userStats: {},         // cache que não zera em falha
    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] },
    queueLoaded: false,

    // ações offline (RAM)
    pending: [],
    flushing: false,
    netOk: true
  };

  // =========================
  // Helpers de dados
  // =========================
  function pickVal(it, key){
    try{
      const v = it && it[key];
      if(v === null || v === undefined) return "";
      if(Array.isArray(v)) return v.map(String).filter(Boolean).join(", ");
      return String(v);
    }catch(_){ return ""; }
  }

  function leadClientName(it){
    const parts = [it.NAME, it.SECOND_NAME, it.LAST_NAME].filter(Boolean).map(String);
    const nm = parts.join(" ").trim();
    return nm;
  }

  function leadDisplayName(it){
    const nm = leadClientName(it);
    if(nm) return nm;
    const t = String(it.TITLE||"").trim();
    if(t && !/^Lead\s*#\d+/i.test(t)) return t;
    if(t) return t;
    return `Lead #${it.ID}`;
  }

  function badgesFromLead(it){
    const b = [];
    const op = pickVal(it, CONFIG.LEAD_UF.UF_OPERADORA);
    const dt = pickVal(it, CONFIG.LEAD_UF.UF_DT_LEAD);
    const idade = pickVal(it, CONFIG.LEAD_UF.UF_IDADE);
    const bairro = pickVal(it, CONFIG.LEAD_UF.UF_BAIRRO);
    const fonte = pickVal(it, CONFIG.LEAD_UF.UF_FONTE);

    if(op) b.push(["OPERADORA", op]);
    if(idade) b.push(["IDADE", idade]);
    if(bairro) b.push(["BAIRRO", bairro]);
    if(fonte) b.push(["FONTE", fonte]);
    if(dt) b.push(["DT LEAD", String(dt).replace("T"," ").slice(0,16)]);

    return b.slice(0, 6);
  }

  // =========================
  // LEADS: fetch / actions
  // =========================
  async function fetchNewLeads(){
    return await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_NEW);
  }

  // stats “puxados” (IN_PROCESS no período)
  async function fetchStatsPulled(){
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
    }, 20000);

    return { day: (dayItems||[]).length, month: (monthItems||[]).length };
  }

  // ✅ agora pega NAME/LAST_NAME também (pra não virar "Lead #")
  async function fetchUserHistory(userId){
    const startToday = todayISOStart();

    const today = await bxListAll("crm.lead.list", {
      filter: {
        "ASSIGNED_BY_ID": String(userId),
        "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
        ">DATE_MODIFY": startToday
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","NAME","SECOND_NAME","LAST_NAME","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID"]
    }, 5000);

    const last = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","NAME","SECOND_NAME","LAST_NAME","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID"]
    }, CONFIG.LIMIT_USER_HISTORY);

    return { pulledToday: (today||[]).length, last: (last||[]) };
  }

  async function leadUpdate(id, fields){
    return bx("crm.lead.update", { id: String(id), fields });
  }

  // =========================
  // OFFLINE: execução otimista + fila RAM
  // =========================
  function enqueue(job){
    state.pending.push({ t: Date.now(), ...job });
  }

  async function execOptimistic(job, doRemote){
    try{ job?.applyLocal && job.applyLocal(); }catch(_){}
    try{
      await doRemote();
      state.netOk = true;
      flushPending().catch(()=>{});
    }catch(_){
      state.netOk = false;
      enqueue(job);
    }
  }

  async function flushPending(){
    if(state.flushing) return;
    if(!state.pending.length) return;
    state.flushing = true;
    try{
      await bx("app.info", {}); // ping
      const q = state.pending.slice();
      state.pending = [];

      for(const job of q){
        if(job.kind === "lead.update"){
          await leadUpdate(job.payload.id, job.payload.fields);
        }else if(job.kind === "queue.save"){
          if(!state.queue.dealId){
            const fresh = await fetchQueue();
            state.queue = { ...state.queue, ...fresh };
            state.queueLoaded = true;
          }
          await saveQueue(state.queue.dealId, job.payload);
        }else if(job.kind === "deal.add.followup"){
          await bx("crm.deal.add", { fields: job.payload.fields });
        }
        await sleep(120);
      }
    }catch(_){
      // se caiu de novo, mantém o que sobrou (sem duplicar aqui por simplicidade)
      // (não joga popup)
    }finally{
      state.flushing = false;
    }
  }

  // =========================
  // Actions
  // =========================
  async function actionPickLead(lead, userId){
    const leadId = String(lead?.ID || lead);
    const fields = { ASSIGNED_BY_ID: String(userId), STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO };

    await execOptimistic(
      {
        kind: "lead.update",
        payload: { id: leadId, fields },
        applyLocal: ()=>{
          state.newLeads = (state.newLeads||[]).filter(x=>String(x.ID)!==leadId);
          renderNewLeads(state.newLeads);
        }
      },
      async ()=> leadUpdate(leadId, fields)
    );
  }

  async function actionDiscardLead(leadId){
    leadId = String(leadId);
    const fields = { STATUS_ID: CONFIG.LEAD_STATUS.PERDIDO };

    await execOptimistic(
      {
        kind: "lead.update",
        payload: { id: leadId, fields },
        applyLocal: ()=>{
          state.newLeads = (state.newLeads||[]).filter(x=>String(x.ID)!==leadId);
          renderNewLeads(state.newLeads);
        }
      },
      async ()=> leadUpdate(leadId, fields)
    );
  }

  // ✅ mover + emoji 🔥 no MESMO update (sem lead.get)
  async function actionMoveLeadOptimistic(it, statusId){
    const leadId = String(it?.ID || it);
    const curTitle = String(it?.TITLE || "");
    const withHot = (statusId === CONFIG.LEAD_STATUS.QUALIFICADO)
      ? (curTitle.includes(CONFIG.HOT_EMOJI) ? curTitle : `${CONFIG.HOT_EMOJI} ${curTitle || leadDisplayName(it)}`.trim())
      : curTitle;

    const fields = { STATUS_ID: statusId };
    if(statusId === CONFIG.LEAD_STATUS.QUALIFICADO && withHot) fields.TITLE = withHot;

    await execOptimistic(
      {
        kind: "lead.update",
        payload: { id: leadId, fields },
        applyLocal: ()=>{ /* não bloqueia UI */ }
      },
      async ()=> leadUpdate(leadId, fields)
    );
  }

  async function actionSetPrazo(lead, iso, userId){
    const leadId = String(lead?.ID || lead);
    const fields = { [CONFIG.UF_PRAZO]: iso };

    // ✅ 1) atualiza o lead (UF)
    await execOptimistic(
      { kind:"lead.update", payload:{ id: leadId, fields }, applyLocal: ()=>{} },
      async ()=> leadUpdate(leadId, fields)
    );

    // ✅ 2) cria card (deal) na pipeline 17
    if(CONFIG.FOLLOWUP_DEAL && CONFIG.FOLLOWUP_DEAL.ENABLED){
      const leadName = leadDisplayName(lead || { ID: leadId });
      const title = `${CONFIG.FOLLOWUP_DEAL.PREFIX_TITLE} • ${leadName}`.trim();

      const dealFields = {
        CATEGORY_ID: CONFIG.FOLLOWUP_DEAL.CATEGORY_ID,
        STAGE_ID: CONFIG.FOLLOWUP_DEAL.STAGE_ID,
        TITLE: title,
        ASSIGNED_BY_ID: String(userId || lead?.ASSIGNED_BY_ID || ""),
        COMMENTS: `Lead ID: ${leadId}\nPrazo: ${iso}`
      };

      await execOptimistic(
        { kind:"deal.add.followup", payload:{ fields: dealFields }, applyLocal: ()=>{} },
        async ()=> bx("crm.deal.add", { fields: dealFields })
      );
    }
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
  // Render
  // =========================
  function renderNewLeads(items){
    const list = $("#listNew");
    if(!list) return;

    const alert = $("#alertNew");
    const offline = $("#offlineNew");
    const btnSoundOn = $("#btnSoundOn");

    list.innerHTML = "";
    if(alert) list.appendChild(alert);
    if(offline) list.appendChild(offline);

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

    (items||[]).forEach(it=>{
      const id = String(it.ID||"");
      const title = leadDisplayName(it);

      const card = document.createElement("div");
      card.className = "cgdCard";

      const badges = badgesFromLead(it).map(([k,v]) =>
        `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`
      ).join("");

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
      const us = state.userStats[u.id] || { pulledToday:0, last:[] };

      const l1 = us.last && us.last[0] ? us.last[0] : null;
      const l2 = us.last && us.last[1] ? us.last[1] : null;

      const last1 = l1 ? `Último: ${leadDisplayName(l1)}`
        : "Último: —";
      const last2 = l2 ? `Anterior: ${leadDisplayName(l2)}`
        : "Anterior: —";

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div style="font-weight:950">${esc(u.name)} <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></div>
          <div style="display:flex; gap:8px; align-items:center">
            <span class="cgdBadge">puxados hoje: ${esc(us.pulledToday||0)}</span>
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

  function renderQueue(){
    const row = $("#queueRow");
    const hint = $("#queueHint");
    if(!row || !hint) return;

    const keep = row.firstElementChild;
    row.innerHTML = "";
    if(keep) row.appendChild(keep);

    const order = state.queue.order || [];
    if(order.length === 0){
      hint.textContent = "Fila vazia. Clique em Fila e selecione quem entra.";
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
              <div class="cgdOffline" id="offlineNew">Sem conexão agora. Mantendo os dados atuais.</div>
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
            <div class="cgdQueueChip" id="queueOpen" style="cursor:pointer"><b>Fila de atendimento</b></div>
            <div class="cgdQueueChip" id="queueHint">Fila vazia. Clique em Fila e selecione quem entra.</div>
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
  // Modals
  // =========================
  function modalGetEquipes(){
    openModal("GET (Equipes)", `
      <div style="font-weight:900; opacity:.8; margin-bottom:10px">
        GET (Equipes) — (atalhos/regras podem ser colocados aqui depois).
      </div>
      <div class="cgdRow"><button class="cgdBtn" data-close-modal>Ok</button></div>
    `);
  }

  // ✅ FILA com reorder manual (↑ ↓)
  async function modalQueue(){
    // tenta rede, mas se falhar usa cache SEM atrapalhar
    let q = null;
    try{
      q = await fetchQueue();
      state.queue = { ...state.queue, ...q };
      state.queueLoaded = true;
    }catch(_){
      q = { dealId: state.queue.dealId, order: state.queue.order||[], hiddenUsers: state.queue.hiddenUsers||[], updatedAt: state.queue.updatedAt||0 };
    }

    const body = `
      <div style="font-weight:950; margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="qAll">Selecionar todas</button>
        <button class="cgdBtn" id="qNone">Limpar</button>
        <button class="cgdBtn" id="qApply">Aplicar alterações</button>
      </div>

      <table class="cgdTable">
        <thead><tr><th style="width:90px">Na fila</th><th>Usuária</th><th style="width:110px">Ordem</th></tr></thead>
        <tbody id="qTbody"></tbody>
      </table>

      <div style="margin-top:10px;font-size:11px;font-weight:900;opacity:.7">
        Atualizado: ${q.updatedAt ? new Date(q.updatedAt).toLocaleString("pt-BR") : "—"}
      </div>
    `;

    openModal("FILA", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`);

    const tbody = $("#qTbody");

    function currentCheckedOrder(){
      const checked = $$('input[type=checkbox][data-q-user]')
        .filter(ch=>ch.checked)
        .map(ch=> String(ch.getAttribute("data-q-user")));

      // ordem estável: primeiro a ordem atual, depois adicionadas
      const prev = (state.queue.order||[]).map(String);
      const next = [];
      for(const id of prev){ if(checked.includes(id)) next.push(id); }
      for(const id of checked){ if(!next.includes(id)) next.push(id); }
      return next;
    }

    function renderTable(){
      const set = new Set((state.queue.order||[]).map(String));
      tbody.innerHTML = CONFIG.USERS.map(u=>{
        const checked = set.has(String(u.id)) ? "checked" : "";
        const idx = (state.queue.order||[]).map(String).indexOf(String(u.id));
        const inOrder = idx >= 0;
        return `<tr>
          <td><input type="checkbox" data-q-user="${esc(u.id)}" ${checked} /></td>
          <td><b>${esc(u.name)}</b> <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></td>
          <td>
            ${inOrder ? `
              <button class="cgdBtn" style="padding:6px 10px" data-q-up="${esc(u.id)}">↑</button>
              <button class="cgdBtn" style="padding:6px 10px" data-q-down="${esc(u.id)}">↓</button>
            ` : `<span style="opacity:.6;font-weight:900">—</span>`}
          </td>
        </tr>`;
      }).join("");
    }

    renderTable();

    $("#qAll")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-q-user]').forEach(ch => ch.checked = true);
      state.queue.order = CONFIG.USERS.map(u=>String(u.id));
      renderTable();
    });
    $("#qNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-q-user]').forEach(ch => ch.checked = false);
      state.queue.order = [];
      renderTable();
    });

    tbody?.addEventListener("change", (e)=>{
      const ch = e.target.closest('input[type=checkbox][data-q-user]');
      if(!ch) return;
      state.queue.order = currentCheckedOrder();
      renderTable();
      renderQueue();
      renderWho();
    });

    tbody?.addEventListener("click", (e)=>{
      const up = e.target.closest("[data-q-up]");
      const down = e.target.closest("[data-q-down]");
      if(up || down){
        const id = String((up||down).getAttribute(up ? "data-q-up" : "data-q-down"));
        const arr = (state.queue.order||[]).map(String);
        const i = arr.indexOf(id);
        if(i<0) return;

        if(up && i>0){
          const tmp = arr[i-1]; arr[i-1]=arr[i]; arr[i]=tmp;
        }
        if(down && i<arr.length-1){
          const tmp = arr[i+1]; arr[i+1]=arr[i]; arr[i]=tmp;
        }
        state.queue.order = arr;
        renderTable();
        renderQueue();
        renderWho();
      }
    });

    $("#qApply")?.addEventListener("click", async ()=>{
      const btn = $("#qApply");
      try{
        btn.disabled = true;
        const payload = { order: (state.queue.order||[]).map(String), hiddenUsers: (state.queue.hiddenUsers||[]).map(String) };

        await execOptimistic(
          {
            kind:"queue.save",
            payload,
            applyLocal: ()=>{
              renderQueue();
              renderWho();
              setStatus(`Atualizado: ${nowBRTime()} • v${BUILD}`);
            }
          },
          async ()=>{
            if(!state.queue.dealId){
              const fresh = await fetchQueue();
              state.queue = { ...state.queue, ...fresh };
              state.queueLoaded = true;
            }
            await saveQueue(state.queue.dealId, payload);
          }
        );
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function modalHideUsers(){
    let q = null;
    try{
      q = await fetchQueue();
      state.queue = { ...state.queue, ...q };
      state.queueLoaded = true;
    }catch(_){
      q = { dealId: state.queue.dealId, order: state.queue.order||[], hiddenUsers: state.queue.hiddenUsers||[] };
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

        const payload = { order: (state.queue.order||[]).map(String), hiddenUsers: hidden };

        await execOptimistic(
          { kind:"queue.save", payload, applyLocal: ()=>{
            state.queue.hiddenUsers = hidden;
            renderQueue(); renderWho();
            setStatus(`Atualizado: ${nowBRTime()} • v${BUILD}`);
          }},
          async ()=>{
            if(!state.queue.dealId){
              const fresh = await fetchQueue();
              state.queue = { ...state.queue, ...fresh };
              state.queueLoaded = true;
            }
            await saveQueue(state.queue.dealId, payload);
          }
        );
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ✅ ABRIR sempre abre: se rede falhar, usa cache state.userStats[userId]
  async function modalManageUser(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    let hist = null;
    try{
      hist = await fetchUserHistory(u.id);
      state.userStats[u.id] = hist; // atualiza cache
    }catch(_){
      hist = state.userStats[u.id] || { pulledToday:0, last:[] };
    }

    const body = `
      <div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:950">FOLLOW-UP + Transferências + Ações em lote</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Puxados hoje: <b>${esc(hist.pulledToday||0)}</b></div>
        <div class="cgdBadge">Últimos encontrados: <b>${esc((hist.last||[]).length)}</b></div>
      </div>

      <div class="cgdRow" style="margin-bottom:12px">
        <input class="cgdInput" id="muSearch" placeholder="Buscar por palavra-chave…" style="min-width:260px" />
        <select class="cgdSelect" id="muFilter">
          <option value="ALL">Todos</option>
          <option value="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">Somente QUALIFICADOS</option>
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
            <th>FOLLOW-UP (1)</th>
            <th>Transferir (1)</th>
          </tr>
        </thead>
        <tbody id="muTbody"></tbody>
      </table>
    `;

    openModal(`GERENCIAR USUÁRIA • ${u.name} (${u.id})`, body);

    const tbody = $("#muTbody");
    const search = $("#muSearch");
    const filter = $("#muFilter");

    function rowTitle(it){
      const base = leadDisplayName(it);
      const isQual = String(it.STATUS_ID||"") === String(CONFIG.LEAD_STATUS.QUALIFICADO);
      const hasHot = String(it.TITLE||"").includes(CONFIG.HOT_EMOJI);
      if(isQual || hasHot) return `${CONFIG.HOT_EMOJI} ${base}`.trim();
      return base;
    }

    function renderRows(){
      const q = (search.value||"").trim().toLowerCase();
      const f = (filter.value||"ALL");

      const list = (hist.last||[]).filter(it=>{
        const t = (leadDisplayName(it) + " " + String(it.TITLE||"")).toLowerCase();
        if(q && !t.includes(q)) return false;
        if(f!=="ALL" && String(it.STATUS_ID) !== String(f)) return false;
        return true;
      });

      const userOptions = CONFIG.USERS
        .filter(x=> String(x.id)!==String(u.id))
        .map(x=> `<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.id)})</option>`)
        .join("");

      tbody.innerHTML = list.length ? list.map(it=>{
        const id = String(it.ID);
        const title = rowTitle(it);
        const dm = (it.DATE_MODIFY||"").replace("T"," ").slice(0,19);
        const status = String(it.STATUS_ID||"—");

        return `<tr data-row="${esc(id)}">
          <td><input type="checkbox" data-sel="${esc(id)}" /></td>
          <td>
            <b>${esc(title)}</b>
            <div style="opacity:.7;font-weight:900;font-size:11px">ID: ${esc(id)} • ${esc(dm||"—")} • STATUS: ${esc(status)}</div>
          </td>
          <td>
            <div class="cgdRow">
              <input class="cgdInput" type="datetime-local" data-prazo="${esc(id)}" />
              <button class="cgdBtn" data-save-prazo="${esc(id)}">Salvar</button>
            </div>
          </td>
          <td>
            <div class="cgdRow">
              <select class="cgdSelect" data-move-to="${esc(id)}">${userOptions}</select>
              <button class="cgdBtn" data-do-transfer="${esc(id)}">Transferir</button>
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
    filter?.addEventListener("change", renderRows);

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

    // lote follow-up (✅ cria deal na pipeline 17)
    $("#muBulkPrazo")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const iso = isoFromLocalInput($("#muBulkDate")?.value || "");
      if(!iso) return alert("Preencha a data/hora do FOLLOW-UP.");
      try{
        $("#muBulkPrazo").disabled = true;
        for(const id of ids){
          const obj = (hist.last||[]).find(x=>String(x.ID)===String(id)) || { ID:id, ASSIGNED_BY_ID: u.id };
          await actionSetPrazo(obj, iso, u.id);
          await sleep(120);
        }
        await hardRefreshAll();
        alert("FOLLOW-UP em lote salvo ✅");
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel.");
      }finally{
        $("#muBulkPrazo").disabled = false;
      }
    });

    // lote mover stage (✅ offline-friendly)
    $("#muBulkMove")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const to = $("#muMoveTo")?.value;
      if(!to) return;
      try{
        $("#muBulkMove").disabled = true;
        for(const id of ids){
          const obj = (hist.last||[]).find(x=>String(x.ID)===String(id)) || { ID:id, TITLE:"" };
          await actionMoveLeadOptimistic(obj, to);
          await sleep(140);
        }
        await hardRefreshAll();
        alert("Movimento em lote concluído ✅");
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel.");
      }finally{
        $("#muBulkMove").disabled = false;
      }
    });

    // ações individuais
    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const sp = e.target.closest("[data-save-prazo]");
      const tf = e.target.closest("[data-do-transfer]");
      try{
        if(sp){
          const leadId = sp.getAttribute("data-save-prazo");
          const inp = $(`input[data-prazo="${CSS.escape(leadId)}"]`, $(".cgdModalBody"));
          const iso = isoFromLocalInput(inp?.value || "");
          if(!iso) return alert("Preencha data/hora corretamente.");
          sp.disabled = true;
          const obj = (hist.last||[]).find(x=>String(x.ID)===String(leadId)) || { ID:leadId, ASSIGNED_BY_ID: u.id };
          await actionSetPrazo(obj, iso, u.id);
          await hardRefreshAll();
          alert("Prazo salvo ✅");
        }
        if(tf){
          const leadId = tf.getAttribute("data-do-transfer");
          const sel = $(`select[data-move-to="${CSS.escape(leadId)}"]`, $(".cgdModalBody"));
          const toId = sel?.value;
          if(!toId) return;
          tf.disabled = true;

          await execOptimistic(
            { kind:"lead.update", payload:{ id: leadId, fields:{ ASSIGNED_BY_ID: String(toId) } }, applyLocal: ()=>{} },
            async ()=> leadUpdate(leadId, { ASSIGNED_BY_ID: String(toId) })
          );

          await hardRefreshAll();
          alert("Transferido ✅");
        }
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel.");
      }finally{
        if(sp) sp.disabled = false;
        if(tf) tf.disabled = false;
      }
    });
  }

  // ✅ TRANSFERIR EM LOTE agora mostra badges com as infos pedidas
  async function modalBatchTransfer(){
    const items = state.newLeads || [];
    const ops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Buscar (título/nome):</label>
        <input class="cgdInput" id="btSearch" placeholder="Ex.: MEDSENIOR" />
        <label style="font-weight:950">Transferir para:</label>
        <select class="cgdSelect" id="btUser">${ops}</select>
        <button class="cgdBtn" id="btApply">Aplicar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Leads listados: <b id="btCount">${esc(items.length)}</b></div>
      </div>

      <table class="cgdTable">
        <thead><tr><th style="width:90px">Sel.</th><th>Lead</th></tr></thead>
        <tbody id="btTbody"></tbody>
      </table>
    `;

    openModal("TRANSFERIR EM LOTE", body, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
      <button class="cgdBtn" id="btDo">Transferir selecionados</button>
    `);

    const tbody = $("#btTbody");
    const countEl = $("#btCount");

    function draw(list){
      countEl.textContent = String(list.length);
      tbody.innerHTML = list.length ? list.map(it=>{
        const badges = badgesFromLead(it).map(([k,v]) =>
          `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`
        ).join("");
        return `
          <tr>
            <td><input type="checkbox" data-bt-id="${esc(it.ID)}" checked /></td>
            <td>
              <b>${esc(leadDisplayName(it))}</b> <span style="opacity:.65;font-weight:900">ID: ${esc(it.ID)}</span>
              <div class="cgdBadges" style="margin-top:6px">${badges}</div>
            </td>
          </tr>
        `;
      }).join("") : `<tr><td colspan="2" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    draw(items);

    $("#btApply")?.addEventListener("click", ()=>{
      const q = ($("#btSearch").value||"").trim().toUpperCase();
      if(!q) return draw(items);
      draw(items.filter(it=>{
        const t = (leadDisplayName(it) + " " + String(it.TITLE||"")).toUpperCase();
        return t.includes(q);
      }));
    });

    $("#btDo")?.addEventListener("click", async ()=>{
      const toId = $("#btUser").value;
      const ids = $$("input[type=checkbox][data-bt-id]", tbody)
        .filter(x=>x.checked)
        .map(x=> x.getAttribute("data-bt-id"));

      if(ids.length === 0) return alert("Selecione pelo menos 1 lead.");
      try{
        $("#btDo").disabled = true;
        for(const id of ids){
          const obj = (items||[]).find(x=>String(x.ID)===String(id)) || { ID:id };
          await actionPickLead(obj, toId);
          await sleep(150);
        }
        closeModal();
        await hardRefreshAll();
        alert("Transferência concluída ✅");
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel.");
      }finally{
        $("#btDo").disabled = false;
      }
    });
  }

  // PEGAR: selecionar usuária OU pegar p/ 1ª da fila
  async function modalPickLead(leadId){
    const leadObj = (state.newLeads||[]).find(x=>String(x.ID)===String(leadId)) || { ID:leadId };

    const uops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");
    openModal("PEGAR LEAD", `
      <div style="font-weight:950;margin-bottom:10px">Escolha como pegar este lead</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Selecionar usuária:</label>
        <select class="cgdSelect" id="pickUser">${uops}</select>
      </div>

      <div style="font-size:11px;font-weight:900;opacity:.75">
        Ao pegar: muda responsável e envia para <b>EM ATENDIMENTO</b>.
      </div>
    `, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
      <button class="cgdBtn" id="pickQueue">Pegar p/ 1ª da fila</button>
      <button class="cgdBtn" id="pickGo">Confirmar</button>
    `);

    $("#pickGo")?.addEventListener("click", async ()=>{
      try{
        const uid = $("#pickUser").value;
        $("#pickGo").disabled = true;
        await actionPickLead(leadObj, uid);
        closeModal();
        await hardRefreshAll();
      }finally{
        $("#pickGo").disabled = false;
      }
    });

    $("#pickQueue")?.addEventListener("click", async ()=>{
      try{
        $("#pickQueue").disabled = true;
        if(!state.queueLoaded) await refreshQueue();
        const first = (state.queue.order||[])[0];
        if(!first) return alert("Fila vazia.");

        await actionPickLead(leadObj, first);

        // rotaciona localmente
        const order = (state.queue.order||[]).slice();
        const x = order.shift();
        order.push(x);
        state.queue.order = order;
        renderQueue(); renderWho();

        await execOptimistic(
          { kind:"queue.save", payload:{ order, hiddenUsers: state.queue.hiddenUsers||[] }, applyLocal: ()=>{} },
          async ()=>{
            if(!state.queue.dealId){
              const fresh = await fetchQueue();
              state.queue = { ...state.queue, ...fresh };
              state.queueLoaded = true;
            }
            await saveQueue(state.queue.dealId, { order, hiddenUsers: state.queue.hiddenUsers||[] });
          }
        );

        closeModal();
        await hardRefreshAll();
      }finally{
        $("#pickQueue").disabled = false;
      }
    });
  }

  // =========================
  // Refresh
  // =========================
  async function refreshNewLeads(){
    try{
      const items = await fetchNewLeads();
      state.netOk = true;

      const newest = items && items[0] ? String(items[0].ID) : null;
      if((items||[]).length > 0 && state.soundOn){
        if(newest && newest !== state.lastNewLeadId){
          state.lastNewLeadId = newest;
          tripleBeep();
        }
      }

      state.newLeads = items || [];
      renderNewLeads(state.newLeads);

      flushPending().catch(()=>{});
    }catch(_){
      state.netOk = false;
    }
  }

  async function refreshStats(){
    try{
      const s = await fetchStatsPulled();
      state.stats = s;
      renderStats(s);
    }catch(_){}
  }

  // ✅ não apaga cache em falha
  async function refreshUsers(){
    const jobs = CONFIG.USERS.map(async u=>{
      try{
        const h = await fetchUserHistory(u.id);
        state.userStats[u.id] = h;
      }catch(_){
        // mantém o que já tinha
      }
    });
    await Promise.allSettled(jobs);
    renderWho();
  }

  async function refreshQueue(){
    try{
      const q = await fetchQueue();
      state.queue = { ...state.queue, ...q };
      state.queueLoaded = true;
      renderQueue();
      renderWho();
    }catch(_){
      // mantém cache
      renderQueue();
      renderWho();
    }
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()}) • v${BUILD}`);
    await Promise.allSettled([refreshNewLeads(), refreshStats(), refreshUsers(), refreshQueue()]);
    setStatus(`Atualizado: ${nowBRTime()} • v${BUILD}`);
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
      if((state.newLeads||[]).length > 0) tripleBeep();
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

    $("#queueOpen")?.addEventListener("click", modalQueue);
    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);

    $("#btnBatch")?.addEventListener("click", modalBatchTransfer);

    $("#btnNext")?.addEventListener("click", async ()=>{
      if(!state.queueLoaded) await refreshQueue();
      const order = (state.queue.order||[]).slice();
      if(order.length===0) return;

      const nextId = order.shift();
      order.push(nextId);

      state.queue.order = order;
      renderQueue(); renderWho();

      setStatus(`Próxima: ${(CONFIG.USERS.find(x=>String(x.id)===String(nextId))||{}).name || ("USER "+nextId)} • ${nowBRTime()} • v${BUILD}`);

      await execOptimistic(
        { kind:"queue.save", payload:{ order, hiddenUsers: state.queue.hiddenUsers||[] }, applyLocal: ()=>{} },
        async ()=>{
          if(!state.queue.dealId){
            const fresh = await fetchQueue();
            state.queue = { ...state.queue, ...fresh };
            state.queueLoaded = true;
          }
          await saveQueue(state.queue.dealId, { order, hiddenUsers: state.queue.hiddenUsers||[] });
        }
      );
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      if(!state.queueLoaded) await refreshQueue();
      const order = [];
      state.queue.order = [];
      renderQueue(); renderWho();

      await execOptimistic(
        { kind:"queue.save", payload:{ order, hiddenUsers: state.queue.hiddenUsers||[] }, applyLocal: ()=>{} },
        async ()=>{
          if(!state.queue.dealId){
            const fresh = await fetchQueue();
            state.queue = { ...state.queue, ...fresh };
            state.queueLoaded = true;
          }
          await saveQueue(state.queue.dealId, { order, hiddenUsers: state.queue.hiddenUsers||[] });
        }
      );
    });

    document.addEventListener("click", (e)=>{
      const g = e.target.closest("[data-grab]");
      const d = e.target.closest("[data-discard]");
      const ou = e.target.closest("[data-open-user]");

      if(g){
        modalPickLead(g.getAttribute("data-grab"));
      }
      if(d){
        const id = d.getAttribute("data-discard");
        actionDiscardLead(id).then(hardRefreshAll).catch(()=>{});
      }
      if(ou){
        modalManageUser(ou.getAttribute("data-open-user"));
      }
    });
  }

  // =========================
  // Start
  // =========================
  async function start(){
    const sentinel = document.getElementById("cgd-sentinel");
    if(sentinel) sentinel.textContent = `JS iniciou ✅ v${BUILD}`;

    injectCSS();
    mount();
    wire();
    updateSoundUI();

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
