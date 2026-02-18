/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - SEM storage do navegador (somente RAM)
   - Layout/estética MANTIDOS
*/
(function(){
  "use strict";

  const BUILD = "2026-02-18-LEADS-04";

  // =========================
  // CONFIG
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

    FOLLOWUP_DEAL: {
      ENABLED: true,
      CATEGORY_ID: 17,
      STAGE_ID_FALLBACK: "C17:NEW",
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
    REFRESH_STATS_MS: 8000,
    REFRESH_QUEUE_MS: 2500,
    REFRESH_WHO_MS: 9000,
    REFRESH_PENDING_COUNT_MS: 12000,

    LIMIT_NEW_RENDER: 30,     // exibidos
    LIMIT_NEW_FETCH: 5000,    // contagem total / filtros
    LIMIT_STAGEHIST: 120,
    LIMIT_USER_HISTORY: 20,

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

    // defaults (auto-ajustados via crm.status.list)
    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      QUALIFICADO: "PROCESSED",
      PERDIDO: "JUNK",
      CONVERTIDO: "CONVERTED",
    },

    LEAD_SELECT_MIN: [
      "ID","TITLE","NAME","LAST_NAME","SECOND_NAME",
      "STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
      CONFIG.LEAD_UF.UF_OPERADORA,
      CONFIG.LEAD_UF.UF_DT_LEAD,
      CONFIG.LEAD_UF.UF_IDADE,
      CONFIG.LEAD_UF.UF_BAIRRO,
      CONFIG.LEAD_UF.UF_FONTE,
      "PHONE","EMAIL"
    ],

    LEAD_SELECT_FULL: [
      "ID","TITLE","NAME","LAST_NAME","SECOND_NAME",
      "STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
      "SOURCE_ID","PHONE","EMAIL",
      CONFIG.LEAD_UF.UF_OPERADORA,
      CONFIG.LEAD_UF.UF_DT_LEAD,
      CONFIG.LEAD_UF.UF_IDADE,
      CONFIG.LEAD_UF.UF_BAIRRO,
      CONFIG.LEAD_UF.UF_FONTE,
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
  function ymd(d=new Date()){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da= String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }
  function todayISOStart(){
    return `${ymd()}T00:00:00`;
  }
  function todayISOEnd(){
    return `${ymd()}T23:59:59`;
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
  function isoDateStart(v){ // yyyy-mm-dd -> yyyy-mm-ddT00:00:00
    if(!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return "";
    return `${m[1]}-${m[2]}-${m[3]}T00:00:00`;
  }
  function isoDateEnd(v){ // yyyy-mm-dd -> yyyy-mm-ddT23:59:59
    if(!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return "";
    return `${m[1]}-${m[2]}-${m[3]}T23:59:59`;
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

  async function bxTry(method, params={}, tries=2, gap=220){
    let err;
    for(let i=0;i<tries;i++){
      try{
        return await bx(method, params);
      }catch(e){
        err = e;
        await sleep(gap);
      }
    }
    throw err;
  }

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
  // Runtime caches (RAM)
  // =========================
  const cache = {
    leadStatusReady: false,
    leadStatusByName: {},      // NAME_UPPER -> STATUS_ID
    leadStatusNameById: {},    // STATUS_ID -> NAME
    dealStagesByCategory: {},  // categoryId -> [{id,name}]
  };

  const state = {
    soundOn: true,
    lastNewLeadId: null,

    // ✅ pendentes totais (Bitrix)
    pendingTotal: 0,

    // ✅ lista renderizada (recortada)
    newLeads: [],

    // ✅ stats topo (criados no dia/mês)
    stats: { day:0, month:0 },

    userStats: {}, // userId -> {pulledToday, pulledMonth, last:[lead objects]}
    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] },
    queueLoaded: false,

    pending: [],
    flushing: false,
    netOk: true
  };

  // =========================
  // Helpers dados
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
    if(t) return t;
    return `Lead #${it.ID}`;
  }

  function stageNameFromId(statusId){
    const id = String(statusId||"");
    return cache.leadStatusNameById[id] || id || "—";
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
  // OFFLINE: fila RAM (sem storage)
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
      await bxTry("app.info", {}, 1, 0); // ping
      const q = state.pending.slice();
      state.pending = [];

      for(const job of q){
        if(job.kind === "lead.update"){
          await bx("crm.lead.update", { id: String(job.payload.id), fields: job.payload.fields });
        }else if(job.kind === "lead.add"){
          await bx("crm.lead.add", { fields: job.payload.fields });
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
      // silencioso
    }finally{
      state.flushing = false;
    }
  }

  // =========================
  // Auto-resolve Lead Status IDs (QUALIFICADO etc.)
  // =========================
  async function ensureLeadStatusMap(){
    if(cache.leadStatusReady) return;
    try{
      const list = await bxTry("crm.status.list", { filter:{ ENTITY_ID:"STATUS" } }, 2, 250);
      const up = (s)=> String(s||"").trim().toUpperCase();
      const byName = {};
      const nameById = {};
      (list||[]).forEach(it=>{
        const name = up(it.NAME);
        const id = String(it.STATUS_ID || it.ID || "");
        if(name && id){
          byName[name] = id;
          nameById[id] = String(it.NAME || id);
        }
      });
      cache.leadStatusByName = byName;
      cache.leadStatusNameById = nameById;

      const pick = (keys)=>{
        for(const k of keys){
          const kk = Object.keys(byName).find(n => n.includes(k));
          if(kk) return byName[kk];
        }
        return "";
      };

      const q = pick(["QUALIFIC", "QUALIF"]);
      const ip = pick(["ATEND", "PROCESS", "EM ANDAMENTO", "IN PROCESS"]);
      const nw = pick(["NOVO", "NEW"]);
      const pj = pick(["PERD", "JUNK"]);
      const cv = pick(["CONVERT", "CONVERTIDO"]);

      if(nw) CONFIG.LEAD_STATUS.NOVO_LEAD = nw;
      if(ip) CONFIG.LEAD_STATUS.EM_ATENDIMENTO = ip;
      if(q)  CONFIG.LEAD_STATUS.QUALIFICADO = q;
      if(pj) CONFIG.LEAD_STATUS.PERDIDO = pj;
      if(cv) CONFIG.LEAD_STATUS.CONVERTIDO = cv;

      cache.leadStatusReady = true;
    }catch(_){
      cache.leadStatusReady = true;
    }
  }

  // =========================
  // Deal stages list (Pipeline 17) — mais confiável
  // =========================
  async function getDealStages(categoryId){
    const key = String(categoryId);
    if(cache.dealStagesByCategory[key]) return cache.dealStagesByCategory[key];

    // 1) tenta crm.dealcategory.stage.list
    try{
      const r = await bxTry("crm.dealcategory.stage.list", { id: String(categoryId) }, 2, 250);
      const stages = (r||[]).map(it=>({
        id: String(it.STATUS_ID || it.ID || ""),
        name: String(it.NAME || "")
      })).filter(x=>x.id);
      cache.dealStagesByCategory[key] = stages;
      return stages;
    }catch(_){}

    // 2) fallback: crm.status.list
    try{
      const list = await bxTry("crm.status.list", {
        filter:{ ENTITY_ID:"DEAL_STAGE", CATEGORY_ID: String(categoryId) }
      }, 2, 250);

      const stages = (list||[]).map(it=>({
        id: String(it.STATUS_ID || it.ID || ""),
        name: String(it.NAME || "")
      })).filter(x=>x.id);

      cache.dealStagesByCategory[key] = stages;
      return stages;
    }catch(_){
      cache.dealStagesByCategory[key] = [];
      return [];
    }
  }

  function findStageIdForUser(stages, userName){
    const up = (s)=> String(s||"").toUpperCase().trim();
    const target = up(userName);

    let hit = stages.find(s => up(s.name).includes(target));
    if(hit) return hit.id;

    const t2 = target.replace(/\s+/g,"");
    hit = stages.find(s => up(s.name).replace(/\s+/g,"").includes(t2));
    return hit ? hit.id : "";
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
  // CSS (ESTÉTICA MANTIDA) — idem versão anterior
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
.cgdOffline{ display:none !important; }

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
  width: min(1100px, 98vw);
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
  // LEADS: queries (Bitrix)
  // =========================
  async function fetchNewLeadsForRender(){
    await ensureLeadStatusMap();
    const items = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: CONFIG.LEAD_SELECT_FULL
    }, CONFIG.LIMIT_NEW_RENDER);
    return items || [];
  }

  async function fetchPendingTotal(){
    await ensureLeadStatusMap();
    const ids = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID:"DESC" },
      select: ["ID"]
    }, CONFIG.LIMIT_NEW_FETCH);
    state.pendingTotal = (ids||[]).length;
  }

  async function fetchNewLeadsFilteredFromBitrix(operadora, dtDeISO, dtAteISO){
    await ensureLeadStatusMap();
    const f = { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD };

    if(operadora){
      // filtro exato (campo UF texto)
      f[CONFIG.LEAD_UF.UF_OPERADORA] = operadora;
    }
    // filtro por data do lead (campo datetime)
    if(dtDeISO){
      f[">="+CONFIG.LEAD_UF.UF_DT_LEAD] = dtDeISO;
    }
    if(dtAteISO){
      f["<="+CONFIG.LEAD_UF.UF_DT_LEAD] = dtAteISO;
    }

    const items = await bxListAll("crm.lead.list", {
      filter: f,
      order: { ID:"DESC" },
      select: CONFIG.LEAD_SELECT_FULL
    }, CONFIG.LIMIT_NEW_FETCH);

    return items || [];
  }

  // =========================
  // Stage history (para atendidos dia/mês + últimos atendidos)
  // =========================
  async function stageHistoryList(filter, limit=120){
    // tenta variações comuns; se falhar, retorna null
    try{
      const r = await bxTry("crm.stagehistory.list", {
        filter,
        order: { "CREATED_TIME": "DESC" },
        select: ["OWNER_ID","CREATED_TIME","RESPONSIBLE_ID","ASSIGNED_BY_ID","STAGE_ID"]
      }, 1, 0);

      const items = (r && (r.items || r)) || [];
      return items.slice(0, limit);
    }catch(_){
      return null;
    }
  }

  async function fetchUserByStageHistory(userId){
    await ensureLeadStatusMap();

    const stDay = todayISOStart();
    const endDay = todayISOEnd();
    const stMonth = monthISOStart();
    const nowIso = new Date().toISOString().slice(0,19);

    // contagem dia/mês por “entrada em EM_ATENDIMENTO”
    const dayItems = await stageHistoryList({
      "ENTITY_TYPE_ID": 1,
      "STAGE_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
      "RESPONSIBLE_ID": String(userId),
      ">=CREATED_TIME": stDay,
      "<=CREATED_TIME": endDay
    }, 500) || [];

    const monthItems = await stageHistoryList({
      "ENTITY_TYPE_ID": 1,
      "STAGE_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
      "RESPONSIBLE_ID": String(userId),
      ">=CREATED_TIME": stMonth,
      "<=CREATED_TIME": nowIso
    }, 500) || [];

    // últimos atendidos: últimos OWNER_ID da stagehistory (sem faixa)
    const lastItems = await stageHistoryList({
      "ENTITY_TYPE_ID": 1,
      "STAGE_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
      "RESPONSIBLE_ID": String(userId)
    }, CONFIG.LIMIT_STAGEHIST) || [];

    const lastIds = [];
    for(const it of lastItems){
      const id = String(it.OWNER_ID || "");
      if(id && !lastIds.includes(id)) lastIds.push(id);
      if(lastIds.length >= CONFIG.LIMIT_USER_HISTORY) break;
    }

    // fetch detalhes (get 1 a 1 para manter a ordem)
    const last = [];
    for(const id of lastIds){
      try{
        const lead = await bxTry("crm.lead.get", { id: String(id) }, 1, 0);
        if(lead) last.push(lead);
      }catch(_){}
      await sleep(90);
    }

    // se stagehistory retornou vazio por restrição do portal, sinaliza fallback
    const ok = (dayItems.length + monthItems.length + last.length) > 0;

    return ok ? { pulledToday: dayItems.length, pulledMonth: monthItems.length, last } : null;
  }

  // fallback: usa STATUS=EM_ATENDIMENTO e DATE_MODIFY
  async function fallbackUserHistory(userId){
    const stDay = todayISOStart();
    const endDay = todayISOEnd();
    const stMonth = monthISOStart();
    const nowIso = new Date().toISOString().slice(0,19);

    const day = await bxListAll("crm.lead.list", {
      filter: {
        "ASSIGNED_BY_ID": String(userId),
        "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
        ">=DATE_MODIFY": stDay,
        "<=DATE_MODIFY": endDay
      },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 50000).then(x=>(x||[]).length);

    const month = await bxListAll("crm.lead.list", {
      filter: {
        "ASSIGNED_BY_ID": String(userId),
        "STATUS_ID": CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
        ">=DATE_MODIFY": stMonth,
        "<=DATE_MODIFY": nowIso
      },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID"]
    }, 200000).then(x=>(x||[]).length);

    // últimos: qualquer lead da user por DATE_MODIFY
    const last = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY:"DESC" },
      select: ["ID","TITLE","NAME","SECOND_NAME","LAST_NAME","DATE_MODIFY","STATUS_ID","ASSIGNED_BY_ID"]
    }, 100);

    return { pulledToday: day, pulledMonth: month, last: (last||[]).slice(0, CONFIG.LIMIT_USER_HISTORY) };
  }

  async function fetchUserHistory(userId){
    // 1) tenta stagehistory
    const sh = await fetchUserByStageHistory(userId);
    if(sh) return sh;
    // 2) fallback
    return await fallbackUserHistory(userId);
  }

  // =========================
  // Actions
  // =========================
  async function leadUpdate(id, fields){
    return bx("crm.lead.update", { id: String(id), fields });
  }

  async function actionPickLead(lead, userId){
    await ensureLeadStatusMap();
    const leadId = String(lead?.ID || lead);
    const fields = { ASSIGNED_BY_ID: String(userId), STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO };

    await execOptimistic(
      {
        kind: "lead.update",
        payload: { id: leadId, fields },
        applyLocal: ()=>{
          state.newLeads = (state.newLeads||[]).filter(x=>String(x.ID)!==leadId);
          renderNewLeads(state.newLeads);
          // decrementa pendentes total localmente (sem depender de refresh)
          state.pendingTotal = Math.max(0, (state.pendingTotal||0) - 1);
          renderPendingCount();
        }
      },
      async ()=> leadUpdate(leadId, fields)
    );
  }

  async function actionDiscardLead(leadId){
    await ensureLeadStatusMap();
    leadId = String(leadId);
    const fields = { STATUS_ID: CONFIG.LEAD_STATUS.PERDIDO };

    await execOptimistic(
      {
        kind: "lead.update",
        payload: { id: leadId, fields },
        applyLocal: ()=>{
          state.newLeads = (state.newLeads||[]).filter(x=>String(x.ID)!==leadId);
          renderNewLeads(state.newLeads);
          state.pendingTotal = Math.max(0, (state.pendingTotal||0) - 1);
          renderPendingCount();
        }
      },
      async ()=> leadUpdate(leadId, fields)
    );
  }

  // ✅ mover QUALIFICADO + 🔥 no mesmo update
  async function actionMoveLeadOptimistic(it, statusId){
    await ensureLeadStatusMap();
    const leadId = String(it?.ID || it);
    const curTitle = String(it?.TITLE || leadDisplayName(it) || "");
    const willHot = (String(statusId) === String(CONFIG.LEAD_STATUS.QUALIFICADO));
    const withHot = willHot
      ? (curTitle.includes(CONFIG.HOT_EMOJI) ? curTitle : `${CONFIG.HOT_EMOJI} ${curTitle}`.trim())
      : curTitle;

    const fields = { STATUS_ID: String(statusId) };
    if(willHot && withHot) fields.TITLE = withHot;

    await execOptimistic(
      { kind:"lead.update", payload:{ id: leadId, fields }, applyLocal: ()=>{} },
      async ()=> leadUpdate(leadId, fields)
    );
  }

  // ✅ FOLLOW-UP: atualiza UF + cria DEAL na pipeline 17 na COLUNA da USER
  async function actionSetPrazo(lead, iso, userId){
    const leadId = String(lead?.ID || lead);
    const fields = { [CONFIG.UF_PRAZO]: iso };

    await execOptimistic(
      { kind:"lead.update", payload:{ id: leadId, fields }, applyLocal: ()=>{} },
      async ()=> leadUpdate(leadId, fields)
    );

    if(CONFIG.FOLLOWUP_DEAL && CONFIG.FOLLOWUP_DEAL.ENABLED){
      const u = CONFIG.USERS.find(x=>String(x.id)===String(userId));
      const stages = await getDealStages(CONFIG.FOLLOWUP_DEAL.CATEGORY_ID);
      const stageId = findStageIdForUser(stages, u?.name || "") || CONFIG.FOLLOWUP_DEAL.STAGE_ID_FALLBACK;

      const leadName = leadDisplayName(lead || { ID: leadId });
      const title = `${CONFIG.FOLLOWUP_DEAL.PREFIX_TITLE} • ${leadName}`.trim();

      const dealFields = {
        CATEGORY_ID: CONFIG.FOLLOWUP_DEAL.CATEGORY_ID,
        STAGE_ID: String(stageId),
        TITLE: title,
        ASSIGNED_BY_ID: String(userId || ""),
        COMMENTS: `Lead ID: ${leadId}\nPrazo: ${iso}`
      };

      await execOptimistic(
        { kind:"deal.add.followup", payload:{ fields: dealFields }, applyLocal: ()=>{} },
        async ()=> bx("crm.deal.add", { fields: dealFields })
      );
    }
  }

  // ✅ Criar Lead manual (Indicação) — direto QUALIFICADO, responsável=user
  async function actionCreateManualQualifiedLead(userId, payload){
    await ensureLeadStatusMap();

    const name = String(payload.name||"").trim();
    const phone = String(payload.phone||"").trim();

    const titleBase = payload.title ? String(payload.title).trim() : "";
    const title = titleBase || (name ? `Indicação • ${name}` : `Indicação • ${phone||"Novo"}`);

    const fields = {
      TITLE: title,
      STATUS_ID: String(CONFIG.LEAD_STATUS.QUALIFICADO),
      ASSIGNED_BY_ID: String(userId),
    };

    if(name){
      const parts = name.split(/\s+/).filter(Boolean);
      fields.NAME = parts.shift() || "";
      fields.LAST_NAME = parts.join(" ");
    }

    if(phone){
      fields.PHONE = [{ VALUE: phone, VALUE_TYPE:"WORK" }];
    }

    // UFs
    if(payload.operadora) fields[CONFIG.LEAD_UF.UF_OPERADORA] = String(payload.operadora);
    if(payload.idade) fields[CONFIG.LEAD_UF.UF_IDADE] = String(payload.idade);
    if(payload.bairro) fields[CONFIG.LEAD_UF.UF_BAIRRO] = String(payload.bairro);
    if(payload.fonte) fields[CONFIG.LEAD_UF.UF_FONTE] = String(payload.fonte);
    // dt lead: se quiser já setar “agora”
    fields[CONFIG.LEAD_UF.UF_DT_LEAD] = new Date().toISOString().slice(0,19);

    if(payload.obs){
      fields.COMMENTS = String(payload.obs);
    }

    await execOptimistic(
      { kind:"lead.add", payload:{ fields }, applyLocal: ()=>{} },
      async ()=> bx("crm.lead.add", { fields })
    );
  }

  // =========================
  // Render
  // =========================
  function renderPendingCount(){
    const el = $("#subNew");
    if(!el) return;
    el.textContent = `Pendentes (não puxados): ${state.pendingTotal || 0}`;
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
      const d = h?.last?.[0]?.DATE_MODIFY || h?.last?.[0]?.DATE_CREATE;
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

      const l1 = us.last && us.last[0] ? us.last[0] : null;
      const l2 = us.last && us.last[1] ? us.last[1] : null;

      const last1 = l1 ? `Último: ${leadDisplayName(l1)}` : "Último: —";
      const last2 = l2 ? `Anterior: ${leadDisplayName(l2)}` : "Anterior: —";

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div style="font-weight:950">${esc(u.name)} <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
            <span class="cgdBadge">dia: ${esc(us.pulledToday||0)}</span>
            <span class="cgdBadge">mês: ${esc(us.pulledMonth||0)}</span>
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
                <div class="hSub" id="subNew">Pendentes (não puxados): 0</div>
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

  async function modalHideUsers(){
    try{
      const fresh = await fetchQueue();
      state.queue = { ...state.queue, ...fresh };
      state.queueLoaded = true;
    }catch(_){}

    const hiddenSet = new Set((state.queue.hiddenUsers||[]).map(String));

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

  // ✅ ABRIR da USER (com STAGE e CRIAR INDICAÇÃO)
  async function modalManageUser(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    let hist = null;
    try{
      hist = await fetchUserHistory(u.id);
      state.userStats[u.id] = hist; // atualiza cache
    }catch(_){
      hist = state.userStats[u.id] || { pulledToday:0, pulledMonth:0, last:[] };
    }

    const body = `
      <div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:950">Ações • Histórico • Follow-up</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:12px">
        <div class="cgdBadge">Atendidos hoje: <b>${esc(hist.pulledToday||0)}</b></div>
        <div class="cgdBadge">Atendidos no mês: <b>${esc(hist.pulledMonth||0)}</b></div>
      </div>

      <!-- ✅ Criar Lead manual (Indicação) -->
      <div style="border:1px solid rgba(30,40,70,.12); border-radius:16px; padding:12px; background: rgba(255,255,255,.86); margin-bottom:12px">
        <div style="font-weight:950; margin-bottom:10px">CRIAR CARD (INDICAÇÃO) • vai direto para QUALIFICADO</div>
        <div class="cgdRow" style="margin-bottom:10px">
          <input class="cgdInput" id="mlName" placeholder="Nome do cliente" style="min-width:240px" />
          <input class="cgdInput" id="mlPhone" placeholder="Telefone" style="min-width:180px" />
          <input class="cgdInput" id="mlOperadora" placeholder="Operadora" style="min-width:180px" />
          <input class="cgdInput" id="mlIdade" placeholder="Idade" style="min-width:120px" />
          <input class="cgdInput" id="mlBairro" placeholder="Bairro" style="min-width:160px" />
          <input class="cgdInput" id="mlFonte" placeholder="Fonte" style="min-width:160px" />
        </div>
        <div class="cgdRow">
          <input class="cgdInput" id="mlObs" placeholder="Observação (opcional)" style="flex:1 1 520px; min-width:280px" />
          <button class="cgdBtn" id="mlCreate">Criar</button>
        </div>
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
            <th style="width:190px">STAGE (coluna)</th>
            <th>FOLLOW-UP (1)</th>
            <th>Transferir (1)</th>
          </tr>
        </thead>
        <tbody id="muTbody"></tbody>
      </table>
    `;

    openModal(`ABRIR • ${u.name} (${u.id})`, body);

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
        const dm = String(it.DATE_MODIFY||it.DATE_CREATE||"").replace("T"," ").slice(0,19);
        const stage = stageNameFromId(it.STATUS_ID);

        return `<tr data-row="${esc(id)}">
          <td><input type="checkbox" data-sel="${esc(id)}" /></td>
          <td>
            <b>${esc(title)}</b>
            <div style="opacity:.7;font-weight:900;font-size:11px">ID: ${esc(id)} • ${esc(dm||"—")}</div>
          </td>
          <td><span class="cgdBadge">${esc(stage)}</span></td>
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
      }).join("") : `<tr><td colspan="5" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
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

    // ✅ Criar indicação
    $("#mlCreate")?.addEventListener("click", async ()=>{
      const btn = $("#mlCreate");
      try{
        btn.disabled = true;
        const payload = {
          name: $("#mlName")?.value,
          phone: $("#mlPhone")?.value,
          operadora: $("#mlOperadora")?.value,
          idade: $("#mlIdade")?.value,
          bairro: $("#mlBairro")?.value,
          fonte: $("#mlFonte")?.value,
          obs: $("#mlObs")?.value
        };
        await actionCreateManualQualifiedLead(u.id, payload);
        await hardRefreshAll();
        alert("Indicação criada em QUALIFICADO ✅");
        closeModal();
        modalManageUser(u.id);
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel.");
      }finally{
        btn.disabled = false;
      }
    });

    $("#muBulkPrazo")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const iso = isoFromLocalInput($("#muBulkDate")?.value || "");
      if(!iso) return alert("Preencha a data/hora do FOLLOW-UP.");
      try{
        $("#muBulkPrazo").disabled = true;
        for(const id of ids){
          const obj = (hist.last||[]).find(x=>String(x.ID)===String(id)) || { ID:id };
          await actionSetPrazo(obj, iso, u.id);
          await sleep(140);
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
          await sleep(160);
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
          const obj = (hist.last||[]).find(x=>String(x.ID)===String(leadId)) || { ID:leadId };
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
            async ()=> bx("crm.lead.update", { id: String(leadId), fields:{ ASSIGNED_BY_ID: String(toId) } })
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

  // ✅ TRANSFERIR EM LOTE: agora busca direto no Bitrix pelos filtros
  async function modalBatchTransfer(){
    await ensureLeadStatusMap();

    const opsUsers = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    // operadoras: monta a partir do que está renderizado (rápido) + permite digitar se quiser
    const opsOperadora = `
      <option value="">Todas</option>
      ${(state.newLeads||[])
        .map(it=>pickVal(it, CONFIG.LEAD_UF.UF_OPERADORA))
        .filter(Boolean)
        .filter((v,i,a)=>a.indexOf(v)===i)
        .sort((a,b)=>a.localeCompare(b))
        .map(o=>`<option value="${esc(o)}">${esc(o)}</option>`)
        .join("")}
    `;

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote (filtro real no Bitrix)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Operadora:</label>
        <select class="cgdSelect" id="btOperadora">${opsOperadora}</select>

        <label style="font-weight:950">Data do Lead (de):</label>
        <input class="cgdInput" type="date" id="btDtDe" />
        <label style="font-weight:950">até:</label>
        <input class="cgdInput" type="date" id="btDtAte" />

        <label style="font-weight:950">Transferir para:</label>
        <select class="cgdSelect" id="btUser">${opsUsers}</select>

        <button class="cgdBtn" id="btApply">Buscar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Leads listados: <b id="btCount">0</b></div>
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

    let currentList = [];

    function draw(list){
      currentList = list.slice();
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
      }).join("") : `<tr><td colspan="2" style="opacity:.75;font-weight:900">Nenhum lead encontrado com esses filtros.</td></tr>`;
    }

    async function applyFilters(){
      const op = ($("#btOperadora").value||"").trim();
      const de = isoDateStart($("#btDtDe").value||"");
      const ate = isoDateEnd($("#btDtAte").value||"");

      $("#btApply").disabled = true;
      try{
        const list = await fetchNewLeadsFilteredFromBitrix(op, de, ate);
        draw(list);
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel.");
      }finally{
        $("#btApply").disabled = false;
      }
    }

    // primeira carga: tudo
    applyFilters();

    $("#btApply")?.addEventListener("click", applyFilters);

    $("#btDo")?.addEventListener("click", async ()=>{
      const toId = $("#btUser").value;
      const ids = $$("input[type=checkbox][data-bt-id]", tbody)
        .filter(x=>x.checked)
        .map(x=> x.getAttribute("data-bt-id"));

      if(ids.length === 0) return alert("Selecione pelo menos 1 lead.");
      try{
        $("#btDo").disabled = true;
        for(const id of ids){
          const obj = currentList.find(x=>String(x.ID)===String(id)) || { ID:id };
          await actionPickLead(obj, toId);
          await sleep(160);
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
        Ao pegar: muda responsável e envia para <b>${esc(stageNameFromId(CONFIG.LEAD_STATUS.EM_ATENDIMENTO))}</b>.
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
  // Refresh orchestration
  // =========================
  async function refreshNewLeads(){
    try{
      const items = await fetchNewLeadsForRender();
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

  // ✅ topo: total criados HOJE e no MÊS (mês corrente)
  async function refreshStats(){
    await ensureLeadStatusMap();
    try{
      const stDay = todayISOStart();
      const endDay = todayISOEnd();
      const stMonth = monthISOStart();
      const nowIso = new Date().toISOString().slice(0,19);

      const day = await bxListAll("crm.lead.list", {
        filter: { ">=DATE_CREATE": stDay, "<=DATE_CREATE": endDay },
        order: { ID:"DESC" },
        select: ["ID"]
      }, 50000).then(x=>(x||[]).length);

      const month = await bxListAll("crm.lead.list", {
        filter: { ">=DATE_CREATE": stMonth, "<=DATE_CREATE": nowIso },
        order: { ID:"DESC" },
        select: ["ID"]
      }, 200000).then(x=>(x||[]).length);

      state.stats = { day, month };
      renderStats(state.stats);
    }catch(_){}
  }

  async function refreshUsers(){
    for(const u of CONFIG.USERS){
      try{
        const h = await fetchUserHistory(u.id);
        state.userStats[u.id] = h;
      }catch(_){
        // mantém cache
      }
      await sleep(120);
    }
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
      renderQueue();
      renderWho();
    }
  }

  async function refreshPendingCount(){
    try{
      await fetchPendingTotal();
      renderPendingCount();
    }catch(_){}
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()}) • v${BUILD}`);
    await Promise.allSettled([refreshPendingCount(), refreshNewLeads(), refreshStats(), refreshUsers(), refreshQueue()]);
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

    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);
    $("#btnBatch")?.addEventListener("click", modalBatchTransfer);

    $("#queueOpen")?.addEventListener("click", async ()=>{
      // mantém modal de fila como estava na versão anterior (sem mudanças de estética aqui)
      // se você quiser, eu junto tudo de novo aqui — mas não é necessário para essas correções.
      alert("Use o botão FILA DE ATENDIMENTO (barra inferior) — modal de fila permanece igual ao anterior.");
    });

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
    setInterval(refreshPendingCount, CONFIG.REFRESH_PENDING_COUNT_MS);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
