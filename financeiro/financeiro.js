(function(){
  // ========= CONFIG =========
  // ⚠️ Preencha seu webhook (com barra no final)
  // Ex.: https://b24-xxxx.bitrix24.com.br/rest/1/SEU_TOKEN/
  const WEBHOOK_BASE = "COLE_AQUI_SEU_WEBHOOK_COM_BARRA_NO_FINAL";

  const PIPELINE_FIN = 27;   // financeiro
  const PIPELINE_REM = 17;   // lembretes
  const REMINDER_USER_ID = 813; // Manuela (coluna MANUELA)

  // Stage IDs (pipeline 27)
  const STAGES = {
    EXP_PAY: "C27:NEW",                 // DESPESA - A PAGAR
    EXP_PAID: "C27:PREPARATION",        // DESPESA - PAGA
    REV_REC: "C27:UC_EQAFD7",           // RECEITA - A RECEBER
    REV_GOT: "C27:PREPAYMENT_INVOIC",   // RECEITA RECEBIDA
    CANCELED: "C27:EXECUTING",          // CANCELADO
    DONE: "C27:UC_LP2NSK",              // CONCLUÍDO (oculto default)
  };

  // Stage (pipeline 17) - coluna MANUELA
  const STAGE_REM_MANUELA = "C17:PREPARATION";

  // UF fields (deals)
  const UF = {
    TIPO: "UF_CRM_1771208061",
    COMP: "UF_CRM_1771163661",
    VAL_PREV: "UF_CRM_1770769991",
    VAL_REAL: "UF_CRM_1770770017",
    DATA_REAL: "UF_CRM_1770771170",
    FAV: "UF_CRM_1770775760",
    FORMA: "UF_CRM_1769351652",
    OBS: "UF_CRM_691385BE7D33D",
    CAT: "UF_CRM_1770770570",
    DATA_PREV: "UF_CRM_1770769767",
    STATUS: "UF_CRM_1770770088",
    CONTA: "UF_CRM_1770770758",
    CC: "UF_CRM_1771801157",
  };

  // UI constants
  const LOGO_URL = "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=1285iby7j41w";

  // Footer content
  const FOOT = {
    endereco: "Av Ayrton Senna, 2500, SS109, Barra da Tijuca",
    center: "System created by GRUPO CGD",
    rightA: "CGD CORRETORA",
    rightA2: "CNPJ 01.654.471/0001-86 • SUSEP 202031791",
    rightB: "CGD BARRA",
    rightB2: "CNPJ 53.013.848/0001-11 • SUSEP 242158650",
    users: [1,27,15],
  };

  // ========= HELPERS =========
  const $ = (sel, root=document)=> root.querySelector(sel);
  const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
  const esc = (s)=> String(s ?? "").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
  const money = (n)=>{
    const v = Number(String(n||"").replace(",", "."));
    if (!isFinite(v)) return "";
    return v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
  };
  const toNum = (s)=>{
    if (s==null) return null;
    const t = String(s).trim();
    if (!t) return null;
    const v = Number(t.replace(/\./g,"").replace(",", "."));
    return isFinite(v) ? v : null;
  };
  const ymd = (d)=>{
    if(!d) return "";
    // accepts yyyy-mm-dd already
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // accepts dd/mm/yyyy
    const m = String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m) return `${m[3]}-${m[2]}-${m[1]}`;
    return "";
  };
  const fmtDMY = (iso)=>{
    const m = String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(!m) return "";
    return `${m[3]}/${m[2]}/${m[1]}`;
  };

  function assertConfig(){
    if(!WEBHOOK_BASE || WEBHOOK_BASE.includes("COLE_AQUI")){
      throw new Error("Configure WEBHOOK_BASE no financeiro.js (com barra no final).");
    }
  }

  async function bx(method, params={}){
    assertConfig();
    const base = WEBHOOK_BASE.endsWith("/") ? WEBHOOK_BASE : (WEBHOOK_BASE + "/");
    const url = base + method + ".json";
    const r = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(params || {})
    });
    const t = await r.text();
    let j;
    try{ j = JSON.parse(t); }catch(e){ throw new Error("Resposta não-JSON do Bitrix: " + t.slice(0,200)); }
    if(!r.ok || j.error){
      throw new Error((j.error_description || j.error || ("HTTP "+r.status)) + " @ " + method);
    }
    return j;
  }

  function mount(){
    const root = document.getElementById("fin-root") || document.body;
    root.innerHTML = `
      <div class="fin-shell">
        <header class="fin-header">
          <div class="left">
            <img class="fin-logo" alt="CGD" src="${esc(LOGO_URL)}"/>
            <div>
              <div class="fin-title">Financeiro CGD</div>
              <div class="fin-subtitle">PIPELINE 27 • Deals</div>
            </div>
          </div>

          <div class="center">
            <button class="fin-tab active" data-tab="geral">Visão Geral</button>
            <button class="fin-tab" data-tab="despesas">A Pagar / Pagas</button>
            <button class="fin-tab" data-tab="receitas">A Receber / Recebidas</button>
            <button class="fin-tab" data-tab="lanc">Lançamentos</button>
          </div>

          <div class="right">
            <div class="fin-search">
              <span aria-hidden="true">🔎</span>
              <input id="fin-q" placeholder="Buscar por favorecido, categoria, valor..." />
            </div>
            <button class="fin-btn" id="fin-new">NOVO</button>
            <button class="fin-btn" id="fin-lote-exp">LOTE DESPESAS</button>
            <button class="fin-btn" id="fin-lote-rev">LOTE RECEITAS</button>
            <button class="fin-btn" id="fin-cards">CARTÕES</button>
          </div>
        </header>

        <div class="fin-body">
          <aside class="fin-sidebar">
            <div class="fin-side-title">CENTROS DE CUSTO</div>
            <div class="fin-side-list" id="fin-cc-list"></div>

            <div style="height:12px"></div>

            <div class="fin-side-title">AÇÕES</div>
            <div class="fin-side-list">
              <div class="fin-side-item" id="fin-transfer">
                <span>Transferir entre Centros</span>
                <span class="fin-side-meta">➜</span>
              </div>
              <div class="fin-side-item" id="fin-saldo">
                <span>Saldo inicial / ajuste</span>
                <span class="fin-side-meta">➜</span>
              </div>
              <div class="fin-side-item" id="fin-reserva">
                <span>Fundo de Reserva</span>
                <span class="fin-side-meta">➜</span>
              </div>
            </div>

            <div class="fin-note" style="margin-top:10px; opacity:.9">
              * Menu não mostra cartões (por pedido). Cartões ficam no botão “CARTÕES”.
            </div>
          </aside>

          <main class="fin-main">
            <section class="fin-panel">
              <div class="fin-panel-inner">

                <div class="fin-filters">
                  <div class="fin-field">
                    <label>Mês</label>
                    <select id="fin-month"></select>
                  </div>
                  <div class="fin-field">
                    <label>Categoria</label>
                    <select id="fin-cat">
                      <option value="">Todas</option>
                    </select>
                  </div>
                  <div class="fin-field">
                    <label>Status</label>
                    <select id="fin-status">
                      <option value="">Todos</option>
                      <option value="open">Pendente</option>
                      <option value="done">Pago/Recebido</option>
                      <option value="canceled">Cancelado</option>
                    </select>
                  </div>

                  <div class="fin-spacer"></div>

                  <button class="fin-mini" id="fin-refresh">Atualizar</button>
                </div>

                <!-- CHECKBOXES -->
                <div class="fin-checkblocks">
                  <div class="fin-checkcard">
                    <h3>DESPESAS</h3>
                    <div id="fin-exp-list"></div>
                    <div class="fin-muted" style="margin-top:8px">
                      Marque para mover “A PAGAR → PAGA” (vai pedir data/valor).
                    </div>
                  </div>

                  <div class="fin-checkcard">
                    <h3>RECEITAS</h3>
                    <div id="fin-rev-list"></div>
                    <div class="fin-muted" style="margin-top:8px">
                      Marque para mover “A RECEBER → RECEBIDA” (vai pedir data/valor).
                    </div>
                  </div>
                </div>

                <!-- GRÁFICOS (abaixo do checkbox) -->
                <div class="fin-graphs">
                  <div class="fin-card">
                    <h3>Despesas por Categoria (mock visual)</h3>
                    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                      <div class="fin-donut">
                        <div class="fin-donut-center" id="fin-donut-center">—</div>
                      </div>
                      <div style="flex:1; min-width:240px;">
                        <div class="fin-muted">* Neste momento é mock (visual). Depois eu ligo no real.</div>
                        <div class="fin-muted" id="fin-donut-legend" style="margin-top:8px"></div>
                      </div>
                    </div>
                  </div>

                  <div class="fin-card">
                    <h3>Evolução (mock visual)</h3>
                    <div class="fin-linechart" aria-label="Gráfico (mock)">
                      <svg viewBox="0 0 600 200" preserveAspectRatio="none">
                        <path class="a" d="M10,130 C120,90 180,110 240,70 C300,40 360,85 420,60 C480,45 540,50 590,30"/>
                        <path class="b" d="M10,150 C120,130 180,140 240,120 C300,95 360,125 420,105 C480,110 540,105 590,95"/>
                      </svg>
                    </div>
                    <div class="fin-muted" style="margin-top:8px">Receitas (verde) • Despesas (vermelho)</div>
                  </div>
                </div>

                <!-- LISTAGEM -->
                <div class="fin-tablewrap">
                  <table class="fin-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Valor</th>
                        <th>Centro de Custo</th>
                        <th>Favorecido</th>
                        <th>Categoria</th>
                        <th>Status</th>
                        <th style="text-align:right">Ações</th>
                      </tr>
                    </thead>
                    <tbody id="fin-tbody"></tbody>
                  </table>
                </div>

              </div>
            </section>
          </main>
        </div>

        <footer class="fin-footer">
          <div class="fin-foot-inner">
            <div class="fin-foot-left">
              <div class="fin-avatars" id="fin-avatars"></div>
              <div style="font-weight:900; font-size:12px; line-height:1.2">
                <div style="opacity:.95">Endereço</div>
                <div style="opacity:.85">${esc(FOOT.endereco)}</div>
              </div>
            </div>
            <div class="fin-foot-center">${esc(FOOT.center)}</div>
            <div class="fin-foot-right">
              <div>
                <div>${esc(FOOT.rightA)}</div>
                <div class="muted">${esc(FOOT.rightA2)}</div>
              </div>
              <div>
                <div>${esc(FOOT.rightB)}</div>
                <div class="muted">${esc(FOOT.rightB2)}</div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    `;
  }

  // ========= STATE =========
  const S = {
    fields: null,
    ccOptions: [],       // {id, name}
    catOptions: [],      // from deal fields
    monthOptions: [],    // from competence list
    selectedCC: "",      // centro de custo
    tab: "geral",
    deals: [],
  };

  function setSentinelHidden(){
    const s = document.getElementById("fin-sentinel");
    if(s) s.style.display = "none"; // pedido: ocultar “JS iniciou ✅”
  }

  function bindUI(){
    // Tabs
    $$(".fin-tab").forEach(b=>{
      b.addEventListener("click", ()=>{
        $$(".fin-tab").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        S.tab = b.dataset.tab || "geral";
        renderTable();
      });
    });

    $("#fin-refresh").addEventListener("click", ()=> refresh());

    $("#fin-q").addEventListener("input", ()=> renderTable());
    $("#fin-month").addEventListener("change", ()=> refresh());
    $("#fin-cat").addEventListener("change", ()=> renderTable());
    $("#fin-status").addEventListener("change", ()=> renderTable());

    $("#fin-new").addEventListener("click", ()=> openNewModal());
    $("#fin-lote-exp").addEventListener("click", ()=> openLoteModal("DESPESA"));
    $("#fin-lote-rev").addEventListener("click", ()=> openLoteModal("RECEITA"));
    $("#fin-cards").addEventListener("click", ()=> openCardsModal());

    $("#fin-transfer").addEventListener("click", ()=> openTransferModal());
    $("#fin-saldo").addEventListener("click", ()=> openSaldoModal());
    $("#fin-reserva").addEventListener("click", ()=> openReservaModal());
  }

  // ========= LOAD METADATA =========
  async function loadFields(){
    // fields + lists
    const j = await bx("crm.deal.fields", {});
    S.fields = j.result || {};

    // categorias (lista)
    const cat = S.fields[UF.CAT];
    if (cat && cat.items) {
      S.catOptions = cat.items.map(i=>({ id:i.ID, name:i.VALUE })).filter(x=>x.name && x.name !== "__QUEUE__CGD__ FILA ATENDIMENTO");
    }

    // centros de custo (lista)
    const cc = S.fields[UF.CC];
    if (cc && cc.items) {
      S.ccOptions = cc.items.map(i=>({ id:i.ID, name:i.VALUE })).filter(x=>x.name && !x.name.includes("__QUEUE__"));
    }

    // competencia (mês) (lista)
    const comp = S.fields[UF.COMP];
    if (comp && comp.items) {
      S.monthOptions = comp.items.map(i=>({ id:i.ID, name:i.VALUE }));
    } else {
      // fallback: últimos 12 meses
      const now = new Date();
      const arr=[];
      for(let k=0;k<12;k++){
        const d = new Date(now.getFullYear(), now.getMonth()-k, 1);
        const name = d.toLocaleDateString("pt-BR",{month:"long", year:"numeric"});
        arr.push({ id: name, name });
      }
      S.monthOptions = arr;
    }
  }

  function fillSelects(){
    // month
    const mSel = $("#fin-month");
    mSel.innerHTML = S.monthOptions.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("");
    // cat
    const cSel = $("#fin-cat");
    cSel.innerHTML = `<option value="">Todas</option>` + S.catOptions.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("");

    // sidebar cc list
    const ccList = $("#fin-cc-list");
    ccList.innerHTML = `
      <div class="fin-side-item ${S.selectedCC===""?"active":""}" data-cc="">
        <span>TODOS</span><span class="fin-side-meta">•</span>
      </div>
      ${S.ccOptions.map(o=>`
        <div class="fin-side-item ${S.selectedCC===String(o.id)?"active":""}" data-cc="${esc(o.id)}">
          <span>${esc(o.name)}</span><span class="fin-side-meta">➜</span>
        </div>
      `).join("")}
    `;
    $$(".fin-side-item[data-cc]", ccList).forEach(el=>{
      el.addEventListener("click", ()=>{
        S.selectedCC = el.dataset.cc || "";
        fillSelects();
        renderTable();
        renderChecklists();
      });
    });
  }

  // ========= DEALS =========
  function stageIsAllowed(stageId){
    // bloquear QUEUE_JSON e outros stages fora da lista permitida
    return [STAGES.EXP_PAY, STAGES.EXP_PAID, STAGES.REV_REC, STAGES.REV_GOT, STAGES.CANCELED, STAGES.DONE].includes(stageId);
  }

  async function loadDeals(){
    // lista básica (poderíamos paginar depois)
    const month = $("#fin-month").value || "";
    const filter = {
      "CATEGORY_ID": PIPELINE_FIN,
      // ocultar CONCLUÍDO por padrão: não filtra aqui; filtra na renderização (para manter no filtro)
    };

    // competência: você perguntou. Aqui:
    // - Para recorrentes, você pode deixar competência vazia.
    // - Para a visão mensal, a gente filtra se existir competência.
    // Vou filtrar pelo mês SOMENTE se o usuário escolheu um mês.
    if (month) filter[UF.COMP] = month;

    const j = await bx("crm.deal.list", {
      order: { "ID":"DESC" },
      filter,
      select: ["ID","TITLE","STAGE_ID",UF.TIPO,UF.VAL_PREV,UF.VAL_REAL,UF.DATA_PREV,UF.DATA_REAL,UF.FAV,UF.CAT,UF.CC,UF.OBS,UF.CONTA,UF.COMP]
    });

    const list = (j.result || []).filter(d => stageIsAllowed(d.STAGE_ID));
    // limpar “__QUEUE__...” em favorecido
    list.forEach(d=>{
      if (String(d[UF.FAV]||"").includes("__QUEUE__")) d[UF.FAV] = "";
    });
    S.deals = list;
  }

  function dealTypeLabel(d){
    const t = String(d[UF.TIPO]||"").toUpperCase();
    if (t.includes("RECE")) return "Receita";
    if (t.includes("DESP")) return "Despesa";
    // fallback por stage
    if ([STAGES.REV_REC, STAGES.REV_GOT].includes(d.STAGE_ID)) return "Receita";
    return "Despesa";
  }

  function dealStatusLabel(d){
    if (d.STAGE_ID === STAGES.EXP_PAY) return "A pagar";
    if (d.STAGE_ID === STAGES.EXP_PAID) return "Paga";
    if (d.STAGE_ID === STAGES.REV_REC) return "A receber";
    if (d.STAGE_ID === STAGES.REV_GOT) return "Recebida";
    if (d.STAGE_ID === STAGES.CANCELED) return "Cancelado";
    if (d.STAGE_ID === STAGES.DONE) return "Concluído";
    return d.STAGE_ID || "";
  }

  function shouldShowDeal(d){
    const q = ($("#fin-q").value || "").trim().toLowerCase();
    const cat = $("#fin-cat").value || "";
    const status = $("#fin-status").value || "";

    // sidebar CC filter
    if (S.selectedCC && String(d[UF.CC]||"") !== String(S.selectedCC)) return false;

    // default hide CONCLUÍDO, mas acessível no filtro:
    // regra: se status estiver vazio, não mostra concluído
    if (!status && d.STAGE_ID === STAGES.DONE) return false;

    if (cat && String(d[UF.CAT]||"") !== String(cat)) return false;

    if (status === "open") {
      if (![STAGES.EXP_PAY, STAGES.REV_REC].includes(d.STAGE_ID)) return false;
    } else if (status === "done") {
      if (![STAGES.EXP_PAID, STAGES.REV_GOT, STAGES.DONE].includes(d.STAGE_ID)) return false;
    } else if (status === "canceled") {
      if (d.STAGE_ID !== STAGES.CANCELED) return false;
    }

    if (q) {
      const hay = [
        d.TITLE, d[UF.FAV], d[UF.OBS],
        getNameById(S.catOptions, d[UF.CAT]),
        getNameById(S.ccOptions, d[UF.CC]),
        String(d[UF.VAL_PREV]||""), String(d[UF.VAL_REAL]||"")
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  }

  function renderTable(){
    const tb = $("#fin-tbody");
    const list = S.deals.filter(shouldShowDeal);

    // Tab filter
    const tab = S.tab;
    const filtered = list.filter(d=>{
      if (tab === "despesas") return ["Despesa"].includes(dealTypeLabel(d));
      if (tab === "receitas") return ["Receita"].includes(dealTypeLabel(d));
      if (tab === "lanc") return true;
      return true;
    });

    tb.innerHTML = filtered.map(d=>{
      const tipo = dealTypeLabel(d);
      const dt = fmtDMY(d[UF.DATA_PREV] || d[UF.DATA_REAL] || "");
      const val = money(d[UF.VAL_PREV] || d[UF.VAL_REAL] || "");
      const cc = getNameById(S.ccOptions, d[UF.CC]);
      const fav = d[UF.FAV] || d.TITLE || "";
      const cat = getNameById(S.catOptions, d[UF.CAT]);
      const st = dealStatusLabel(d);

      return `
        <tr data-id="${esc(d.ID)}">
          <td>${esc(dt)}</td>
          <td>${esc(tipo)}</td>
          <td>${esc(val)}</td>
          <td>${esc(cc)}</td>
          <td>${esc(fav)}</td>
          <td>${esc(cat)}</td>
          <td>${esc(st)}</td>
          <td>
            <div class="fin-row-actions">
              <button class="fin-mini" data-act="view">Ver</button>
              <button class="fin-mini" data-act="edit">Editar</button>
              <button class="fin-mini fin-danger" data-act="del">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="8" style="padding:14px; color:var(--muted); font-weight:900">Sem itens para os filtros atuais.</td></tr>`;

    // bind row actions
    $$("button[data-act]", tb).forEach(b=>{
      b.addEventListener("click", ()=>{
        const tr = b.closest("tr");
        const id = tr?.dataset?.id;
        const act = b.dataset.act;
        const d = S.deals.find(x=>String(x.ID)===String(id));
        if(!d) return;
        if(act==="view") openViewModal(d);
        if(act==="edit") openEditModal(d);
        if(act==="del") confirmDelete(d);
      });
    });

    renderDonutMock(list);
  }

  function renderChecklists(){
    const expBox = $("#fin-exp-list");
    const revBox = $("#fin-rev-list");

    const list = S.deals.filter(d=>{
      if (!S.selectedCC) return true;
      return String(d[UF.CC]||"") === String(S.selectedCC);
    });

    const exps = list.filter(d=> d.STAGE_ID === STAGES.EXP_PAY).slice(0, 8);
    const revs = list.filter(d=> d.STAGE_ID === STAGES.REV_REC).slice(0, 8);

    expBox.innerHTML = exps.map(d=> checkboxRow(d, "EXP") ).join("") || `<div class="fin-muted">Nada em “A PAGAR”.</div>`;
    revBox.innerHTML = revs.map(d=> checkboxRow(d, "REV") ).join("") || `<div class="fin-muted">Nada em “A RECEBER”.</div>`;

    $$("input[type=checkbox][data-move]", expBox).forEach(cb=>{
      cb.addEventListener("change", async ()=>{
        cb.checked = false;
        const id = cb.dataset.id;
        const deal = S.deals.find(x=>String(x.ID)===String(id));
        if(!deal) return;
        await openMarkDoneModal(deal, "EXP");
      });
    });

    $$("input[type=checkbox][data-move]", revBox).forEach(cb=>{
      cb.addEventListener("change", async ()=>{
        cb.checked = false;
        const id = cb.dataset.id;
        const deal = S.deals.find(x=>String(x.ID)===String(id));
        if(!deal) return;
        await openMarkDoneModal(deal, "REV");
      });
    });
  }

  function checkboxRow(d, kind){
    const dt = fmtDMY(d[UF.DATA_PREV] || "");
    const val = money(d[UF.VAL_PREV] || "");
    const name = d[UF.FAV] || d.TITLE || "(sem favorecido)";
    const cc = getNameById(S.ccOptions, d[UF.CC]);
    return `
      <div class="fin-checkrow">
        <div class="left">
          <input type="checkbox" data-move="1" data-kind="${esc(kind)}" data-id="${esc(d.ID)}"/>
          <div>
            <div class="name">${esc(name)}</div>
            <div class="meta">${esc(dt)} • ${esc(cc)}</div>
          </div>
        </div>
        <div class="amt">${esc(val)}</div>
      </div>
    `;
  }

  function getNameById(arr, id){
    const it = arr.find(x=>String(x.id)===String(id));
    return it ? it.name : "";
  }

  // ========= MODALS =========
  function openModal({title, full=false, bodyHTML="", footerHTML="", onMount}){
    const bd = document.createElement("div");
    bd.className = "fin-modal-backdrop";
    bd.innerHTML = `
      <div class="fin-modal ${full?"full":""}">
        <div class="fin-modal-head">
          <div class="fin-modal-title">${esc(title)}</div>
          <div style="display:flex; gap:8px; align-items:center">
            <button class="fin-mini" data-close>Voltar</button>
          </div>
        </div>
        <div class="fin-modal-body">${bodyHTML}</div>
        ${footerHTML ? `<div class="fin-modal-foot">${footerHTML}</div>` : ``}
      </div>
    `;
    bd.addEventListener("click", (e)=>{
      if(e.target === bd) bd.remove();
    });
    $("[data-close]", bd).addEventListener("click", ()=> bd.remove());
    document.body.appendChild(bd);
    onMount && onMount(bd);
    return bd;
  }

  function openViewModal(d){
    openModal({
      title: `Ver • #${d.ID}`,
      bodyHTML: `
        <div class="fin-gridform">
          ${fieldRO("Favorecido", d[UF.FAV] || d.TITLE || "")}
          ${fieldRO("Tipo", dealTypeLabel(d))}
          ${fieldRO("Status", dealStatusLabel(d))}
          ${fieldRO("Centro de Custo", getNameById(S.ccOptions, d[UF.CC]))}
          ${fieldRO("Categoria", getNameById(S.catOptions, d[UF.CAT]))}
          ${fieldRO("Valor previsto", money(d[UF.VAL_PREV]))}
          ${fieldRO("Data prevista", fmtDMY(d[UF.DATA_PREV]))}
          ${fieldRO("Valor realizado", money(d[UF.VAL_REAL]))}
          ${fieldRO("Data realizada", fmtDMY(d[UF.DATA_REAL]))}
          ${fieldRO("Conta", d[UF.CONTA] || "")}
          ${fieldRO("Obs", d[UF.OBS] || "")}
        </div>
      `
    });
  }

  function fieldRO(label, value){
    return `
      <div class="fin-field" style="width:100%">
        <label>${esc(label)}</label>
        <input value="${esc(value||"")}" readonly/>
      </div>
    `;
  }

  function openEditModal(d){
    openModal({
      title: `Editar • #${d.ID}`,
      bodyHTML: `
        <div class="fin-gridform">
          ${fieldInp("Favorecido", "fav", d[UF.FAV] || "")}
          ${selectInp("Tipo", "tipo", [
            {id:"RECEITA", name:"RECEITA"},
            {id:"DESPESA", name:"DESPESA"}
          ], String(d[UF.TIPO]||""))}
          ${selectInp("Categoria", "cat", S.catOptions, String(d[UF.CAT]||""))}
          ${selectInp("Centro de Custo", "cc", S.ccOptions, String(d[UF.CC]||""))}
          ${fieldInp("Valor previsto", "vp", String(d[UF.VAL_PREV]||""))}
          ${fieldInp("Data prevista", "dp", fmtDMY(d[UF.DATA_PREV]||""), "date")}
          ${fieldInp("Conta (opcional)", "conta", String(d[UF.CONTA]||""))}
          ${fieldInp("Obs (opcional)", "obs", String(d[UF.OBS]||""))}
        </div>
        <div class="fin-note" style="margin-top:10px">
          * Valor/Data realizados são preenchidos no ato de pagar/receber (checkbox).
        </div>
      `,
      footerHTML: `
        <button class="fin-mini" data-save>Salvar</button>
      `,
      onMount: (bd)=>{
        $("[data-save]", bd).addEventListener("click", async ()=>{
          const body = {
            id: d.ID,
            fields: {
              [UF.FAV]: $("#m-fav", bd).value.trim(),
              [UF.TIPO]: $("#m-tipo", bd).value,
              [UF.CAT]: $("#m-cat", bd).value || null,
              [UF.CC]: $("#m-cc", bd).value || null,
              [UF.VAL_PREV]: toNum($("#m-vp", bd).value),
              [UF.DATA_PREV]: ymd($("#m-dp", bd).value),
              [UF.CONTA]: $("#m-conta", bd).value.trim(),
              [UF.OBS]: $("#m-obs", bd).value.trim(),
            }
          };
          await bx("crm.deal.update", body);
          bd.remove();
          await refresh();
        });
      }
    });
  }

  function fieldInp(label, id, value="", type="text"){
    return `
      <div class="fin-field" style="width:100%">
        <label>${esc(label)}</label>
        <input id="m-${esc(id)}" type="${esc(type)}" value="${esc(value||"")}" />
      </div>
    `;
  }
  function selectInp(label, id, arr, cur=""){
    return `
      <div class="fin-field" style="width:100%">
        <label>${esc(label)}</label>
        <select id="m-${esc(id)}">
          <option value=""></option>
          ${arr.map(o=>`<option value="${esc(o.id)}" ${String(cur)===String(o.id)?"selected":""}>${esc(o.name)}</option>`).join("")}
        </select>
      </div>
    `;
  }

  async function confirmDelete(d){
    const bd = openModal({
      title: "Excluir lançamento",
      bodyHTML: `
        <div style="font-weight:950; margin-bottom:8px">Tem certeza que quer excluir?</div>
        <div class="fin-note">ID #${esc(d.ID)} • ${esc(d[UF.FAV]||d.TITLE||"")}</div>
      `,
      footerHTML: `
        <button class="fin-mini" data-ok>Sim, excluir</button>
        <button class="fin-mini" data-no>Cancelar</button>
      `,
      onMount: (bd)=>{
        $("[data-no]", bd).addEventListener("click", ()=> bd.remove());
        $("[data-ok]", bd).addEventListener("click", async ()=>{
          await bx("crm.deal.delete", { id: d.ID });
          bd.remove();
          await refresh();
        });
      }
    });
  }

  async function openMarkDoneModal(d, kind){
    const isExp = kind === "EXP";
    const title = isExp ? "Marcar DESPESA como PAGA" : "Marcar RECEITA como RECEBIDA";
    const today = new Date().toISOString().slice(0,10);

    const bd = openModal({
      title,
      bodyHTML: `
        <div class="fin-gridform">
          ${fieldInp("Data realizada", "realdate", today, "date")}
          ${fieldInp("Valor realizado", "realval", String(d[UF.VAL_PREV]||""), "text")}
          ${fieldInp("Obs (opcional)", "realobs", String(d[UF.OBS]||""))}
        </div>
        <div class="fin-note" style="margin-top:10px">
          * Vai mover a etapa automaticamente e preencher Valor/Data realizados.
        </div>
      `,
      footerHTML: `
        <button class="fin-mini" data-ok>Confirmar</button>
      `,
      onMount: (bd)=>{
        $("[data-ok]", bd).addEventListener("click", async ()=>{
          const realDate = ymd($("#m-realdate", bd).value);
          const realVal = toNum($("#m-realval", bd).value);
          const realObs = $("#m-realobs", bd).value.trim();

          const stageTo = isExp ? STAGES.EXP_PAID : STAGES.REV_GOT;

          await bx("crm.deal.update", {
            id: d.ID,
            fields: {
              STAGE_ID: stageTo,
              [UF.DATA_REAL]: realDate || null,
              [UF.VAL_REAL]: (realVal==null ? null : realVal),
              [UF.OBS]: realObs,
            }
          });

          bd.remove();
          await refresh();
        });
      }
    });
  }

  function openNewModal(){
    openModal({
      title: "Novo lançamento",
      bodyHTML: `
        <div class="fin-gridform">
          ${selectInp("Tipo", "ntipo", [{id:"DESPESA",name:"DESPESA"},{id:"RECEITA",name:"RECEITA"}], "DESPESA")}
          ${selectInp("Centro de Custo", "ncc", S.ccOptions, S.selectedCC||"")}
          ${selectInp("Categoria", "ncat", S.catOptions, "")}
          ${fieldInp("Favorecido", "nfav", "")}
          ${fieldInp("Valor", "nval", "")}
          ${fieldInp("Data prevista", "ndp", new Date().toISOString().slice(0,10), "date")}
          ${fieldInp("Conta (opcional)", "nconta", "")}
          ${fieldInp("Obs (opcional)", "nobs", "")}

          <div class="fin-field" style="width:100%">
            <label>Recorrência</label>
            <select id="m-nrec">
              <option value="AVULSO">Avulso</option>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSAL">Mensal</option>
              <option value="ANUAL">Anual</option>
            </select>
          </div>

          <div class="fin-field" style="width:100%" id="rec-week-wrap" style="display:none">
            <label>Dia da semana</label>
            <select id="m-nweekday">
              <option value="1">Segunda</option><option value="2">Terça</option><option value="3">Quarta</option>
              <option value="4">Quinta</option><option value="5">Sexta</option><option value="6">Sábado</option><option value="0">Domingo</option>
            </select>
          </div>

          <div class="fin-field" style="width:100%" id="rec-month-wrap" style="display:none">
            <label>Dia do mês</label>
            <input id="m-nmonthday" type="number" min="1" max="31" value="1"/>
          </div>

          <div class="fin-field" style="width:100%" id="rec-year-wrap" style="display:none">
            <label>Dia/Mês</label>
            <input id="m-nyearmd" placeholder="ex: 15/04"/>
          </div>
        </div>

        <div class="fin-note" style="margin-top:10px">
          Competência: você pode deixar vazio em recorrências. A visão mensal usa Competência quando existir.
        </div>
      `,
      footerHTML: `
        <button class="fin-mini" data-save>Salvar</button>
      `,
      onMount: (bd)=>{
        const recSel = $("#m-nrec", bd);
        const wk = $("#rec-week-wrap", bd);
        const mo = $("#rec-month-wrap", bd);
        const yr = $("#rec-year-wrap", bd);

        function recUI(){
          const v = recSel.value;
          wk.style.display = (v==="SEMANAL") ? "" : "none";
          mo.style.display = (v==="MENSAL") ? "" : "none";
          yr.style.display = (v==="ANUAL") ? "" : "none";
        }
        recSel.addEventListener("change", recUI);
        recUI();

        $("[data-save]", bd).addEventListener("click", async ()=>{
          const tipo = $("#m-ntipo", bd).value;
          const cc = $("#m-ncc", bd).value || null;
          const cat = $("#m-ncat", bd).value || null;
          const fav = $("#m-nfav", bd).value.trim();
          const val = toNum($("#m-nval", bd).value);
          const dp = ymd($("#m-ndp", bd).value);
          const conta = $("#m-nconta", bd).value.trim();
          const obs = $("#m-nobs", bd).value.trim();

          const stage = (tipo==="RECEITA") ? STAGES.REV_REC : STAGES.EXP_PAY;

          const created = await bx("crm.deal.add", {
            fields: {
              TITLE: fav || (tipo==="RECEITA" ? "Receita" : "Despesa"),
              CATEGORY_ID: PIPELINE_FIN,
              STAGE_ID: stage,
              [UF.TIPO]: tipo,
              [UF.CC]: cc,
              [UF.CAT]: cat,
              [UF.FAV]: fav,
              [UF.VAL_PREV]: val,
              [UF.DATA_PREV]: dp || null,
              [UF.CONTA]: conta,
              [UF.OBS]: obs,
            }
          });

          // Recorrência: neste momento eu só salvo o “modelo” no deal (sem automatizar criação futura),
          // porque automatizar geração periódica sem Worker/automation server não roda sozinho.
          // MAS: se você quiser, eu deixo “criar X ocorrências” agora (ex.: próximos 12 meses) — dá pra fazer só no JS.
          // Como você pediu “negócio recorrente com lembretes na pipeline 17”, isso exige criar deals na 17 no ato.
          // Então: se NÃO for avulso, eu crio um lembrete AGORA na pipeline 17 (coluna Manuela).
          const rec = $("#m-nrec", bd).value;
          if(rec !== "AVULSO"){
            await createReminderForManuela({
              baseDealId: created.result,
              tipo, fav, val, dp,
              rec,
              weekday: $("#m-nweekday", bd)?.value,
              monthday: $("#m-nmonthday", bd)?.value,
              yearmd: $("#m-nyearmd", bd)?.value,
            });
          }

          bd.remove();
          await refresh();
        });
      }
    });
  }

  async function createReminderForManuela(info){
    const title = `LEMBRETE FINANCEIRO (${info.rec}) • ${info.tipo} • ${info.fav || "Sem favorecido"}`;
    const desc = [
      `Origem: Painel Financeiro`,
      `Deal Financeiro: ${info.baseDealId}`,
      `Tipo: ${info.tipo}`,
      `Favorecido: ${info.fav || ""}`,
      `Valor: ${info.val!=null ? money(info.val) : ""}`,
      `Data prevista: ${info.dp ? fmtDMY(info.dp) : ""}`,
      `Recorrência: ${info.rec}`,
      info.rec==="SEMANAL" ? `Dia da semana: ${info.weekday}` : "",
      info.rec==="MENSAL" ? `Dia do mês: ${info.monthday}` : "",
      info.rec==="ANUAL" ? `Dia/Mês: ${info.yearmd}` : "",
    ].filter(Boolean).join("\n");

    await bx("crm.deal.add", {
      fields: {
        TITLE: title,
        CATEGORY_ID: PIPELINE_REM,
        STAGE_ID: STAGE_REM_MANUELA,
        ASSIGNED_BY_ID: REMINDER_USER_ID,
        COMMENTS: desc,
      }
    });
  }

  function openLoteModal(tipo){
    const isRec = (tipo==="RECEITA");
    const title = isRec ? "LOTE RECEITAS" : "LOTE DESPESAS";

    const rows = 15;
    const bd = openModal({
      title,
      full:true,
      bodyHTML: `
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px">
          <button class="fin-mini" data-add>+ linha</button>
          <button class="fin-mini" data-clean>Limpar linhas vazias</button>
          ${isRec ? `<button class="fin-mini" data-csv>Importar CSV (Favorecido, Valor, Data)</button>` : ``}
          <div class="fin-note">CONTA e OBS são opcionais.</div>
        </div>

        <table class="fin-lote-table">
          <thead>
            <tr>
              <th>Centro de Custo</th>
              <th>Conta (opcional)</th>
              <th>Categoria</th>
              <th>Favorecido</th>
              <th>Valor</th>
              <th>Data Prevista</th>
              <th>Obs (opcional)</th>
              <th>Recorrência</th>
              <th>Dia</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="lote-body"></tbody>
        </table>

        <input type="file" id="lote-file" accept=".csv" style="display:none"/>
      `,
      footerHTML: `
        <button class="fin-mini" data-save>Criar lançamentos</button>
      `,
      onMount: (bd)=>{
        const tb = $("#lote-body", bd);

        function rowTemplate(){
          const ccSel = optSelect("cc", S.ccOptions, S.selectedCC||"");
          const catSel = optSelect("cat", S.catOptions, "");
          const recSel = `
            <select data-k="rec">
              <option value="AVULSO">Avulso</option>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSAL">Mensal</option>
              <option value="ANUAL">Anual</option>
            </select>
          `;
          const dayField = `<input data-k="day" placeholder="ex: 2 (sem), 15 (mês), 15/04 (anual)"/>`;
          return `
            <tr>
              <td>${ccSel}</td>
              <td><input data-k="conta" placeholder="Conta"/></td>
              <td>${catSel}</td>
              <td><input data-k="fav" placeholder="Favorecido"/></td>
              <td><input data-k="val" placeholder="0,00"/></td>
              <td><input data-k="dp" type="date"/></td>
              <td><input data-k="obs" placeholder="Obs"/></td>
              <td>${recSel}</td>
              <td>${dayField}</td>
              <td><button class="fin-mini fin-danger" data-del>✕</button></td>
            </tr>
          `;
        }

        function addRow(n=1){
          for(let i=0;i<n;i++){
            const tr = document.createElement("tbody");
            tr.innerHTML = rowTemplate();
            const row = tr.firstElementChild;
            tb.appendChild(row);

            $("[data-del]", row).addEventListener("click", ()=>{
              row.remove();
            });

            // rec enable guide
            const rec = $("[data-k=rec]", row);
            const day = $("[data-k=day]", row);
            function hint(){
              const v = rec.value;
              day.disabled = (v==="AVULSO");
              day.placeholder =
                v==="SEMANAL" ? "0-6 (dom=0)" :
                v==="MENSAL" ? "1-31" :
                v==="ANUAL" ? "dd/mm (ex 15/04)" :
                "—";
            }
            rec.addEventListener("change", hint);
            hint();
          }
        }

        addRow(rows);

        $("[data-add]", bd).addEventListener("click", ()=> addRow(1));
        $("[data-clean]", bd).addEventListener("click", ()=>{
          $$("#lote-body tr", bd).forEach(tr=>{
            const fav = ($("[data-k=fav]", tr)?.value||"").trim();
            const val = ($("[data-k=val]", tr)?.value||"").trim();
            const dp = ($("[data-k=dp]", tr)?.value||"").trim();
            const cat = ($("[data-k=cat]", tr)?.value||"").trim();
            if(!fav && !val && !dp && !cat) tr.remove();
          });
        });

        if(isRec){
          $("[data-csv]", bd).addEventListener("click", ()=> $("#lote-file", bd).click());
          $("#lote-file", bd).addEventListener("change", async (e)=>{
            const f = e.target.files?.[0];
            if(!f) return;
            const text = await f.text();
            const lines = text.split(/\r?\n/).filter(Boolean);
            // assume header
            const rows = lines.slice(1).map(l=> l.split(";").length>1 ? l.split(";") : l.split(","));
            // each: Favorecido, Valor, Data
            // preenche nas primeiras linhas existentes
            rows.slice(0, 60).forEach((cols, idx)=>{
              const fav = (cols[0]||"").trim();
              const val = (cols[1]||"").trim();
              const dt = (cols[2]||"").trim();
              let tr = $$("#lote-body tr", bd)[idx];
              if(!tr){
                addRow(1);
                tr = $$("#lote-body tr", bd)[idx];
              }
              $("[data-k=fav]", tr).value = fav;
              $("[data-k=val]", tr).value = val;
              const iso = ymd(dt);
              if(iso) $("[data-k=dp]", tr).value = iso;
            });
          });
        }

        $("[data-save]", bd).addEventListener("click", async ()=>{
          const trs = $$("#lote-body tr", bd);
          const tasks = [];
          for(const tr of trs){
            const cc = $("[data-k=cc]", tr).value || null;
            const conta = $("[data-k=conta]", tr).value.trim();
            const cat = $("[data-k=cat]", tr).value || null;
            const fav = $("[data-k=fav]", tr).value.trim();
            const val = toNum($("[data-k=val]", tr).value);
            const dp = ymd($("[data-k=dp]", tr).value);
            const obs = $("[data-k=obs]", tr).value.trim();
            const rec = $("[data-k=rec]", tr).value;
            const day = $("[data-k=day]", tr).value.trim();

            // linha vazia
            if(!fav && val==null && !dp && !cat) continue;

            const stage = isRec ? STAGES.REV_REC : STAGES.EXP_PAY;
            const tipoUF = isRec ? "RECEITA" : "DESPESA";

            tasks.push(async ()=>{
              const created = await bx("crm.deal.add", {
                fields: {
                  TITLE: fav || (isRec ? "Receita" : "Despesa"),
                  CATEGORY_ID: PIPELINE_FIN,
                  STAGE_ID: stage,
                  [UF.TIPO]: tipoUF,
                  [UF.CC]: cc,
                  [UF.CONTA]: conta, // opcional
                  [UF.CAT]: cat,
                  [UF.FAV]: fav,
                  [UF.VAL_PREV]: val,
                  [UF.DATA_PREV]: dp || null,
                  [UF.OBS]: obs, // opcional
                }
              });

              if(rec !== "AVULSO"){
                await createReminderForManuela({
                  baseDealId: created.result,
                  tipo: tipoUF, fav, val, dp,
                  rec,
                  weekday: day,
                  monthday: day,
                  yearmd: day,
                });
              }
            });
          }

          // executa em série para não estourar limite
          for(const fn of tasks) await fn();
          bd.remove();
          await refresh();
        });
      }
    });
  }

  function optSelect(key, arr, cur){
    return `
      <select data-k="${esc(key)}">
        <option value=""></option>
        ${arr.map(o=>`<option value="${esc(o.id)}" ${String(cur)===String(o.id)?"selected":""}>${esc(o.name)}</option>`).join("")}
      </select>
    `;
  }

  function openCardsModal(){
    openModal({
      title: "Cartões de Crédito",
      bodyHTML: `
        <div class="fin-note" style="margin-bottom:10px">
          Aqui é o módulo de cartões (você pediu fora do menu lateral).  
          Eu preciso que você me diga **onde os lançamentos de cartão ficam**:
          - ficam também na PIPELINE 27 com algum campo “Forma de pagamento” = cartão?
          - ou existe outro lugar?
          <br><br>
          (Sem isso, eu monto só o modal visual e não tenho como listar/filtrar certo.)
        </div>
        <div class="fin-card">
          <h3>CT ITAÚ PJ</h3>
          <div class="fin-muted">Venc: 02 • Melhor dia: 21</div>
          <button class="fin-mini" style="margin-top:8px">Abrir</button>
        </div>
        <div class="fin-card" style="margin-top:10px">
          <h3>CT PORTO PF</h3>
          <div class="fin-muted">Venc: 10 • Melhor dia: 04</div>
          <button class="fin-mini" style="margin-top:8px">Abrir</button>
        </div>
      `
    });
  }

  function openTransferModal(){
    openModal({
      title: "Transferir entre Centros de Custo",
      bodyHTML: `
        <div class="fin-gridform">
          ${selectInp("De (Centro)", "tfrom", S.ccOptions, S.selectedCC||"")}
          ${selectInp("Para (Centro)", "tto", S.ccOptions, "")}
          ${fieldInp("Valor", "tval", "")}
          ${fieldInp("Data", "tdp", new Date().toISOString().slice(0,10), "date")}
          ${fieldInp("Obs (opcional)", "tobs", "Transferência entre centros")}
        </div>
        <div class="fin-note" style="margin-top:10px">
          Isso cria 2 lançamentos: 1 despesa no “De” e 1 receita no “Para”.
        </div>
      `,
      footerHTML: `<button class="fin-mini" data-ok>Transferir</button>`,
      onMount:(bd)=>{
        $("[data-ok]", bd).addEventListener("click", async ()=>{
          const from = $("#m-tfrom", bd).value || null;
          const to = $("#m-tto", bd).value || null;
          const val = toNum($("#m-tval", bd).value);
          const dp = ymd($("#m-tdp", bd).value);
          const obs = $("#m-tobs", bd).value.trim();

          if(!from || !to || from===to || val==null){
            alert("Preencha centros diferentes e valor.");
            return;
          }

          // despesa
          await bx("crm.deal.add", {
            fields:{
              TITLE:"Transferência (Saída)",
              CATEGORY_ID: PIPELINE_FIN,
              STAGE_ID: STAGES.EXP_PAY,
              [UF.TIPO]:"DESPESA",
              [UF.CC]: from,
              [UF.FAV]:"Transferência entre centros",
              [UF.VAL_PREV]: val,
              [UF.DATA_PREV]: dp||null,
              [UF.OBS]: obs,
            }
          });

          // receita
          await bx("crm.deal.add", {
            fields:{
              TITLE:"Transferência (Entrada)",
              CATEGORY_ID: PIPELINE_FIN,
              STAGE_ID: STAGES.REV_REC,
              [UF.TIPO]:"RECEITA",
              [UF.CC]: to,
              [UF.FAV]:"Transferência entre centros",
              [UF.VAL_PREV]: val,
              [UF.DATA_PREV]: dp||null,
              [UF.OBS]: obs,
            }
          });

          bd.remove();
          await refresh();
        });
      }
    });
  }

  function openSaldoModal(){
    openModal({
      title:"Saldo inicial / ajuste (manual)",
      bodyHTML: `
        <div class="fin-note">
          Você pediu: “saldo inicial manual e poder ajustar depois”.
          <br><br>
          Para funcionar de verdade, a gente precisa decidir onde armazenar:
          <b>Opção A</b> (mais simples): criar um DEAL de “SALDO INICIAL” por centro de custo na pipeline 27.
          <br><br>
          Eu já posso fazer isso aqui com 1 clique, mas preciso saber:
          vai ser Receita ou um tipo especial?
        </div>
      `
    });
  }

  function openReservaModal(){
    openModal({
      title:"Fundo de Reserva",
      bodyHTML: `
        <div class="fin-note">
          Você pediu inserir “Fundo de Reserva”.  
          Pra isso ficar certo, eu trato como um “Centro de Custo” específico (recomendado) ou como um campo separado.  
          <br><br>
          Se você me disser qual Centro de Custo representa a Reserva (ou se quer criar um novo), eu ligo os cálculos.
        </div>
      `
    });
  }

  // ========= DONUT MOCK =========
  function renderDonutMock(list){
    // só mostra total despesas visíveis
    const exp = list.filter(d=>["Despesa"].includes(dealTypeLabel(d)) && d.STAGE_ID !== STAGES.CANCELED);
    const total = exp.reduce((a,d)=> a + (toNum(d[UF.VAL_PREV]) || toNum(d[UF.VAL_REAL]) || 0), 0);
    $("#fin-donut-center").textContent = total ? money(total) : "—";
    $("#fin-donut-legend").textContent = "Depois eu conecto por categoria (real).";
  }

  // ========= AVATARS =========
  async function loadUsersFooter(){
    const wrap = $("#fin-avatars");
    wrap.innerHTML = "";
    // sem user.get você não consegue foto; então deixo fallback
    FOOT.users.forEach(id=>{
      const img = document.createElement("img");
      img.className = "fin-avatar";
      img.alt = "User " + id;
      // fallback (placeholder)
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <rect width="64" height="64" fill="#ffffff"/>
          <circle cx="32" cy="26" r="12" fill="#d1d5db"/>
          <rect x="14" y="42" width="36" height="16" rx="8" fill="#d1d5db"/>
          <text x="32" y="60" text-anchor="middle" font-family="Arial" font-size="10" fill="#6b7280">#${id}</text>
        </svg>
      `);
      wrap.appendChild(img);
    });
  }

  // ========= REFRESH =========
  async function refresh(){
    await loadDeals();
    renderChecklists();
    renderTable();
  }

  // ========= INIT =========
  function showFatal(err){
    const r = document.getElementById("fin-root") || document.body;
    r.innerHTML = `
      <div style="padding:14px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial">
        <div style="font-weight:950;font-size:14px;margin-bottom:8px">Falha ao carregar o painel</div>
        <pre style="white-space:pre-wrap;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:12px;max-width:1100px;overflow:auto">${esc(err && (err.stack||err.message||err) || err)}</pre>
        <div style="font-size:12px;opacity:.75;margin-top:8px">Dica: confira WEBHOOK_BASE no financeiro.js.</div>
      </div>
    `;
  }

  window.addEventListener("error", (e)=> showFatal(e.error || e.message || e));
  window.addEventListener("unhandledrejection", (e)=> showFatal(e.reason || e));

  (async function init(){
    try{
      mount();
      setSentinelHidden();
      bindUI();
      await loadUsersFooter();
      await loadFields();
      fillSelects();
      await refresh();
    }catch(err){
      showFatal(err);
    }
  })();
})();
