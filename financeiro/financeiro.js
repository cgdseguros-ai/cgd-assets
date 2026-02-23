/* cgd-assets/financeiro/financeiro.js */
(function(){
  // =========================
  // CONFIG
  // =========================
  const WORKER_BASE = "https://financeiro199702.cgdseguros.workers.dev";

  // Campos (Pipeline 27)
  const F = {
    tipo: "UF_CRM_1771208061",
    competencia: "UF_CRM_1771163661",
    valorPrev: "UF_CRM_1770769991",
    valorReal: "UF_CRM_1770770017",
    dataReal: "UF_CRM_1770771170",
    favorecido: "UF_CRM_1770775760",
    formaPgto: "UF_CRM_1769351652",
    obs: "UF_CRM_691385BE7D33D",
    categoria: "UF_CRM_1770770570",
    dataPrev: "UF_CRM_1770769767",
    statusFin: "UF_CRM_1770770088",
    conta: "UF_CRM_1770770758",
    centroCusto: "UF_CRM_1771801157",
  };

  // Stages Pipeline 27
  const ST27 = {
    queueJson: "C27:UC_SVUYIO",
    despesaAPagar: "C27:NEW",
    despesaPaga: "C27:PREPARATION",
    receitaAReceber: "C27:UC_EQAFD7",
    receitaRecebida: "C27:PREPAYMENT_INVOIC",
    cancelado: "C27:EXECUTING",
    concluido: "C27:UC_LP2NSK",
  };

  // Pipeline 17 (lembretes)
  const P17 = {
    categoryId: 17,
    stageManuela: "C17:PREPARATION",  // MANUELA
    assigned813: 813
  };

  // UI defaults
  const DEFAULT_BATCH_ROWS = 15;
  const HIDE_STAGE_DEFAULT = new Set([ST27.concluido]); // ocultar “CONCLUÍDO” na listagem padrão

  // Cartões (config fornecida)
  const CARDS = [
    { name:"CT ITAÚ PJ", venc:"02", melhor:"21" },
    { name:"CT PORTO PF", venc:"10", melhor:"04" },
    { name:"CT C6 PJ", venc:"15", melhor:"09" },
    { name:"CT XP PF", venc:"15", melhor:"11" },
    { name:"CT ITAÚ PF", venc:"21", melhor:"13" },
    { name:"CT CORA CGD BARRA", venc:"23", melhor:"17" },
    { name:"CT PORTO PJ", venc:"30", melhor:"25" },
  ];

  // Logo (Bitrix public)
  const LOGO_URL = "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=1285iby7j41w";

  // Sócios p/ rodapé (USER IDs)
  const SOCIOS = [
    { id: 1, label: "User 1" },
    { id: 27, label: "User 27" },
    { id: 15, label: "User 15" },
  ];

  // =========================
  // HELPERS
  // =========================
  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const esc = (s)=> String(s??"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

  function moneyToNumber(v){
    if(v==null || v==="") return null;
    const s = String(v).trim().replace(/\./g,"").replace(",",".").replace(/[^\d.-]/g,"");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function fmtBRL(n){
    const x = Number(n||0);
    try{ return x.toLocaleString("pt-BR",{ style:"currency", currency:"BRL" }); }
    catch(_){ return "R$ " + x.toFixed(2).replace(".",","); }
  }
  function fmtDateISO(d){
    // d: Date
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }
  function todayISO(){ return fmtDateISO(new Date()); }

  function getCfg(){
    return (window.FINANCEIRO_CFG || {});
  }

  // =========================
  // BITRIX CALL (Webhook OR Worker proxy)
  // =========================
  async function bx(method, params={}){
    const cfg = getCfg();

    // 1) Se o HTML definiu WEBHOOK_URL, chama direto
    if(cfg.WEBHOOK_URL){
      const url = cfg.WEBHOOK_URL.replace(/\/?$/,"/") + method + ".json";
      const res = await fetch(url, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(params)
      });
      const j = await res.json();
      if(!res.ok || j.error) throw new Error(j.error_description || j.error || ("HTTP "+res.status));
      return j.result;
    }

    // 2) Senão, tenta via Worker: /bx/<method>
    const url = WORKER_BASE.replace(/\/$/,"") + "/bx/" + method;
    const res = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(params)
    });

    // Se o Worker não tiver esse endpoint, vai falhar — mensagem clara
    if(!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error("Falha ao chamar Worker proxy (/bx). Configure FINANCEIRO_CFG.WEBHOOK_URL no HTML OU implemente /bx no Worker. Detalhe: " + (t||("HTTP "+res.status)));
    }

    const j = await res.json();
    if(j.error) throw new Error(j.error_description || j.error);
    return j.result;
  }

  // =========================
  // STATE
  // =========================
  const S = {
    fields: null,
    enums: {
      centro: [],
      categoria: [],
      formaPgto: [],
      tipo: [],
      conta: [],
    },
    filter: {
      month: null,
      centro: "ALL",
      stage: "DEFAULT", // DEFAULT = oculta CONCLUÍDO
      q: "",
    },
    deals: [],
    users: {}, // userId -> {PHOTO, NAME}
    balances: {}, // centroId/name -> number (manual)
  };

  const LS_BAL = "FIN_BALANCES_V1";

  function loadBalances(){
    try{
      const raw = localStorage.getItem(LS_BAL);
      S.balances = raw ? JSON.parse(raw) : {};
    }catch(_){
      S.balances = {};
    }
  }
  function saveBalances(){
    try{ localStorage.setItem(LS_BAL, JSON.stringify(S.balances||{})); }catch(_){}
  }

  // =========================
  // UI - BASE STRUCTURE
  // =========================
  function mountBase(){
    const root = document.getElementById("fin-root") || document.body;
    root.innerHTML = `
      <div id="fin-app">
        <header class="fin-header">
          <div class="fin-brand">
            <img class="fin-logo" src="${esc(LOGO_URL)}" alt="CGD"/>
            <div>
              <div class="title">Financeiro CGD</div>
              <div class="subtitle">Pipeline 27 • Controle Financeiro</div>
            </div>
          </div>

          <div class="fin-top-actions">
            <div class="fin-search">
              <span class="ico">🔎</span>
              <input id="fin-q" placeholder="Buscar por favorecido, categoria, valor..." />
            </div>

            <button class="fin-btn" id="btn-novo">NOVO</button>
            <button class="fin-btn" id="btn-lote-desp">LOTE DESPESAS</button>
            <button class="fin-btn" id="btn-lote-rec">LOTE RECEITAS</button>
            <button class="fin-btn" id="btn-cartoes">CARTÕES</button>
            <button class="fin-btn" id="btn-saldos">SALDOS</button>
            <button class="fin-btn" id="btn-transfer">TRANSFERIR</button>
            <button class="fin-btn" id="btn-refresh">ATUALIZAR</button>
          </div>
        </header>

        <aside class="fin-sidebar">
          <div class="fin-sidebox">
            <div class="label">Mês (Competência)</div>
            <select id="fin-month"></select>
          </div>

          <div class="fin-sidebox">
            <div class="label">Centro de custo</div>
            <select id="fin-centro"></select>
          </div>

          <div class="fin-sidebox">
            <div class="label">Exibir</div>
            <select id="fin-stage-mode">
              <option value="DEFAULT">Padrão (oculta CONCLUÍDO)</option>
              <option value="ALL">Todas as etapas</option>
            </select>
          </div>

          <div class="fin-sidebox">
            <div class="label">Atalhos</div>
            <div class="fin-nav">
              <button class="active" data-view="overview">Visão Geral</button>
              <button data-view="despesas">Despesas</button>
              <button data-view="receitas">Receitas</button>
              <button data-view="lancamentos">Lançamentos</button>
            </div>
          </div>

          <div class="fin-sidebox">
            <div class="label">Fundo de Reserva</div>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="fin-reserve" placeholder="R$ 0,00" />
            </div>
            <div style="margin-top:6px;font-size:11px;font-weight:900;opacity:.85">
              (Saldo manual — você pode ajustar quando quiser)
            </div>
          </div>
        </aside>

        <main class="fin-main">
          <section class="fin-panel">
            <div class="fin-panel-inner" id="fin-view"></div>
          </section>
        </main>

        <footer class="fin-footer">
          <div class="left">
            <div class="fin-avatars" id="fin-avatars"></div>
            <div class="addr">Av Ayrton Senna, 2500, SS109, Barra da Tijuca</div>
          </div>
          <div class="center">System created by GRUPO CGD</div>
          <div class="right">
            <div class="block">CGD CORRETORA<br/>CNPJ 01.654.471/0001-86 • SUSEP 202031791</div>
            <div class="block">CGD BARRA<br/>CNPJ 53.013.848/0001-11 • SUSEP 242158650</div>
          </div>
        </footer>
      </div>

      <!-- MODAL (reutilizado para NOVO / LOTE / MOVIMENTOS) -->
      <div class="fin-modal" id="fin-modal">
        <div class="fin-modal-card">
          <div class="fin-modal-top">
            <div class="title" id="fin-modal-title">Modal</div>
            <div class="actions" id="fin-modal-actions"></div>
          </div>
          <div class="fin-modal-body" id="fin-modal-body"></div>
        </div>
      </div>
    `;
  }

  // =========================
  // UI - MODAL
  // =========================
  function openModal(title, actionsHTML, bodyHTML){
    $("#fin-modal-title").textContent = title;
    $("#fin-modal-actions").innerHTML = actionsHTML;
    $("#fin-modal-body").innerHTML = bodyHTML;
    $("#fin-modal").classList.add("show");

    // binds close
    const close = ()=> closeModal();
    const btnClose = $("#fin-modal-actions [data-act='close']");
    if(btnClose) btnClose.addEventListener("click", close);
  }
  function closeModal(){
    $("#fin-modal").classList.remove("show");
    $("#fin-modal-body").innerHTML = "";
    $("#fin-modal-actions").innerHTML = "";
  }

  // =========================
  // LOAD ENUMS FROM crm.deal.fields
  // =========================
  function findFieldByKey(fieldsObj, fieldKey){
    // fieldKey is UF_...
    return fieldsObj && fieldsObj[fieldKey] ? fieldsObj[fieldKey] : null;
  }
  function enumFromField(field){
    // Bitrix: field.items might exist; otherwise field 'items' in crm.deal.fields response
    if(!field) return [];
    const items = field.items || field.ITEMS || field.values || field.VALUES;
    if(Array.isArray(items)) return items.map(x=>({ id: String(x.ID ?? x.id ?? x.VALUE ?? x.value ?? ""), name: String(x.VALUE ?? x.value ?? x.NAME ?? x.name ?? "") })).filter(x=>x.name);
    // Sometimes crm.deal.fields returns "items" as object map
    if(items && typeof items==="object"){
      return Object.keys(items).map(k=>({ id:String(k), name:String(items[k]) }));
    }
    return [];
  }

  // =========================
  // USERS (rodapé)
  // =========================
  async function loadUsers(){
    for(const u of SOCIOS){
      try{
        const r = await bx("user.get", { filter:{ ID: u.id } });
        const one = Array.isArray(r) ? r[0] : null;
        if(one){
          S.users[u.id] = {
            id: u.id,
            name: one.NAME ? (one.NAME + (one.LAST_NAME ? (" "+one.LAST_NAME) : "")) : ("User "+u.id),
            photo: one.PERSONAL_PHOTO || one.PERSONAL_PHOTO_URL || one.PERSONAL_PHOTO_FILE || ""
          };
        }
      }catch(_){
        // ignore
      }
    }
    renderFooterAvatars();
  }

  function renderFooterAvatars(){
    const wrap = $("#fin-avatars");
    if(!wrap) return;
    wrap.innerHTML = "";

    for(const u of SOCIOS){
      const info = S.users[u.id];
      if(info && info.photo){
        const img = document.createElement("img");
        img.className = "fin-avatar";
        img.src = info.photo;
        img.alt = info.name || ("User "+u.id);
        wrap.appendChild(img);
      }else{
        const div = document.createElement("div");
        div.className = "fin-avatar fallback";
        div.textContent = String(u.id);
        wrap.appendChild(div);
      }
    }
  }

  // =========================
  // MONTH OPTIONS
  // =========================
  function buildMonthOptions(){
    const sel = $("#fin-month");
    if(!sel) return;

    const now = new Date();
    const opts = [];
    for(let i=0;i<18;i++){
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,"0");
      const key = `${y}-${m}`;
      const label = d.toLocaleString("pt-BR",{ month:"long", year:"numeric" }).replace(/^\w/, c=>c.toUpperCase());
      opts.push({ key, label });
    }

    sel.innerHTML = opts.map(o=>`<option value="${esc(o.key)}">${esc(o.label)}</option>`).join("");
    S.filter.month = opts[0].key;
  }

  // =========================
  // BALANCE UI (manual)
  // =========================
  function reserveGet(){
    const v = $("#fin-reserve")?.value ?? "";
    return moneyToNumber(v) || 0;
  }
  function reserveSet(n){
    const el = $("#fin-reserve");
    if(el) el.value = fmtBRL(n || 0);
  }

  function getCentroLabelById(id){
    const it = S.enums.centro.find(x=>String(x.id)===String(id));
    return it ? it.name : (id ? String(id) : "Sem Centro");
  }

  function balanceKeyForCentro(centroId){
    // store by "id" if exists, else by name
    return centroId ? ("ID:"+String(centroId)) : "ID:__NONE__";
  }

  function getBalance(centroId){
    const k = balanceKeyForCentro(centroId);
    return Number(S.balances[k] || 0);
  }
  function setBalance(centroId, value){
    const k = balanceKeyForCentro(centroId);
    S.balances[k] = Number(value || 0);
    saveBalances();
  }

  // =========================
  // LOAD DATA (Deals)
  // =========================
  async function loadFields(){
    const fields = await bx("crm.deal.fields", {});
    S.fields = fields;

    // enums
    S.enums.centro = enumFromField(findFieldByKey(fields, F.centroCusto));
    S.enums.categoria = enumFromField(findFieldByKey(fields, F.categoria));
    S.enums.formaPgto = enumFromField(findFieldByKey(fields, F.formaPgto));
    S.enums.tipo = enumFromField(findFieldByKey(fields, F.tipo));
    S.enums.conta = enumFromField(findFieldByKey(fields, F.conta));

    // sidebar selects
    const centroSel = $("#fin-centro");
    if(centroSel){
      const all = [{ id:"ALL", name:"Todos" }, ...S.enums.centro];
      centroSel.innerHTML = all.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
      centroSel.value = "ALL";
    }
  }

  function buildDealFilter(){
    // filtro por categoria/pipeline 27 + estágio permitido
    const stageMode = $("#fin-stage-mode")?.value || "DEFAULT";
    const allowAll = stageMode === "ALL";

    const allowedStages = [
      ST27.despesaAPagar,
      ST27.despesaPaga,
      ST27.receitaAReceber,
      ST27.receitaRecebida,
      ST27.cancelado,
      ST27.concluido,
    ];

    const stages = allowAll ? allowedStages : allowedStages.filter(s=>!HIDE_STAGE_DEFAULT.has(s));

    // Centro
    const centro = $("#fin-centro")?.value || "ALL";

    // Busca
    const q = (S.filter.q || "").toLowerCase().trim();

    return { stages, centro, q };
  }

  async function loadDeals(){
    // Busca “compacta”: pega deals na categoria 27
    // Paginação simples (até 500 por padrão; dá para ampliar depois)
    const all = [];
    let start = 0;
    const limit = 50;

    for(let page=0; page<10; page++){
      const r = await bx("crm.deal.list", {
        order: { "ID": "DESC" },
        filter: { "CATEGORY_ID": 27 },
        select: [
          "ID","TITLE","STAGE_ID","CATEGORY_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
          F.tipo, F.competencia, F.valorPrev, F.valorReal, F.dataReal, F.favorecido, F.formaPgto, F.obs,
          F.categoria, F.dataPrev, F.statusFin, F.conta, F.centroCusto
        ],
        start
      });

      if(Array.isArray(r)) all.push(...r);
      // Bitrix pode retornar array + next; como estamos usando "start", se vier vazio, para
      if(!Array.isArray(r) || r.length < limit) break;
      start += limit;
      await sleep(50);
    }

    S.deals = all;
  }

  // =========================
  // VIEW RENDERING
  // =========================
  function dealTypeLabel(d){
    const v = d[F.tipo];
    const it = S.enums.tipo.find(x=>String(x.id)===String(v));
    return it ? it.name : (v ? String(v) : "");
  }
  function enumLabel(list, id){
    const it = list.find(x=>String(x.id)===String(id));
    return it ? it.name : (id ? String(id) : "");
  }
  function dealCentroLabel(d){ return enumLabel(S.enums.centro, d[F.centroCusto]); }
  function dealCategoriaLabel(d){ return enumLabel(S.enums.categoria, d[F.categoria]); }
  function dealContaLabel(d){ return enumLabel(S.enums.conta, d[F.conta]); }
  function dealFormaLabel(d){ return enumLabel(S.enums.formaPgto, d[F.formaPgto]); }

  function dealAmountPrev(d){
    const n = moneyToNumber(d[F.valorPrev]);
    return n || 0;
  }
  function dealAmountReal(d){
    const n = moneyToNumber(d[F.valorReal]);
    return n || 0;
  }

  function applyClientFilters(list){
    const { stages, centro, q } = buildDealFilter();

    return list.filter(d=>{
      if(String(d.CATEGORY_ID) !== "27") return false;
      if(!stages.includes(d.STAGE_ID)) return false;
      if(centro !== "ALL" && String(d[F.centroCusto]) !== String(centro)) return false;

      if(q){
        const hay = [
          d.TITLE, d[F.favorecido], dealCategoriaLabel(d), dealCentroLabel(d), dealContaLabel(d)
        ].map(x=>String(x||"").toLowerCase()).join(" ");
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function splitByStage(list){
    const by = {
      aPagar: [],
      pagas: [],
      aReceber: [],
      recebidas: [],
      cancelado: [],
      concluido: [],
    };
    for(const d of list){
      if(d.STAGE_ID === ST27.despesaAPagar) by.aPagar.push(d);
      else if(d.STAGE_ID === ST27.despesaPaga) by.pagas.push(d);
      else if(d.STAGE_ID === ST27.receitaAReceber) by.aReceber.push(d);
      else if(d.STAGE_ID === ST27.receitaRecebida) by.recebidas.push(d);
      else if(d.STAGE_ID === ST27.cancelado) by.cancelado.push(d);
      else if(d.STAGE_ID === ST27.concluido) by.concluido.push(d);
    }
    return by;
  }

  function calcKpis(list){
    const receitas = list.filter(d=>d.STAGE_ID===ST27.receitaAReceber || d.STAGE_ID===ST27.receitaRecebida);
    const despesas = list.filter(d=>d.STAGE_ID===ST27.despesaAPagar || d.STAGE_ID===ST27.despesaPaga);

    const rec = receitas.reduce((s,d)=> s + (dealAmountReal(d) || dealAmountPrev(d)), 0);
    const des = despesas.reduce((s,d)=> s + (dealAmountReal(d) || dealAmountPrev(d)), 0);
    const lucro = rec - des;

    // saldos manuais por centro (somatório)
    const totalSaldoManual = Object.values(S.balances||{}).reduce((a,b)=>a+Number(b||0),0);

    return { rec, des, lucro, totalSaldoManual };
  }

  function renderOverview(){
    const filtered = applyClientFilters(S.deals);
    const by = splitByStage(filtered);
    const k = calcKpis(filtered);

    const view = $("#fin-view");
    view.innerHTML = `
      <div class="fin-filters">
        <div class="fin-field">
          <label>Centro</label>
          <div style="font-weight:1000">${esc($("#fin-centro")?.selectedOptions?.[0]?.textContent || "Todos")}</div>
        </div>
        <div class="fin-field">
          <label>Exibição</label>
          <div style="font-weight:1000">${esc($("#fin-stage-mode")?.value==="ALL" ? "Todas as etapas" : "Padrão")}</div>
        </div>
        <div class="fin-spacer"></div>
        <button class="fin-mini-btn" id="btn-export">Exportar CSV (tudo)</button>
      </div>

      <div class="fin-kpis">
        <div class="fin-kpi">
          <div class="icon">💰</div>
          <div>
            <div class="value">${esc(fmtBRL(k.rec))}</div>
            <div class="label">Receitas (prev/real)</div>
          </div>
        </div>
        <div class="fin-kpi">
          <div class="icon">📉</div>
          <div>
            <div class="value">${esc(fmtBRL(k.des))}</div>
            <div class="label">Despesas (prev/real)</div>
          </div>
        </div>
        <div class="fin-kpi">
          <div class="icon">📈</div>
          <div>
            <div class="value">${esc(fmtBRL(k.lucro))}</div>
            <div class="label">Lucro (mês)</div>
          </div>
        </div>
        <div class="fin-kpi">
          <div class="icon">🏦</div>
          <div>
            <div class="value">${esc(fmtBRL(reserveGet()))}</div>
            <div class="label">Fundo de Reserva</div>
          </div>
        </div>
      </div>

      <div class="fin-lists">
        <div class="fin-card">
          <h3>Despesas — A Pagar → Pagas (checkbox)</h3>
          <ul class="fin-list" id="list-apagar">
            ${by.aPagar.slice(0,8).map(d=>itemHTML(d,"pagar")).join("")}
          </ul>
          <div style="margin-top:8px;font-size:11px;font-weight:900;color:var(--muted)">
            Marque para mover para <b>DESPESA - PAGA</b> e informar data/valor realizado.
          </div>
        </div>

        <div class="fin-card">
          <h3>Receitas — A Receber → Recebidas (checkbox)</h3>
          <ul class="fin-list" id="list-areceber">
            ${by.aReceber.slice(0,8).map(d=>itemHTML(d,"receber")).join("")}
          </ul>
          <div style="margin-top:8px;font-size:11px;font-weight:900;color:var(--muted)">
            Marque para mover para <b>RECEITA RECEBIDA</b> e informar data/valor realizado.
          </div>
        </div>
      </div>

      <!-- GRÁFICOS ABAIXO DO CHECKBOX (você pediu) -->
      <div class="fin-charts">
        <div class="fin-chartbox">
          <h3>Despesas por Categoria (mock visual)</h3>
          <div class="fin-chart-row">
            <div class="fin-donut">
              <div class="fin-donut-center">${esc(fmtBRL(k.des))}</div>
            </div>
            <div class="fin-legend" id="legend-desp"></div>
          </div>
          <div style="margin-top:8px;font-size:11px;font-weight:900;color:var(--muted)">
            *Visual mock — depois podemos renderizar por dados reais (agora já temos os dados).
          </div>
        </div>

        <div class="fin-chartbox">
          <h3>Evolução de Receitas x Despesas (mock visual)</h3>
          <div class="fin-linechart">
            <div class="fin-spark">
              <svg viewBox="0 0 600 200" preserveAspectRatio="none">
                <path class="a" d="M10,130 C120,90 180,110 240,70 C300,40 360,85 420,60 C480,45 540,50 590,30"/>
                <path class="b" d="M10,150 C120,130 180,140 240,120 C300,95 360,125 420,105 C480,110 540,105 590,95"/>
                <circle class="p" cx="10" cy="130" r="4"/><circle class="p" cx="240" cy="70" r="4"/><circle class="p" cx="590" cy="30" r="4"/>
                <circle class="p" cx="10" cy="150" r="4"/><circle class="p" cx="240" cy="120" r="4"/><circle class="p" cx="590" cy="95" r="4"/>
              </svg>
            </div>
          </div>
          <div class="fin-chart-note">
            <span class="fin-tag"><span class="sq" style="background:rgba(34,197,94,.90)"></span> Receitas</span>
            <span class="fin-tag"><span class="sq" style="background:rgba(239,68,68,.88)"></span> Despesas</span>
          </div>
        </div>
      </div>
    `;

    // Legend real (top 6 categorias por soma)
    const cats = {};
    for(const d of filtered){
      if(d.STAGE_ID===ST27.despesaAPagar || d.STAGE_ID===ST27.despesaPaga){
        const c = dealCategoriaLabel(d) || "Sem categoria";
        cats[c] = (cats[c]||0) + (dealAmountReal(d)||dealAmountPrev(d));
      }
    }
    const entries = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6);
    $("#legend-desp").innerHTML = `
      <ul>
        ${entries.map(([k,v],i)=>`
          <li>
            <span class="left"><span class="fin-sw" style="background:${["#60a5fa","#34d399","#fbbf24","#f87171","#a78bfa","#94a3b8"][i%6]}"></span>${esc(k)}</span>
            <span>${esc(fmtBRL(v))}</span>
          </li>
        `).join("")}
      </ul>
    `;

    bindOverviewActions();
  }

  function itemHTML(d, mode){
    const id = String(d.ID);
    const favorecido = d[F.favorecido] || d.TITLE || ("Deal "+id);
    const centro = dealCentroLabel(d) || "Sem centro";
    const cat = dealCategoriaLabel(d) || "Sem categoria";
    const valor = dealAmountReal(d) || dealAmountPrev(d);

    // checkbox identifica ação
    const cbId = `cb_${mode}_${id}`;

    return `
      <li class="fin-item" data-id="${esc(id)}" data-mode="${esc(mode)}">
        <div class="left">
          <input type="checkbox" id="${esc(cbId)}"/>
          <div style="min-width:0">
            <div class="name">${esc(favorecido)}</div>
            <div class="meta">${esc(centro)} • ${esc(cat)}</div>
          </div>
        </div>
        <div class="actions">
          <span class="amt">${esc(fmtBRL(valor))}</span>
          <button class="fin-mini-btn" data-act="ver">Ver</button>
          <button class="fin-mini-btn" data-act="editar">Editar</button>
          <button class="fin-mini-btn" data-act="excluir" style="color:#b91c1c">Excluir</button>
        </div>
      </li>
    `;
  }

  function bindOverviewActions(){
    // Checkbox -> abrir modal de confirmação com data/valor realizado
    $$("#fin-view .fin-item input[type='checkbox']").forEach(cb=>{
      cb.addEventListener("change", async ()=>{
        if(!cb.checked) return;
        const li = cb.closest(".fin-item");
        const id = li?.getAttribute("data-id");
        const mode = li?.getAttribute("data-mode");
        if(!id) return;

        try{
          await openRealizeModal(id, mode);
        }finally{
          cb.checked = false;
        }
      });
    });

    // Ver/Editar/Excluir
    $$("#fin-view .fin-item button[data-act]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const li = btn.closest(".fin-item");
        const id = li?.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        if(!id) return;

        if(act==="excluir"){
          const ok = confirm("Excluir este lançamento? (isso apaga o negócio no Bitrix)");
          if(!ok) return;
          await bx("crm.deal.delete", { id });
          await refresh();
          return;
        }

        if(act==="ver" || act==="editar"){
          const d = S.deals.find(x=>String(x.ID)===String(id));
          if(!d) return;
          openModal(
            act==="ver" ? "Ver lançamento" : "Editar lançamento",
            `<button class="fin-btn" data-act="close">VOLTAR</button>` + (act==="editar" ? `<button class="fin-btn" id="btn-save-edit">SALVAR</button>` : ""),
            renderEditForm(d, act==="editar")
          );

          if(act==="editar"){
            $("#btn-save-edit").addEventListener("click", async ()=>{
              const payload = readEditForm();
              await bx("crm.deal.update", { id, fields: payload });
              closeModal();
              await refresh();
            });
          }
        }
      });
    });

    $("#btn-export")?.addEventListener("click", ()=>{
      exportCSV(applyClientFilters(S.deals));
    });
  }

  async function openRealizeModal(id, mode){
    const title = (mode==="pagar") ? "Marcar DESPESA como PAGA" : "Marcar RECEITA como RECEBIDA";
    const d = S.deals.find(x=>String(x.ID)===String(id));
    if(!d) return;

    const prev = dealAmountPrev(d);
    const fav = d[F.favorecido] || d.TITLE || ("Deal "+id);

    openModal(
      title,
      `<button class="fin-btn" data-act="close">VOLTAR</button><button class="fin-btn" id="btn-confirm-realize">CONFIRMAR</button>`,
      `
        <div class="fin-card" style="border-radius:12px">
          <div style="font-weight:1000;margin-bottom:6px">${esc(fav)}</div>
          <div style="font-size:12px;font-weight:900;color:var(--muted);margin-bottom:10px">
            Previsto: <b>${esc(fmtBRL(prev))}</b>
          </div>

          <div class="fin-filters" style="border-radius:12px">
            <div class="fin-field">
              <label>Data realizada</label>
              <input id="real-date" type="date" value="${esc(todayISO())}"/>
            </div>
            <div class="fin-field">
              <label>Valor realizado</label>
              <input id="real-value" placeholder="R$ 0,00" value="${esc(fmtBRL(prev))}"/>
            </div>
          </div>

          <div style="margin-top:10px;font-size:11px;font-weight:900;color:var(--muted)">
            Isso vai mover o negócio de etapa e preencher Data/Valor Realizado.
          </div>
        </div>
      `
    );

    $("#btn-confirm-realize").addEventListener("click", async ()=>{
      const date = $("#real-date").value || todayISO();
      const val = moneyToNumber($("#real-value").value);
      if(val==null){
        alert("Informe o valor realizado.");
        return;
      }

      const fields = {};
      fields[F.dataReal] = date;
      fields[F.valorReal] = String(val);

      if(mode==="pagar"){
        await bx("crm.deal.update", { id, fields: { ...fields, STAGE_ID: ST27.despesaPaga } });
      }else{
        await bx("crm.deal.update", { id, fields: { ...fields, STAGE_ID: ST27.receitaRecebida } });
      }

      closeModal();
      await refresh();
    });
  }

  function renderEditForm(d, editable){
    const centroOpts = S.enums.centro.map(x=>`<option value="${esc(x.id)}"${String(x.id)===String(d[F.centroCusto])?" selected":""}>${esc(x.name)}</option>`).join("");
    const catOpts = S.enums.categoria.map(x=>`<option value="${esc(x.id)}"${String(x.id)===String(d[F.categoria])?" selected":""}>${esc(x.name)}</option>`).join("");
    const contaOpts = S.enums.conta.map(x=>`<option value="${esc(x.id)}"${String(x.id)===String(d[F.conta])?" selected":""}>${esc(x.name)}</option>`).join("");

    // CONTA e OBS não obrigatórios: aqui deixo livres
    return `
      <div class="fin-card" style="border-radius:12px">
        <div class="fin-filters" style="border-radius:12px">
          <div class="fin-field">
            <label>Centro</label>
            <select id="ef-centro" ${editable?"":"disabled"}>${centroOpts}</select>
          </div>
          <div class="fin-field">
            <label>Categoria</label>
            <select id="ef-cat" ${editable?"":"disabled"}>${catOpts}</select>
          </div>
          <div class="fin-field">
            <label>Favorecido</label>
            <input id="ef-fav" value="${esc(d[F.favorecido]||"")}" ${editable?"":"disabled"} />
          </div>
          <div class="fin-field">
            <label>Valor Previsto</label>
            <input id="ef-prev" value="${esc(d[F.valorPrev]||"")}" ${editable?"":"disabled"} />
          </div>
          <div class="fin-field">
            <label>Data Prevista</label>
            <input id="ef-date" type="date" value="${esc((d[F.dataPrev]||"").slice(0,10))}" ${editable?"":"disabled"} />
          </div>
          <div class="fin-field">
            <label>Conta (opcional)</label>
            <select id="ef-conta" ${editable?"":"disabled"}>
              <option value="">(vazio)</option>
              ${contaOpts}
            </select>
          </div>
          <div class="fin-field" style="flex:1;min-width:260px">
            <label>Obs (opcional)</label>
            <input id="ef-obs" value="${esc(d[F.obs]||"")}" ${editable?"":"disabled"} />
          </div>
        </div>
      </div>
    `;
  }

  function readEditForm(){
    const fields = {};
    fields[F.centroCusto] = $("#ef-centro").value || null;
    fields[F.categoria] = $("#ef-cat").value || null;
    fields[F.favorecido] = $("#ef-fav").value || "";
    fields[F.valorPrev] = $("#ef-prev").value || "";
    fields[F.dataPrev] = $("#ef-date").value || "";
    fields[F.conta] = $("#ef-conta").value || "";
    fields[F.obs] = $("#ef-obs").value || "";
    return fields;
  }

  // =========================
  // BATCH (LOTE) FULLSCREEN - 15 linhas, sem scroll
  // =========================
  function openBatchModal(kind){
    // kind: "DESP" or "REC"
    const isRec = kind==="REC";
    const title = isRec ? "LOTE RECEITAS (tela cheia)" : "LOTE DESPESAS (tela cheia)";

    const actions = `
      <button class="fin-btn" data-act="close">VOLTAR</button>
      <button class="fin-btn" id="btn-clean">LIMPAR VAZIAS</button>
      <button class="fin-btn" id="btn-add-row">+ LINHA</button>
      <button class="fin-btn" id="btn-save-batch">SALVAR</button>
    `;

    const csv = isRec ? `
      <div class="fin-file">
        <span class="hint">CSV (somente RECEITAS): Favorecido, Valor, Data</span>
        <input id="csv-file" type="file" accept=".csv,text/csv"/>
        <button class="fin-mini-btn" id="csv-load">IMPORTAR</button>
      </div>
    ` : "";

    openModal(
      title,
      actions,
      `
        <div class="fin-batch-controls">
          <div class="hint">15 linhas por padrão. CONTA e OBS são opcionais.</div>
          ${csv}
        </div>

        <div class="fin-grid" id="batch-grid">
          <div class="head">
            <div>Centro</div>
            <div>Conta (opcional)</div>
            <div>Categoria</div>
            <div>Favorecido</div>
            <div>Valor</div>
            <div>Data</div>
            <div>Recorrência</div>
            <div>Dia</div>
            <div>Obs (opcional)</div>
          </div>
          <div class="rows" id="batch-rows"></div>
        </div>

        <div class="fin-card" style="border-radius:12px">
          <div style="font-size:11px;font-weight:900;color:var(--muted)">
            Recorrência cria também lembrete na PIPELINE 17 → coluna MANUELA (C17:PREPARATION) para a USER 813.
          </div>
        </div>
      `
    );

    // build 15 rows
    const rowsWrap = $("#batch-rows");
    rowsWrap.innerHTML = "";
    for(let i=0;i<DEFAULT_BATCH_ROWS;i++){
      rowsWrap.appendChild(buildBatchRow(i, isRec));
    }

    // binds
    $("#btn-add-row").addEventListener("click", ()=>{
      const n = $$("#batch-rows .row").length;
      $("#batch-rows").appendChild(buildBatchRow(n, isRec));
    });

    $("#btn-clean").addEventListener("click", ()=>{
      $$("#batch-rows .row").forEach(row=>{
        const fav = $(".b-fav", row).value.trim();
        const val = $(".b-val", row).value.trim();
        const dt = $(".b-date", row).value.trim();
        if(!fav && !val && !dt){
          row.remove();
        }
      });
      // garante ao menos 1
      if($$("#batch-rows .row").length===0){
        $("#batch-rows").appendChild(buildBatchRow(0, isRec));
      }
    });

    $("#btn-save-batch").addEventListener("click", async ()=>{
      const entries = readBatchRows(isRec);
      if(entries.length===0){
        alert("Nada para salvar. Preencha ao menos 1 linha.");
        return;
      }
      await saveBatch(entries, isRec);
      closeModal();
      await refresh();
    });

    // CSV only receipts
    if(isRec){
      $("#csv-load").addEventListener("click", async ()=>{
        const f = $("#csv-file").files?.[0];
        if(!f){ alert("Selecione um CSV."); return; }
        const text = await f.text();
        importCSVReceitas(text);
      });
    }
  }

  function buildBatchRow(i, isRec){
    const row = document.createElement("div");
    row.className = "row";
    row.setAttribute("data-i", String(i));

    const centroOpts = S.enums.centro.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
    const contaOpts = S.enums.conta.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
    const catOpts = S.enums.categoria.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");

    // recorrência
    const recOpts = `
      <option value="AVULSA">Avulsa</option>
      <option value="SEMANAL">Semanal</option>
      <option value="MENSAL">Mensal</option>
      <option value="ANUAL">Anual</option>
      <option value="CARTAO">Cartão</option>
    `;

    row.innerHTML = `
      <select class="b-centro">${centroOpts}</select>
      <select class="b-conta">
        <option value="">(vazio)</option>
        ${contaOpts}
      </select>
      <select class="b-cat">${catOpts}</select>
      <input class="b-fav" placeholder="${isRec ? "Pagador / Recebedor" : "Favorecido"}"/>
      <input class="b-val" placeholder="0,00"/>
      <input class="b-date" type="date" value="${esc(todayISO())}"/>
      <select class="b-rec">${recOpts}</select>
      <select class="b-dia"></select>
      <input class="b-obs obs" placeholder="Opcional"/>
    `;

    // dia depende recorrência
    const recSel = $(".b-rec", row);
    const diaSel = $(".b-dia", row);
    function refreshDia(){
      const v = recSel.value;
      diaSel.innerHTML = "";

      if(v==="SEMANAL"){
        ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].forEach((d,idx)=>{
          const opt = document.createElement("option");
          opt.value = String(idx+1); // 1=Seg ... 7=Dom
          opt.textContent = d;
          diaSel.appendChild(opt);
        });
      }else if(v==="MENSAL"){
        for(let d=1; d<=31; d++){
          const opt = document.createElement("option");
          opt.value = String(d);
          opt.textContent = String(d);
          diaSel.appendChild(opt);
        }
      }else if(v==="ANUAL"){
        // Dia do ano: "DD/MM"
        for(let m=1; m<=12; m++){
          for(let d=1; d<=28; d++){ // simplificado para caber; podemos expandir se quiser
            const mm = String(m).padStart(2,"0");
            const dd = String(d).padStart(2,"0");
            const opt = document.createElement("option");
            opt.value = `${dd}/${mm}`;
            opt.textContent = `${dd}/${mm}`;
            diaSel.appendChild(opt);
          }
        }
      }else if(v==="CARTAO"){
        // escolhe cartão pelo dia (lista de cartões)
        CARDS.forEach((c,idx)=>{
          const opt = document.createElement("option");
          opt.value = c.name;
          opt.textContent = `${c.name} (venc ${c.venc}, melhor ${c.melhor})`;
          diaSel.appendChild(opt);
        });
      }else{
        // Avulsa
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "-";
        diaSel.appendChild(opt);
      }
    }
    recSel.addEventListener("change", refreshDia);
    refreshDia();

    return row;
  }

  function readBatchRows(isRec){
    const out = [];
    $$("#batch-rows .row").forEach(row=>{
      const centro = $(".b-centro", row).value || "";
      const conta = $(".b-conta", row).value || ""; // opcional
      const cat = $(".b-cat", row).value || "";
      const fav = $(".b-fav", row).value.trim();
      const val = moneyToNumber($(".b-val", row).value);
      const date = $(".b-date", row).value || "";
      const rec = $(".b-rec", row).value || "AVULSA";
      const dia = $(".b-dia", row).value || "";
      const obs = $(".b-obs", row).value || "";

      // ignora linha vazia
      if(!fav && (val==null) && !date) return;

      // valor é essencial: se não tiver, não salva (para evitar lixo no financeiro)
      if(val==null){
        throw new Error("Há linha com Favorecido preenchido mas sem Valor. Preencha o valor ou apague a linha.");
      }

      out.push({
        centro, conta, cat, fav, val, date, rec, dia, obs,
        isRec
      });
    });
    return out;
  }

  function parseCSV(text){
    // aceita ; ou ,
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    if(lines.length===0) return [];
    const sep = lines[0].includes(";") ? ";" : ",";
    const rows = lines.map(l=>{
      const parts = l.split(sep).map(x=>x.trim().replace(/^"|"$/g,""));
      return parts;
    });
    return rows;
  }

  function importCSVReceitas(text){
    // Espera: Favorecido, Valor, Data
    const rows = parseCSV(text);
    if(rows.length===0) return;

    // tenta detectar header
    let start = 0;
    const h = rows[0].map(x=>x.toLowerCase());
    if(h.includes("favorecido") || h.includes("valor") || h.includes("data")){
      start = 1;
    }

    const lines = rows.slice(start);
    const gridRows = $$("#batch-rows .row");

    for(let i=0;i<Math.min(lines.length, gridRows.length); i++){
      const r = lines[i];
      const fav = r[0] || "";
      const val = r[1] || "";
      const dt = r[2] || "";

      $(".b-fav", gridRows[i]).value = fav;
      $(".b-val", gridRows[i]).value = String(val).replace(".",",");
      // data: aceita dd/mm/yyyy ou yyyy-mm-dd
      const iso = normalizeDate(dt);
      $(".b-date", gridRows[i]).value = iso || todayISO();
    }
  }

  function normalizeDate(v){
    const s = String(v||"").trim();
    if(!s) return "";
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m){
      const dd = String(m[1]).padStart(2,"0");
      const mm = String(m[2]).padStart(2,"0");
      const yy = m[3];
      return `${yy}-${mm}-${dd}`;
    }
    return "";
  }

  async function saveBatch(entries, isRec){
    // cria deals no pipeline 27
    for(const e of entries){
      const fields = {};
      fields[F.centroCusto] = e.centro || null;
      fields[F.conta] = e.conta || ""; // opcional
      fields[F.categoria] = e.cat || null;
      fields[F.favorecido] = e.fav;
      fields[F.valorPrev] = String(e.val);
      fields[F.dataPrev] = e.date || todayISO();
      fields[F.obs] = e.obs || "";

      // tipo: receita/despesa (se tiver enum)
      // Se você quiser forçar, podemos mapear pelo valor do enum — aqui deixo só pelo stage.
      fields["CATEGORY_ID"] = 27;

      // stage conforme lote
      if(isRec){
        fields["STAGE_ID"] = ST27.receitaAReceber;
      }else{
        fields["STAGE_ID"] = ST27.despesaAPagar;
      }

      // Recorrência: gravar no TITLE e criar lembrete pipeline 17
      const recLabel = e.rec === "AVULSA" ? "AVULSA" :
                       e.rec === "SEMANAL" ? ("SEMANAL("+e.dia+")") :
                       e.rec === "MENSAL" ? ("MENSAL(dia "+e.dia+")") :
                       e.rec === "ANUAL" ? ("ANUAL("+e.dia+")") :
                       e.rec === "CARTAO" ? ("CARTAO("+e.dia+")") : e.rec;

      const title = (isRec ? "RECEITA" : "DESPESA") + " • " + e.fav + (recLabel ? (" • "+recLabel) : "");
      fields["TITLE"] = title;

      const createdId = await bx("crm.deal.add", { fields });

      // Se recorrente, cria lembrete na pipeline 17 (coluna MANUELA) para USER 813
      if(e.rec !== "AVULSA"){
        await createReminderP17({
          isRec,
          fav: e.fav,
          val: e.val,
          date: e.date,
          rec: e.rec,
          dia: e.dia,
          sourceDealId: createdId
        });
      }
    }
  }

  async function createReminderP17({isRec, fav, val, date, rec, dia, sourceDealId}){
    const fields = {};
    fields["CATEGORY_ID"] = P17.categoryId;
    fields["STAGE_ID"] = P17.stageManuela;         // MANUELA
    fields["ASSIGNED_BY_ID"] = P17.assigned813;    // USER 813

    const txtRec = rec==="SEMANAL" ? ("Semanal • dia "+dia) :
                   rec==="MENSAL" ? ("Mensal • dia "+dia) :
                   rec==="ANUAL" ? ("Anual • "+dia) :
                   rec==="CARTAO" ? ("Cartão • "+dia) : rec;

    fields["TITLE"] = (isRec ? "LEMBRETE RECEITA" : "LEMBRETE DESPESA") + " • " + fav;
    // usa OBS para amarrar
    fields[F.obs] = `Gerado pelo Financeiro. Origem Deal27=${sourceDealId}. Previsto=${fmtBRL(val)}. Data=${date||""}. Recorrência=${txtRec}`;
    await bx("crm.deal.add", { fields });
  }

  // =========================
  // CARTÕES (modal)
  // =========================
  function openCardsModal(){
    openModal(
      "CARTÕES (lançar compras e visualizar)",
      `<button class="fin-btn" data-act="close">VOLTAR</button>`,
      `
        <div class="fin-card" style="border-radius:12px">
          <div style="font-weight:1000;margin-bottom:8px">Selecione um cartão para lançar compras em lote:</div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:10px">
            ${CARDS.map(c=>`
              <button class="fin-mini-btn" data-card="${esc(c.name)}" style="padding:12px;border-radius:12px;text-align:left">
                <div style="font-weight:1000">${esc(c.name)}</div>
                <div style="font-size:11px;font-weight:900;color:var(--muted)">Venc.: ${esc(c.venc)} • Melhor dia: ${esc(c.melhor)}</div>
              </button>
            `).join("")}
          </div>

          <div style="margin-top:10px;font-size:11px;font-weight:900;color:var(--muted)">
            Ao escolher um cartão, abrimos o LOTE DESPESAS já com Recorrência = CARTÃO e “Dia” = cartão.
          </div>
        </div>
      `
    );

    $$("#fin-modal-body button[data-card]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const card = btn.getAttribute("data-card");
        // abre lote despesas e preenche primeira linha como cartão
        openBatchModal("DESP");
        // aguarda DOM
        setTimeout(()=>{
          const first = $("#batch-rows .row");
          if(first){
            $(".b-rec", first).value = "CARTAO";
            $(".b-rec", first).dispatchEvent(new Event("change"));
            $(".b-dia", first).value = card;
          }
        }, 50);
      });
    });
  }

  // =========================
  // SALDOS / TRANSFERÊNCIA (manual)
  // =========================
  function openBalancesModal(){
    const rows = S.enums.centro.map(c=>{
      const v = getBalance(c.id);
      return `
        <div style="display:grid;grid-template-columns:1fr 180px 120px;gap:8px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:12px;background:var(--panel)">
          <div style="font-weight:1000">${esc(c.name)}</div>
          <input data-centro="${esc(c.id)}" class="bal-in" value="${esc(fmtBRL(v))}" />
          <button class="fin-mini-btn" data-save-centro="${esc(c.id)}">Salvar</button>
        </div>
      `;
    }).join("");

    openModal(
      "SALDOS por Centro de Custo (manual)",
      `<button class="fin-btn" data-act="close">VOLTAR</button>`,
      `
        <div class="fin-card" style="border-radius:12px">
          <div style="font-size:11px;font-weight:900;color:var(--muted);margin-bottom:10px">
            Você pode colocar saldo inicial e ajustar depois caso dê diferença.
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${rows}
          </div>
        </div>
      `
    );

    $$("#fin-modal-body button[data-save-centro]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-save-centro");
        const inp = $(`#fin-modal-body input[data-centro="${CSS.escape(id)}"]`);
        const v = moneyToNumber(inp.value);
        if(v==null){ alert("Valor inválido."); return; }
        setBalance(id, v);
        inp.value = fmtBRL(v);
      });
    });
  }

  function openTransferModal(){
    const centroOpts = S.enums.centro.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
    openModal(
      "TRANSFERIR entre Centros de Custo (manual)",
      `<button class="fin-btn" data-act="close">VOLTAR</button><button class="fin-btn" id="btn-do-transfer">TRANSFERIR</button>`,
      `
        <div class="fin-card" style="border-radius:12px">
          <div class="fin-filters" style="border-radius:12px">
            <div class="fin-field">
              <label>De</label>
              <select id="tr-from">${centroOpts}</select>
            </div>
            <div class="fin-field">
              <label>Para</label>
              <select id="tr-to">${centroOpts}</select>
            </div>
            <div class="fin-field">
              <label>Valor</label>
              <input id="tr-val" placeholder="0,00"/>
            </div>
            <div class="fin-field" style="flex:1">
              <label>Obs</label>
              <input id="tr-obs" placeholder="Opcional"/>
            </div>
          </div>

          <div style="margin-top:10px;font-size:11px;font-weight:900;color:var(--muted)">
            Isso ajusta os saldos manuais. Se você quiser, depois podemos registrar também como lançamento no Financeiro.
          </div>
        </div>
      `
    );

    $("#btn-do-transfer").addEventListener("click", ()=>{
      const from = $("#tr-from").value;
      const to = $("#tr-to").value;
      if(from===to){ alert("Escolha centros diferentes."); return; }
      const v = moneyToNumber($("#tr-val").value);
      if(v==null || v<=0){ alert("Informe um valor válido."); return; }

      setBalance(from, getBalance(from) - v);
      setBalance(to, getBalance(to) + v);

      closeModal();
      alert("Transferência aplicada nos saldos manuais.");
    });
  }

  // =========================
  // CSV Export (todos filtros)
  // =========================
  function exportCSV(list){
    const rows = [
      ["ID","Stage","Centro","Categoria","Favorecido","ValorPrev","ValorReal","DataPrev","DataReal","Conta","Obs"]
    ];

    for(const d of list){
      rows.push([
        d.ID,
        d.STAGE_ID,
        dealCentroLabel(d),
        dealCategoriaLabel(d),
        d[F.favorecido]||"",
        d[F.valorPrev]||"",
        d[F.valorReal]||"",
        (d[F.dataPrev]||"").slice(0,10),
        (d[F.dataReal]||"").slice(0,10),
        dealContaLabel(d)||"",
        (d[F.obs]||"").replace(/\r?\n/g," ")
      ]);
    }

    const csv = rows.map(r=>r.map(v=>{
      const s = String(v??"");
      return `"${s.replace(/"/g,'""')}"`;
    }).join(";")).join("\n");

    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "financeiro_export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  // =========================
  // NAV / EVENTS
  // =========================
  function bindGlobal(){
    // nav buttons
    $$(".fin-nav button").forEach(b=>{
      b.addEventListener("click", ()=>{
        $$(".fin-nav button").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        renderOverview(); // por enquanto mantendo overview como principal
      });
    });

    $("#btn-refresh").addEventListener("click", refresh);

    $("#btn-lote-desp").addEventListener("click", ()=> openBatchModal("DESP"));
    $("#btn-lote-rec").addEventListener("click", ()=> openBatchModal("REC"));
    $("#btn-cartoes").addEventListener("click", openCardsModal);
    $("#btn-saldos").addEventListener("click", openBalancesModal);
    $("#btn-transfer").addEventListener("click", openTransferModal);

    $("#fin-q").addEventListener("input", ()=>{
      S.filter.q = $("#fin-q").value || "";
      renderOverview();
    });

    $("#fin-centro").addEventListener("change", renderOverview);
    $("#fin-stage-mode").addEventListener("change", renderOverview);

    // reserve change
    $("#fin-reserve").addEventListener("blur", ()=>{
      const v = moneyToNumber($("#fin-reserve").value);
      reserveSet(v || 0);
      renderOverview();
    });

    // modal background click to close
    $("#fin-modal").addEventListener("click", (e)=>{
      if(e.target && e.target.id==="fin-modal") closeModal();
    });
  }

  // =========================
  // REFRESH
  // =========================
  async function refresh(){
    // simples: recarrega deals e rerender
    await loadDeals();
    renderOverview();
  }

  // =========================
  // INIT
  // =========================
  async function init(){
    // monta UI
    mountBase();

    // balances
    loadBalances();
    reserveSet(reserveGet());

    // sidebar month
    buildMonthOptions();

    // carrega fields/enums
    await loadFields();

    // users footer
    await loadUsers();

    // deals
    await loadDeals();

    // binds
    bindGlobal();

    // render
    renderOverview();

    // segurança: some sentinel se existir (você pediu)
    const sentinel = document.getElementById("fin-sentinel");
    if(sentinel) sentinel.style.display = "none";
  }

  // fallback fatal UI
  function showFatal(err){
    const root = document.getElementById("fin-root") || document.body;
    root.innerHTML = `
      <div style="padding:14px;font-family:system-ui">
        <div style="font-weight:1000;font-size:14px;margin-bottom:10px">Falha ao carregar o painel</div>
        <pre style="white-space:pre-wrap;background:#fff;border:1px solid #ddd;border-radius:12px;padding:12px">${esc(err && (err.stack||err.message||err) || "Erro")}</pre>
        <div style="margin-top:10px;font-size:12px;color:#666;font-weight:800">
          Dica: se você não configurou FINANCEIRO_CFG.WEBHOOK_URL no HTML e seu Worker não tem /bx, vai dar erro de integração.
        </div>
      </div>
    `;
  }

  window.addEventListener("error", (e)=> showFatal(e.error || e.message || e));
  window.addEventListener("unhandledrejection", (e)=> showFatal(e.reason || e));

  init().catch(showFatal);
})();
