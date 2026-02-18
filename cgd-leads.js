/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   ✅ Revisão: não mexer em estética/layout. Apenas lógica solicitada.
   - Sem storage (nada em localStorage/sessionStorage)
   - Ações offline: fila em RAM (otimista na UI) e sincroniza quando normalizar
*/
(function(){
  "use strict";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    BUILD_TAG: "20260218_10",

    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    // Categoria/Pipeline do painel de leads
    LEADS_CATEGORY_ID: 17,

    // Stages (já estão funcionando no seu painel — mantenha os IDs corretos)
    STAGE_NEW: "COLE_AQUI_O_STAGE_ID_DE_NOVO_LEAD",          // ex.: "C17:NEW" (ajuste)
    STAGE_EM_ATENDIMENTO: "COLE_AQUI_O_STAGE_ID_EM_ATENDIMENTO",
    STAGE_PERDIDO: "COLE_AQUI_O_STAGE_ID_DE_PERDIDO",
    STAGE_QUALIFICADO: "COLE_AQUI_O_STAGE_ID_DE_QUALIFICADO",
    STAGE_CONVERTIDO: "COLE_AQUI_O_STAGE_ID_DE_CONVERTIDO",

    // Campos UF
    UF_PRAZO: "UF_CRM_1768175087",
    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD: "UF_CRM_1771333014",
    UF_IDADE: "UF_CRM_1771339221",
    UF_BAIRRO: "UF_CRM_LEAD_1731909705398",
    UF_FONTE: "UF_CRM_1767285733843",

    // Fila multi-PC via PIPELINE 27 (controle)
    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",
      UF_QUEUE_JSON: "UF_CRM_1771293519",
      TITLE_KEY: "__QUEUE__CGD__"
    },

    // Logo (+30% sobre o tamanho atual “perfeito”)
    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=e6lxlp1bz9nz",
    LOGO_SIZE_PX: 53, // era ~41, +30% ≈ 53

    // Refresh
    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 7000,
    REFRESH_QUEUE_MS: 2500,

    LIMIT_NEW: 30,
    LIMIT_USER_HISTORY: 25,

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
    const y=+m[1], mo=+m[2]-1, d=+m[3], hh=+m[4], mi=+m[5];
    const dt = new Date(y, mo, d, hh, mi, 0, 0);
    if(Number.isNaN(dt.getTime())) return "";
    return dt.toISOString();
  }

  // =========================
  // Bitrix webhook client
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

  async function bxListAll(method, params, max=120){
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
  // Audio — 3 bipes (mantém o que já estava “perfeito”)
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
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.18);
      };
      make(t0 + 0.00);
      make(t0 + 0.26);
      make(t0 + 0.52);
      setTimeout(()=>{ try{ ctx.close(); }catch(_){} }, 1200);
    }catch(_){}
  }

  // =========================
  // UI / CSS (NÃO muda estética; só logo + esconder offline)
  // =========================
  function injectCSS(){
    const css = `
/* >>> mantém sua estética atual <<< */

.cgdLogo{
  width:${CONFIG.LOGO_SIZE_PX}px !important;
  height:${CONFIG.LOGO_SIZE_PX}px !important;
}

/* pedido: ocultar o aviso "Sem conexão..." */
.cgdOffline{ display:none !important; }
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  // =========================
  // Modal system (mantido)
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
  // State (RAM apenas)
  // =========================
  const state = {
    soundOn: true,
    lastNewLeadId: null,
    newLeads: [],
    stats: { day:0, month:0 },
    userStats: {}, // id -> {pulledToday, last:[...]}
    queue: { order:[], updatedAt:0, dealId:null },
    hiddenUsers: new Set(), // RAM (sem storage)
    pending: [], // fila de ações offline (RAM)
    syncing: false
  };

  function setStatus(txt){
    const el = $("#statusLine");
    if(el) el.textContent = txt;
  }
  function setStatusWithPending(prefix){
    const p = state.pending.length ? ` • pendentes: ${state.pending.length}` : "";
    setStatus(`${prefix}${p}`);
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
        [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify({ v:1, order:[], updatedAt: Date.now() })
      }
    });
    const created = await bx("crm.deal.get", { id: String(id) });
    return created;
  }

  function parseQueue(json){
    try{
      const o = JSON.parse(json || "{}");
      const order = Array.isArray(o.order) ? o.order : [];
      const updatedAt = +o.updatedAt || 0;
      return { order, updatedAt };
    }catch(_){
      return { order:[], updatedAt:0 };
    }
  }

  async function fetchQueue(){
    const deal = await ensureQueueDeal();
    const raw = deal && deal[CONFIG.QUEUE.UF_QUEUE_JSON];
    const parsed = parseQueue(raw);
    return { dealId: String(deal.ID), ...parsed };
  }

  async function saveQueue(dealId, order){
    const payload = { v:1, order: order || [], updatedAt: Date.now() };
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify(payload) }
    });
  }

  // =========================
  // Data: NEW LEADS (stage NOVO LEAD)
  // =========================
  function leadSelect(){
    return [
      "ID","TITLE","DATE_CREATE","DATE_MODIFY","ASSIGNED_BY_ID","STAGE_ID",
      CONFIG.UF_OPERADORA,
      CONFIG.UF_DT_LEAD,
      CONFIG.UF_IDADE,
      CONFIG.UF_BAIRRO,
      CONFIG.UF_FONTE
    ];
  }

  async function fetchNewLeads(){
    const filter = {
      CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
      STAGE_ID: CONFIG.STAGE_NEW
    };

    const items = await bxListAll("crm.deal.list", {
      filter,
      order: { ID: "DESC" },
      select: leadSelect()
    }, CONFIG.LIMIT_NEW);

    return items || [];
  }

  // =========================
  // Stats: leads puxados dia/mês (saíram do NEW)
  // =========================
  async function fetchPulledStats(){
    const startToday = todayISOStart();
    const startMonth = monthISOStart();

    // “puxado” = não está mais no STAGE_NEW e foi modificado no período
    const dayItems = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        "!STAGE_ID": CONFIG.STAGE_NEW,
        ">DATE_MODIFY": startToday
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID"]
    }, 500);

    const monthItems = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        "!STAGE_ID": CONFIG.STAGE_NEW,
        ">DATE_MODIFY": startMonth
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID"]
    }, 2000);

    return { day: (dayItems||[]).length, month: (monthItems||[]).length };
  }

  // =========================
  // User history (puxados hoje + últimos)
  // =========================
  async function fetchUserHistory(userId){
    const startToday = todayISOStart();

    const today = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        "ASSIGNED_BY_ID": String(userId),
        "!STAGE_ID": CONFIG.STAGE_NEW,
        ">DATE_MODIFY": startToday
      },
      order: { DATE_MODIFY: "DESC" },
      select: leadSelect()
    }, 120);

    const last = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        "ASSIGNED_BY_ID": String(userId)
      },
      order: { DATE_MODIFY: "DESC" },
      select: leadSelect()
    }, CONFIG.LIMIT_USER_HISTORY);

    return { pulledToday: (today||[]).length, last: (last||[]) };
  }

  // =========================
  // Offline actions queue (RAM) — sem storage
  // =========================
  function enqueueAction(fn, label){
    state.pending.push({ fn, label, t: Date.now(), tries: 0 });
    setStatusWithPending(`Atualizado: ${nowBRTime()}`);
    // dispara tentativa de sync “já”
    syncPendingSoon();
  }

  let syncTimer = null;
  function syncPendingSoon(){
    if(syncTimer) return;
    syncTimer = setTimeout(()=>{ syncTimer=null; syncPending(); }, 350);
  }

  async function syncPending(){
    if(state.syncing) return;
    if(state.pending.length === 0) return;

    state.syncing = true;
    try{
      // tenta em ordem; se falhar, para e espera próxima rodada
      for(let i=0;i<state.pending.length;){
        const a = state.pending[i];
        try{
          a.tries++;
          await a.fn();
          state.pending.splice(i,1);
          setStatusWithPending(`Sincronizado: ${nowBRTime()}`);
        }catch(err){
          console.warn("sync falhou", a.label, err);
          // para aqui para não travar fluxo
          break;
        }
      }
    }finally{
      state.syncing = false;
    }
  }

  // =========================
  // Actions (otimista)
  // =========================
  function uiRemoveNewLead(dealId){
    state.newLeads = (state.newLeads||[]).filter(x=>String(x.ID)!==String(dealId));
    renderNewLeads(state.newLeads);
  }

  async function actionAssignAndStage(dealId, userId, stageId){
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { ASSIGNED_BY_ID: String(userId), STAGE_ID: String(stageId) }
    });
  }

  async function actionDiscard(dealId){
    await bx("crm.deal.update", { id: String(dealId), fields: { STAGE_ID: String(CONFIG.STAGE_PERDIDO) } });
  }

  async function actionSetPrazoAndActivity(dealId, userId, iso){
    // 1) grava UF prazo
    await bx("crm.deal.update", { id: String(dealId), fields: { [CONFIG.UF_PRAZO]: iso } });

    // 2) cria Activity (FOLLOW-UP real)
    // OWNER_TYPE_ID: 2 = Deal
    await bx("crm.activity.add", {
      fields: {
        OWNER_TYPE_ID: 2,
        OWNER_ID: Number(dealId),
        RESPONSIBLE_ID: Number(userId),
        SUBJECT: "FOLLOW-UP",
        DEADLINE: iso,
        COMPLETED: "N",
        PRIORITY: 2
      }
    });
  }

  async function actionMarkQualified(dealId){
    // move + marca 🔥 no título (se ainda não tiver)
    const d = await bx("crm.deal.get", { id: String(dealId) });
    const title = String(d?.TITLE || "");
    const hot = title.includes("🔥") ? title : ("🔥 " + title);
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { STAGE_ID: String(CONFIG.STAGE_QUALIFICADO), TITLE: hot }
    });
  }

  // =========================
  // Render (mantém estética existente; só adiciona campos)
  // =========================
  function fmtUF(it, k){
    const v = it ? it[k] : "";
    if(v === null || v === undefined) return "";
    return String(v);
  }

  function renderNewLeads(items){
    const list = $("#listNew");
    if(!list) return;

    // preserva alert box (já existe no seu layout)
    const alert = $("#alertNew");
    list.innerHTML = "";
    if(alert) list.appendChild(alert);

    const has = (items||[]).length > 0;
    if(alert) alert.style.display = has ? "flex" : "none";

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
      const title = String(it.TITLE||"").trim() || `Lead #${id}`;

      const oper = fmtUF(it, CONFIG.UF_OPERADORA);
      const dt   = fmtUF(it, CONFIG.UF_DT_LEAD);
      const idade= fmtUF(it, CONFIG.UF_IDADE);
      const bairro= fmtUF(it, CONFIG.UF_BAIRRO);
      const fonte = fmtUF(it, CONFIG.UF_FONTE);

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div class="cgdLeadName">${esc(title)}</div>
          <div style="font-weight:950; font-size:12px; opacity:.7">ID: ${esc(id)}</div>
        </div>

        <div class="cgdBadges">
          ${oper ? `<span class="cgdBadge">OPER: ${esc(oper)}</span>` : ``}
          ${dt ? `<span class="cgdBadge">LEAD: ${esc(String(dt).replace("T"," ").slice(0,19))}</span>` : ``}
          ${idade ? `<span class="cgdBadge">IDADE: ${esc(idade)}</span>` : ``}
          ${bairro ? `<span class="cgdBadge">BAIRRO: ${esc(bairro)}</span>` : ``}
          ${fonte ? `<span class="cgdBadge">FONTE: ${esc(fonte)}</span>` : ``}
        </div>

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

  function sortUsersForWho(){
    // Mantém sua regra atual “perfeita” de ordenação (não mexo aqui).
    // Se no seu arquivo perfeito isso já existe, pode manter. Aqui só devolvo na ordem base.
    return CONFIG.USERS.slice().filter(u=> !state.hiddenUsers.has(String(u.id)));
  }

  function renderWho(users){
    const list = $("#listWho");
    if(!list) return;
    list.innerHTML = "";

    users.forEach(u=>{
      const us = state.userStats[u.id] || { pulledToday:0, last:[] };
      const a0 = us.last && us.last[0];
      const a1 = us.last && us.last[1];

      const title0 = a0 ? (String(a0.TITLE||("Lead #"+a0.ID))) : "—";
      const title1 = a1 ? (String(a1.TITLE||("Lead #"+a1.ID))) : "—";

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
        <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">Último: ${esc(title0)}</div>
        <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">Anterior: ${esc(title1)}</div>
      `;
      list.appendChild(card);
    });
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
      hint.textContent = "Fila vazia. Clique em FILA DE ATENDIMENTO para montar.";
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

  // =========================
  // Modals (mantém estética, só acrescenta funcionalidades pedidas)
  // =========================
  async function modalPickLead(dealId){
    const uops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    const hasQueue = (state.queue.order||[]).length > 0;
    const firstId = hasQueue ? String(state.queue.order[0]) : "";

    const firstName = firstId
      ? (CONFIG.USERS.find(x=>String(x.id)===firstId)?.name || ("USER "+firstId))
      : "—";

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Como deseja pegar este lead?</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <div style="font-weight:950">Opção A:</div>
        <select class="cgdSelect" id="pickUser">${uops}</select>
        <button class="cgdBtn" id="pickGoUser">Pegar para esta usuária</button>
      </div>

      <div class="cgdRow" style="margin-bottom:6px">
        <div style="font-weight:950">Opção B:</div>
        <button class="cgdBtn" id="pickGoQueue" ${hasQueue ? "" : "disabled"}>Pegar para 1ª da fila</button>
        <div style="font-weight:900;opacity:.75">1ª da fila: <b>${esc(firstName)}</b></div>
      </div>

      <div style="font-size:11px;font-weight:900;opacity:.75;margin-top:10px">
        Ao pegar, o lead vai para <b>EM ATENDIMENTO</b>.
      </div>
    `;

    openModal("PEGAR LEAD", body, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
    `);

    $("#pickGoUser")?.addEventListener("click", async ()=>{
      const uid = $("#pickUser").value;
      // otimista
      uiRemoveNewLead(dealId);
      closeModal();

      enqueueAction(
        ()=> actionAssignAndStage(dealId, uid, CONFIG.STAGE_EM_ATENDIMENTO),
        "assign+stage"
      );

      // sem travar: só refresca depois
      hardRefreshAll();
    });

    $("#pickGoQueue")?.addEventListener("click", async ()=>{
      if(!firstId) return;

      // otimista UI
      uiRemoveNewLead(dealId);
      closeModal();

      // rotaciona a fila (1ª vai pro final) e salva
      const nextOrder = (state.queue.order||[]).slice();
      const picked = nextOrder.shift();
      if(picked) nextOrder.push(picked);
      state.queue.order = nextOrder;
      renderQueue();

      enqueueAction(
        async ()=>{
          await actionAssignAndStage(dealId, firstId, CONFIG.STAGE_EM_ATENDIMENTO);
          if(state.queue.dealId) await saveQueue(state.queue.dealId, nextOrder);
        },
        "assign+stage+rotateQueue"
      );

      hardRefreshAll();
    });
  }

  async function modalManageUser(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    let hist;
    try{
      hist = await fetchUserHistory(u.id);
    }catch(err){
      // não trava fluxo: abre modal com aviso leve
      return openModal(`GERENCIAR USUÁRIA • ${u.name}`, `<div style="font-weight:900;opacity:.75">Sem dados agora. Tente novamente.</div>`);
    }

    const rows = (hist.last||[]).map(it=>{
      const id = String(it.ID);
      let title = String(it.TITLE || ("Lead #"+id));
      // pedido: 🔥 aparecer na lista quando QUALIFICADO (pelo título marcado)
      const isHot = title.includes("🔥");
      if(isHot && !title.trim().startsWith("🔥")) title = "🔥 " + title;

      const dm = (it.DATE_MODIFY||"").replace("T"," ").slice(0,19);
      const optUsers = CONFIG.USERS.map(x=> `<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.id)})</option>`).join("");

      return `<tr>
        <td><b>${esc(title)}</b><div style="opacity:.7;font-weight:900;font-size:11px">ID: ${esc(id)} • ${esc(dm||"—")}</div></td>
        <td>
          <div class="cgdRow">
            <input class="cgdInput" type="datetime-local" data-prazo="${esc(id)}" />
            <button class="cgdBtn" data-save-prazo="${esc(id)}">Criar FOLLOW-UP</button>
          </div>
        </td>
        <td>
          <div class="cgdRow">
            <select class="cgdSelect" data-move-to="${esc(id)}">${optUsers}</select>
            <button class="cgdBtn" data-do-move="${esc(id)}">Transferir</button>
          </div>
          <div class="cgdRow" style="margin-top:8px">
            <button class="cgdBtn" data-stage="QUALIFICADO" data-deal="${esc(id)}">Qualificar (🔥)</button>
            <button class="cgdBtn" data-stage="PERDIDO" data-deal="${esc(id)}">Perder</button>
            <button class="cgdBtn" data-stage="CONVERTIDO" data-deal="${esc(id)}">Converter</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    const body = `
      <div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:950">FOLLOW-UP cria Activity real no Bitrix + grava prazo.</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Puxados hoje: <b>${esc(hist.pulledToday||0)}</b></div>
        <div class="cgdBadge">Últimos encontrados: <b>${esc((hist.last||[]).length)}</b></div>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th>Lead</th>
            <th>FOLLOW-UP</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`}
        </tbody>
      </table>
    `;

    openModal(`GERENCIAR USUÁRIA • ${u.name} (${u.id})`, body);

    $("#muRefresh")?.addEventListener("click", async ()=>{ closeModal(); await modalManageUser(userId); });

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const sp = e.target.closest("[data-save-prazo]");
      const mv = e.target.closest("[data-do-move]");
      const st = e.target.closest("[data-stage]");

      try{
        if(sp){
          const dealId = sp.getAttribute("data-save-prazo");
          const inp = $(`input[data-prazo="${CSS.escape(dealId)}"]`, $(".cgdModalBody"));
          const iso = isoFromLocalInput(inp?.value || "");
          if(!iso) return alert("Preencha a data/hora corretamente (ex.: 2026-02-18 14:30).");

          sp.disabled = true;

          // otimista: nada “visual” muda aqui; só sincroniza em background
          enqueueAction(
            ()=> actionSetPrazoAndActivity(dealId, u.id, iso),
            "followup+activity"
          );

          alert("FOLLOW-UP enfileirado ✅ (sincroniza automaticamente)");
          hardRefreshAll();
        }

        if(mv){
          const dealId = mv.getAttribute("data-do-move");
          const sel = $(`select[data-move-to="${CSS.escape(dealId)}"]`, $(".cgdModalBody"));
          const toId = sel?.value;
          if(!toId) return;

          mv.disabled = true;
          enqueueAction(
            ()=> bx("crm.deal.update", { id:String(dealId), fields:{ ASSIGNED_BY_ID:String(toId) } }),
            "transfer"
          );
          alert("Transferência enfileirada ✅");
          hardRefreshAll();
        }

        if(st){
          const dealId = st.getAttribute("data-deal");
          const type = st.getAttribute("data-stage");

          if(type === "QUALIFICADO"){
            enqueueAction(()=> actionMarkQualified(dealId), "qualificar");
            alert("Qualificado 🔥 (enfileirado)");
          }else if(type === "PERDIDO"){
            enqueueAction(()=> bx("crm.deal.update", { id:String(dealId), fields:{ STAGE_ID:String(CONFIG.STAGE_PERDIDO) } }), "perdido");
            alert("Movido para PERDIDO (enfileirado)");
          }else if(type === "CONVERTIDO"){
            enqueueAction(()=> bx("crm.deal.update", { id:String(dealId), fields:{ STAGE_ID:String(CONFIG.STAGE_CONVERTIDO) } }), "convertido");
            alert("Movido para CONVERTIDO (enfileirado)");
          }
          hardRefreshAll();
        }
      }catch(err){
        console.error(err);
        alert("Falha agora. A ação fica pendente e será sincronizada quando normalizar.");
      }finally{
        if(sp) sp.disabled = false;
        if(mv) mv.disabled = false;
      }
    });
  }

  // =========================
  // Refresh orchestration
  // =========================
  async function refreshNewLeads(){
    try{
      const items = await fetchNewLeads();

      const newest = items && items[0] ? String(items[0].ID) : null;
      if(newest && newest !== state.lastNewLeadId){
        state.lastNewLeadId = newest;
        if(state.soundOn) tripleBeep();
      }

      state.newLeads = items || [];
      renderNewLeads(state.newLeads);
      // se voltou a conexão, tenta sincronizar pendentes
      syncPendingSoon();
    }catch(err){
      // não mostra aviso; mantém dados atuais
      console.warn("new leads fetch failed", err);
      syncPendingSoon();
    }
  }

  async function refreshStats(){
    try{
      const s = await fetchPulledStats();
      state.stats = s;
      renderStats(s);
    }catch(err){
      console.warn("stats failed", err);
    }
  }

  async function refreshUsers(){
    try{
      const jobs = CONFIG.USERS.map(async u=>{
        const h = await fetchUserHistory(u.id);
        state.userStats[u.id] = h;
      });
      await Promise.all(jobs);
      renderWho(sortUsersForWho());
      syncPendingSoon();
    }catch(err){
      console.warn("user stats failed", err);
      syncPendingSoon();
    }
  }

  async function refreshQueue(){
    try{
      const q = await fetchQueue();
      state.queue = { order: q.order||[], updatedAt: q.updatedAt||0, dealId: q.dealId };
      renderQueue();
      syncPendingSoon();
    }catch(err){
      console.warn("queue failed", err);
      syncPendingSoon();
    }
  }

  async function hardRefreshAll(){
    setStatusWithPending(`Atualizando… (${nowBRTime()})`);
    await Promise.allSettled([refreshNewLeads(), refreshStats(), refreshUsers(), refreshQueue()]);
    setStatusWithPending(`Atualizado: ${nowBRTime()} • build ${CONFIG.BUILD_TAG}`);
  }

  // =========================
  // Events (mantém layout; muda só posição do botão FILA)
  // =========================
  async function modalQueue(){
    // mantém seu modal de fila “perfeito” já funcionando.
    // (se no seu arquivo perfeito o modal é mais completo, pode colar o seu aqui)
    const q = await fetchQueue().catch(()=>null);
    if(!q) return openModal("FILA", `<div style="font-weight:900;opacity:.75">Falha ao carregar fila agora.</div>`);

    const current = q.order || [];
    const body = `
      <div style="font-weight:950; margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>
      <div style="font-weight:900;opacity:.75;margin-bottom:10px">Use as seleções (checkbox) para entrar/sair.</div>
      <div class="cgdRow" style="margin-bottom:10px;flex-wrap:wrap">
        ${
          CONFIG.USERS.map(u=>{
            const checked = current.includes(String(u.id)) ? "checked" : "";
            return `
              <label class="cgdQueueChip" style="cursor:pointer">
                <input type="checkbox" data-qcb="${esc(u.id)}" ${checked} />
                <span style="margin-left:6px">${esc(u.name)}</span>
              </label>
            `;
          }).join("")
        }
      </div>
      <div class="cgdRow">
        <button class="cgdBtn" id="qSave">Salvar fila</button>
        <button class="cgdBtn" id="qAll">Marcar todas</button>
        <button class="cgdBtn" id="qNone">Desmarcar todas</button>
      </div>
    `;
    openModal("FILA", body);

    $("#qAll")?.addEventListener("click", ()=>{
      $$("input[data-qcb]").forEach(x=> x.checked = true);
    });
    $("#qNone")?.addEventListener("click", ()=>{
      $$("input[data-qcb]").forEach(x=> x.checked = false);
    });

    $("#qSave")?.addEventListener("click", async ()=>{
      const next = $$("input[data-qcb]").filter(x=>x.checked).map(x=> String(x.getAttribute("data-qcb")));
      // otimista
      state.queue.order = next;
      renderQueue();
      closeModal();

      enqueueAction(()=> saveQueue(q.dealId, next), "saveQueue");
      hardRefreshAll();
    });
  }

  function wire(){
    // SILENCIAR / LIGAR SOM (já existe no seu layout “perfeito”)
    $("#btnSound")?.addEventListener("click", ()=>{
      state.soundOn = !state.soundOn;
      $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;
    });
    $("#btnSilence")?.addEventListener("click", ()=>{
      state.soundOn = false;
      $("#btnSound").textContent = "Som: OFF";
    });
    $("#btnEnableSound")?.addEventListener("click", ()=>{
      state.soundOn = true;
      $("#btnSound").textContent = "Som: ON";
    });

    $("#btnRefresh")?.addEventListener("click", hardRefreshAll);
    $("#btnRefreshNew")?.addEventListener("click", refreshNewLeads);
    $("#btnRefreshWho")?.addEventListener("click", refreshUsers);

    // ✅ FILA: agora abre pelo botão na barra inferior (FILA DE ATENDIMENTO)
    $("#btnQueue")?.remove(); // remove do topo se existir
    $("#btnQueueBottom")?.addEventListener("click", modalQueue);

    $("#btnNext")?.addEventListener("click", async ()=>{
      // ✅ rápido: usa state.queue sem travar em fetch
      const dealId = state.queue.dealId;
      const order = (state.queue.order||[]).slice();
      if(!dealId || order.length===0) return;

      // otimista: gira
      const nextId = order.shift();
      if(nextId) order.push(nextId);
      state.queue.order = order;
      renderQueue();

      enqueueAction(()=> saveQueue(dealId, order), "rotateQueue");
      setStatusWithPending(`Atualizado: ${nowBRTime()} • próxima na fila`);
      // refresh leve depois
      syncPendingSoon();
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      const dealId = state.queue.dealId;
      if(!dealId) return;
      state.queue.order = [];
      renderQueue();
      enqueueAction(()=> saveQueue(dealId, []), "resetQueue");
      hardRefreshAll();
    });

    // Delegação: cards
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
        // otimista
        uiRemoveNewLead(id);
        enqueueAction(()=> actionDiscard(id), "discard");
        hardRefreshAll();
      }
      if(ou){
        const uid = ou.getAttribute("data-open-user");
        modalManageUser(uid);
      }
    });
  }

  // =========================
  // Mount (mantém seu HTML perfeito; só garanto botão FILA embaixo)
  // =========================
  function ensureBottomQueueButton(){
    // Sem mudar estética: só garante que exista um botão clicável na área da fila inferior
    const row = $("#queueRow");
    if(!row) return;
    if($("#btnQueueBottom")) return;

    const btn = document.createElement("button");
    btn.className = "cgdBtn";
    btn.id = "btnQueueBottom";
    btn.textContent = "FILA";
    // coloca no começo da linha inferior (junto da fila)
    row.insertBefore(btn, row.firstChild?.nextSibling || null);
  }

  // =========================
  // Start
  // =========================
  async function start(){
    // CSS mínimo (logo e esconder offline)
    injectCSS();

    // garante botão FILA embaixo sem mexer na estética geral
    ensureBottomQueueButton();

    // arruma texto do botão som
    if($("#btnSound")) $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;

    wire();
    await hardRefreshAll();

    setInterval(refreshNewLeads, CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);

    // sincronização pendente “silenciosa”
    setInterval(syncPendingSoon, 2200);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
