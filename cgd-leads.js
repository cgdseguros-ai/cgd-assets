/* cgd-leads.js  — Painel de Leads CGD (externo) */
(function(){
  "use strict";

  // ====== ROOT / SENTINEL ======
  var ROOT_ID = "cgd-leads-root";
  var SENT_ID = "cgd-sentinel";
  var root = document.getElementById(ROOT_ID);
  if(!root){
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.appendChild(root);
  }
  var sentinel = document.getElementById(SENT_ID);
  function setSent(msg){ if(sentinel) sentinel.textContent = msg; }

  // ====== CONFIG ======
  var CFG = {
    WEBHOOK_BASE: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb",

    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD:   "UF_CRM_1771333014",
    UF_IDADE:     "UF_CRM_1771339221",
    UF_BAIRRO:    "UF_CRM_LEAD_1731909705398",
    UF_FONTE:     "UF_CRM_1767285733843",

    STAGE_NAMES: {
      NEW: "NOVO LEAD",
      IN_PROGRESS: "EM ATENDIMENTO",
      QUALIFIED: "QUALIFICADO",
      LOST: "PERDIDO",
      WON: "CONVERTIDO"
    },

    USERS: [
      {id:15, name:"ALINE"},
      {id:19, name:"ADRIANA"},
      {id:17, name:"ANDREYNA"},
      {id:23, name:"MARIANA"},
      {id:811, name:"JOSIANE"},
      {id:813, name:"MANUELA"},
      {id:841, name:"MARIA CLARA"},
      {id:815, name:"GABRIEL"},
      {id:3081, name:"BRUNA LUISA"},
      {id:3387, name:"BEATRIZ"}
    ],

    REFRESH_MS: 60 * 1000,
    PAGE_SIZE: 50,

    // ====== FILA GLOBAL (BITRIX LIST) ======
    QUEUE_IBLOCK_TYPE_ID: "lists",
    QUEUE_IBLOCK_ID: "COLE_AQUI_O_IBLOCK_ID_DA_LISTA", // opcional
    QUEUE_PROP_CODE: "QUEUE_JSON",
    QUEUE_ELEMENT_NAME: "QUEUE",

    QUEUE_LOCAL_FALLBACK_KEY: "CGD_QUEUE_FALLBACK_V1"
  };

  // ====== UI HTML ======
  root.innerHTML = `
    <div class="cgd-wrap">
      <div class="topbar">
        <img class="logo" alt="CGD" src="https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=5ox8rtwqtdfv"/>
        <div class="title">PAINEL DE LEADS - CGD CORRETORA</div>
        <div class="spacer"></div>
        <div class="pill" title="Leads puxados hoje (por vendedoras), baseado em DATE_MODIFY">
          <small>Leads do dia</small> <b id="kpi-day">0</b>
        </div>
        <div class="pill" title="Leads puxados no mês (por vendedoras), baseado em DATE_MODIFY">
          <small>Leads do mês</small> <b id="kpi-month">0</b>
        </div>
      </div>

      <div class="wrap">
        <div class="panel">
          <div class="panel-h">
            <h2>NOVOS LEADS • PENDENTES</h2>
            <div class="actions">
              <button class="btn primary" id="btn-batch">Transferir em lote</button>
              <button class="btn" id="btn-refresh">Atualizar</button>
            </div>
          </div>

          <div id="newLeadAlert" class="alert" style="display:none;">
            <div class="left">
              <div class="title2 blink">🚨 NOVO LEAD</div>
              <div class="sub">Alerta sonoro + piscante (enquanto existir lead em “NOVO LEAD”).</div>
            </div>
            <button class="btn danger" id="btn-mute">Silenciar</button>
          </div>

          <div class="cards" id="highlight"></div>
          <div class="cards" id="pending"></div>
          <div class="footerHint" id="hint"></div>
        </div>

        <div class="panel">
          <div class="panel-h">
            <h2>QUEM PEGOU HOJE</h2>
            <div class="actions">
              <button class="btn" id="btn-refresh-right">Atualizar</button>
            </div>
          </div>
          <div class="users" id="users"></div>
          <div class="footerHint">
            Contagem “puxados” = leads atribuídos/movidos hoje (aprox. via <b>DATE_MODIFY</b>).
          </div>
        </div>
      </div>

      <div class="modal-backdrop" id="modalPickBack">
        <div class="modal">
          <div class="mh">
            <h3>Transferir Lead</h3>
            <button class="btn" id="btn-close-pick">Fechar</button>
          </div>
          <div class="mb">
            <div class="grid2">
              <div class="field">
                <label>Vendedora (responsável)</label>
                <select id="pickUser"></select>
              </div>
              <div class="field">
                <label>Etapa ao pegar</label>
                <input id="pickStage" disabled/>
                <div class="small">Ao “pegar”, o lead vira <b>EM ATENDIMENTO</b>.</div>
              </div>
            </div>
            <div id="pickLeadPreview" class="small"></div>
            <button class="btn primary" id="btn-confirm-pick">Confirmar transferência</button>
            <div class="small" id="pickStatus"></div>
          </div>
        </div>
      </div>

      <div class="modal-backdrop" id="modalBatchBack">
        <div class="modal">
          <div class="mh">
            <h3>Transferência em lote</h3>
            <button class="btn" id="btn-close-batch">Fechar</button>
          </div>
          <div class="mb">
            <div class="grid2">
              <div class="field">
                <label>Vendedora (responsável)</label>
                <select id="batchUser"></select>
              </div>
              <div class="field">
                <label>Ordenar por</label>
                <select id="batchSort">
                  <option value="DT_DESC">DIA E HORA (mais novo primeiro)</option>
                  <option value="DT_ASC">DIA E HORA (mais antigo primeiro)</option>
                  <option value="OP_ASC">OPERADORA (A→Z)</option>
                  <option value="OP_DESC">OPERADORA (Z→A)</option>
                </select>
              </div>
            </div>

            <div class="small">Selecione vários leads pendentes e clique em <b>Transferir selecionados</b>.</div>

            <div class="btnrow">
              <button class="btn" id="btn-batch-selectall">Selecionar todos</button>
              <button class="btn" id="btn-batch-clear">Limpar seleção</button>
              <button class="btn primary" id="btn-batch-transfer">Transferir selecionados</button>
            </div>

            <div id="batchStatus" class="small"></div>

            <table>
              <thead>
                <tr>
                  <th style="width:42px;"></th>
                  <thlth>DIA E HORA</th>
                  <th>NOME</th>
                  <th>TELEFONE</th>
                  <th>BAIRRO</th>
                  <th>IDADE</th>
                  <th>OPERADORA</th>
                  <th>LEAD FONTE</th>
                </tr>
              </thead>
              <tbody id="batchTbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="bottombar" id="queueBar">
        <div class="qb-left">
          <div class="qb-title">Fila de atendimento</div>
          <div class="qb-sub" id="queueHint">Carregando fila...</div>
        </div>
        <div class="qb-list" id="queueList"></div>
        <div class="qb-right">
          <button class="btn" id="btn-queue-reset">Resetar</button>
          <button class="btn primary" id="btn-queue-next">Próxima disponível</button>
        </div>
      </div>
    </div>
  `;

  // ====== CSS (injetado via JS, evita sanitização do editor) ======
  var css = `
  .cgd-wrap{
    --bgA:#f7f3ff; --bgB:#f3fbff; --bgC:#fff7fb;
    --border: rgba(30,40,70,.12);
    --text: rgba(18,26,40,.92);
    --muted: rgba(18,26,40,.60);
    --card: rgba(255,255,255,.92);
    --radius: 18px;
    --shadow: 0 14px 40px rgba(10,20,40,.10);
    --danger: #ff2e6a;
    --ok: #16a34a;
    --warn: #f59e0b;
    color: var(--text);
    font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
  }
  .cgd-wrap{ min-height:100vh; padding-bottom:74px; }
  .cgd-wrap::before{
    content:"";
    position:fixed; inset:0; z-index:-1;
    background:
      radial-gradient(900px 600px at 15% 20%, rgba(176,140,255,.25), transparent 55%),
      radial-gradient(900px 600px at 85% 20%, rgba(120,210,255,.25), transparent 55%),
      radial-gradient(900px 650px at 55% 95%, rgba(255,150,200,.18), transparent 60%),
      linear-gradient(135deg, var(--bgA), var(--bgB));
  }
  .topbar{
    position: sticky; top:0; z-index: 20;
    display:flex; align-items:center; gap:14px;
    padding:10px 14px;
    backdrop-filter: blur(8px);
    background: rgba(255,255,255,.72);
    border-bottom: 1px solid var(--border);
  }
  .logo{ height:36px; width:auto; border-radius:10px; background:#fff; padding:6px 10px; border:1px solid var(--border); box-shadow: 0 10px 20px rgba(0,0,0,.05); }
  .title{ font-weight: 1000; letter-spacing:.2px; }
  .spacer{ flex:1; }
  .pill{ display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:999px; background: rgba(255,255,255,.9); border:1px solid var(--border); box-shadow: 0 10px 20px rgba(0,0,0,.05); font-weight:850; }
  .pill small{ font-weight:800; opacity:.75; } .pill b{ font-size:16px; }

  .wrap{ display:grid; grid-template-columns: 60% 40%; gap:12px; padding:12px; }
  @media (max-width: 980px){ .wrap{ grid-template-columns:1fr; } }

  .panel{ background: rgba(255,255,255,.65); border:1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); overflow:hidden; }
  .panel-h{ display:flex; align-items:center; justify-content:space-between; padding: 12px 14px; border-bottom:1px solid var(--border); background: rgba(255,255,255,.75); }
  .panel-h h2{ margin:0; font-size:14px; letter-spacing:.2px; font-weight:950; }
  .actions{ display:flex; gap:8px; }

  .btn{ border:1px solid var(--border); background: rgba(255,255,255,.95); color: var(--text); padding:9px 12px; border-radius:12px; font-weight:900; cursor:pointer; }
  .btn:hover{ transform: translateY(-1px); }
  .btn.primary{ background: rgba(15,120,255,.10); border-color: rgba(15,120,255,.22); }
  .btn.danger{ background: rgba(255,46,106,.10); border-color: rgba(255,46,106,.22); color: rgba(120,10,40,.95); }

  .alert{ margin:12px; border-radius:18px; padding:14px; border:1px solid rgba(255,46,106,.25); background: rgba(255,46,106,.08); display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .alert .title2{ font-size:18px; font-weight:1000; }
  .alert .sub{ font-size:12px; opacity:.8; font-weight:800; }
  .blink{ animation: blink 1s infinite; }
  @keyframes blink{ 0%,100%{ filter:saturate(1); box-shadow:none; } 50%{ filter:saturate(2); box-shadow:0 0 0 6px rgba(255,46,106,.12); } }

  .cards{ padding: 0 12px 12px 12px; display:flex; flex-direction:column; gap:10px; }
  .card{ background: var(--card); border:1px solid var(--border); border-radius:16px; padding:12px; display:grid; grid-template-columns: 1fr auto; gap:10px; }
  .row{ display:flex; flex-wrap:wrap; gap:8px; font-size:12px; font-weight:850; }
  .tag{ padding:6px 10px; border-radius:999px; border:1px solid var(--border); background: rgba(255,255,255,.85); }
  .tag strong{ font-weight:1000; }
  .name{ font-size:14px; font-weight:1000; }
  .muted{ opacity:.75; font-weight:800; }
  .cta{ display:flex; flex-direction:column; gap:8px; align-items:flex-end; }
  .moveBox{ display:flex; flex-direction:column; gap:8px; align-items:flex-end; margin-top:6px; }
  .moveBox select{ width:180px; padding:9px 10px; border-radius:12px; border:1px solid var(--border); background: rgba(255,255,255,.95); font-weight:900; }

  .users{ padding:12px; display:flex; flex-direction:column; gap:10px; }
  .userbox{ background: rgba(255,255,255,.92); border:1px solid var(--border); border-radius:16px; overflow:hidden; }
  .uh{ padding:10px 12px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); background: rgba(255,255,255,.8); font-weight:950; }
  .uh small{ font-weight:900; opacity:.75; }
  .mini{ padding:10px 12px; display:flex; flex-direction:column; gap:8px; }
  .mcard{ border:1px solid var(--border); border-radius:14px; padding:10px; background: rgba(255,255,255,.92); }
  .mcard .name{ font-size:13px; }
  .mcard .row{ font-size:11px; }

  .modal-backdrop{ position:fixed; inset:0; z-index:50; background: rgba(0,0,0,.35); display:none; align-items:center; justify-content:center; padding:16px; }
  .modal{ width: min(920px, 96vw); max-height: 88vh; overflow:auto; background: rgba(255,255,255,.96); border:1px solid var(--border); border-radius:18px; box-shadow: 0 30px 80px rgba(0,0,0,.25); }
  .mh{ position: sticky; top:0; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; border-bottom:1px solid var(--border); background: rgba(255,255,255,.96); }
  .mh h3{ margin:0; font-size:14px; font-weight:1000; }
  .mb{ padding:14px; display:flex; flex-direction:column; gap:12px; }
  .grid2{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  @media (max-width: 820px){ .grid2{ grid-template-columns: 1fr; } }
  .field label{ display:block; font-weight:950; font-size:12px; margin-bottom:6px; opacity:.85; }
  select, input{ width:100%; padding:10px 12px; border-radius:12px; border:1px solid var(--border); background: rgba(255,255,255,.95); font-weight:850; }

  table{ width:100%; border-collapse: collapse; border:1px solid var(--border); border-radius:14px; background: rgba(255,255,255,.92); overflow:hidden; }
  th, td{ padding:10px 10px; border-bottom:1px solid var(--border); font-size:12px; vertical-align:top; }
  th{ text-align:left; font-weight:1000; background: rgba(255,255,255,.85); }
  tr:last-child td{ border-bottom:none; }
  .chk{ width:18px; height:18px; }
  .small{ font-size:12px; opacity:.8; font-weight:850; }
  .ok{ color: var(--ok); font-weight:1000; }
  .warn{ color: var(--warn); font-weight:1000; }
  .dangerText{ color: var(--danger); font-weight:1000; }
  .footerHint{ padding:0 14px 14px 14px; font-size:12px; opacity:.75; font-weight:850; }

  .bottombar{ position:fixed; left:0; right:0; bottom:0; z-index:30; display:flex; align-items:center; gap:12px; padding:10px 12px; background: rgba(255,255,255,.80); backdrop-filter: blur(10px); border-top:1px solid var(--border); }
  .qb-left{ display:flex; flex-direction:column; gap:2px; min-width:210px; }
  .qb-title{ font-weight:1000; }
  .qb-sub{ font-size:12px; opacity:.75; font-weight:850; }
  .qb-list{ flex:1; display:flex; gap:10px; overflow:auto; padding:2px; }
  .qb-item{ display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:14px; border:1px solid var(--border); background: rgba(255,255,255,.92); min-width:210px; }
  .qb-name{ font-weight:1000; font-size:13px; }
  .qb-meta{ font-size:11px; opacity:.75; font-weight:900; }
  .qb-col{ display:flex; flex-direction:column; gap:2px; }
  .qb-controls{ margin-left:auto; display:flex; align-items:center; gap:8px; }
  .qb-arrows{ display:flex; flex-direction:column; gap:4px; }
  .qb-arrows button{ width:28px; height:24px; border-radius:10px; border:1px solid var(--border); background: rgba(255,255,255,.95); cursor:pointer; font-weight:1000; }
  .qb-toggle{ display:flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; border:1px solid var(--border); background: rgba(255,255,255,.95); cursor:pointer; font-weight:1000; font-size:12px; white-space:nowrap; }
  .qb-toggle.off{ opacity:.55; text-decoration: line-through; }
  .qb-right{ display:flex; gap:8px; }
  .btnrow{ display:flex; gap:8px; flex-wrap:wrap; }
  `;
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  // ====== STATE ======
  var S = {
    statusMap: null,
    mute: false,
    lastNewLeadId: null,
    pendingLeads: [],
    pickedTodayByUser: {},
    queue: null,
    queueSaveTimer: null
  };

  // ====== HELPERS ======
  function $(id){ return document.getElementById(id); }
  function show(id, yes){ var e=$(id); if(e) e.style.display = yes ? "flex" : "none"; }
  function setText(id, txt){ var e=$(id); if(e) e.textContent = txt; }

  function esc(s){
    return String(s ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  async function bx(method, params){
    var url = CFG.WEBHOOK_BASE + "/" + method + ".json";
    var res = await fetch(url, {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(params || {})
    });
    var data = {};
    try{ data = await res.json(); }catch(_){}
    if (data && data.error) throw new Error((data.error + ": " + (data.error_description||"")).trim());
    return data.result;
  }

  async function bxListAll(method, params){
    var start = 0, all = [];
    while(true){
      var r = await bx(method, Object.assign({}, (params||{}), {start:start}));
      if (!Array.isArray(r)) return all;
      all = all.concat(r);
      if (r.length < CFG.PAGE_SIZE) break;
      start += CFG.PAGE_SIZE;
    }
    return all;
  }

  function beep(){
    if (S.mute) return;
    try{
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(function(){ o.stop(); ctx.close(); }, 180);
    }catch(_){}
  }

  // ====== STATUS MAP ======
  async function loadStatusMap(){
    var list = await bx("crm.status.list", { filter: { ENTITY_ID: "STATUS" } });
    var map = {};
    for (var i=0;i<list.length;i++){
      var stt = list[i];
      if (stt && stt.NAME && stt.STATUS_ID){
        map[String(stt.NAME).trim().toUpperCase()] = stt.STATUS_ID;
      }
    }
    S.statusMap = map;
  }
  function stageIdByName(name){
    var key = String(name||"").trim().toUpperCase();
    return (S.statusMap && S.statusMap[key]) ? S.statusMap[key] : null;
  }

  // ====== RENDER ======
  function renderLeadLine(lead, compact){
    var nm = esc(lead.NAME || lead.TITLE || "—");
    var op = esc(lead[CFG.UF_OPERADORA] || "—");
    var dt = esc(lead[CFG.UF_DT_LEAD] || lead.DATE_CREATE || "—");
    var age = esc(lead[CFG.UF_IDADE] || "—");
    var bairro = esc(lead[CFG.UF_BAIRRO] || "—");
    var fonte = esc(lead[CFG.UF_FONTE] || "—");
    if (compact){
      return "<div><b>"+nm+"</b> • <span class='muted'>"+op+"</span> • <span class='muted'>"+dt+"</span> • <span class='muted'>Idade: "+age+"</span></div>";
    }
    return (
      "<div class='name'>"+nm+"</div>" +
      "<div class='row'>" +
        "<div class='tag'><strong>OPERADORA:</strong> "+op+"</div>" +
        "<div class='tag'><strong>DATA/HORA:</strong> "+dt+"</div>" +
        "<div class='tag'><strong>IDADE:</strong> "+age+"</div>" +
        "<div class='tag'><strong>FONTE:</strong> "+fonte+"</div>" +
        "<div class='tag'><strong>BAIRRO:</strong> "+bairro+"</div>" +
      "</div>"
    );
  }

  function stageOptionsHTML(){
    return (
      "<option value=''>Mover para...</option>" +
      "<option value='"+esc(CFG.STAGE_NAMES.IN_PROGRESS)+"'>"+esc(CFG.STAGE_NAMES.IN_PROGRESS)+"</option>" +
      "<option value='"+esc(CFG.STAGE_NAMES.QUALIFIED)+"'>"+esc(CFG.STAGE_NAMES.QUALIFIED)+"</option>" +
      "<option value='"+esc(CFG.STAGE_NAMES.LOST)+"'>"+esc(CFG.STAGE_NAMES.LOST)+"</option>" +
      "<option value='"+esc(CFG.STAGE_NAMES.WON)+"'>"+esc(CFG.STAGE_NAMES.WON)+"</option>"
    );
  }

  function renderCard(lead, highlight){
    var d = document.createElement("div");
    d.className = "card" + (highlight ? " blink" : "");
    d.innerHTML =
      "<div class='k'>"+renderLeadLine(lead,false)+"</div>" +
      "<div class='cta'>" +
        "<button class='btn primary'>PEGAR</button>" +
        "<div class='moveBox'>" +
          "<select class='moveSel'>"+stageOptionsHTML()+"</select>" +
          "<div class='small muted'>ID: "+esc(lead.ID)+"</div>" +
        "</div>" +
      "</div>";
    d.querySelector("button").addEventListener("click", function(){ openPick(lead); });
    d.querySelector(".moveSel").addEventListener("change", async function(e){
      var stageName = e.target.value;
      if (!stageName) return;
      e.target.value = "";
      try{
        await moveLeadToStage(lead.ID, stageName);
        await refreshAll();
      }catch(err){
        $("hint").innerHTML = "<span class='dangerText'>Erro ao mover:</span> " + esc(err.message||err);
      }
    });
    return d;
  }

  // ====== DATA ======
  async function fetchPendingLeads(){
    var stNew = stageIdByName(CFG.STAGE_NAMES.NEW);
    if (!stNew) throw new Error("Não encontrei STATUS_ID para \""+CFG.STAGE_NAMES.NEW+"\".");

    var select = [
      "ID","TITLE","NAME","ASSIGNED_BY_ID","STATUS_ID","DATE_CREATE","DATE_MODIFY",
      CFG.UF_OPERADORA, CFG.UF_DT_LEAD, CFG.UF_IDADE, CFG.UF_BAIRRO, CFG.UF_FONTE,
      "PHONE"
    ];

    var leads = await bxListAll("crm.lead.list", {
      order: { "ID": "DESC" },
      filter: { "STATUS_ID": stNew },
      select: select
    });

    leads.sort(function(a,b){
      var da = String(a[CFG.UF_DT_LEAD]||"");
      var db = String(b[CFG.UF_DT_LEAD]||"");
      return db.localeCompare(da);
    });

    S.pendingLeads = leads;
    return leads;
  }

  function pad2(n){ return String(n).padStart(2,"0"); }
  function ymd(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function firstDayOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0); }
  function isoLocalStartOfDay(d){ return ymd(d)+"T00:00:00"; }
  function isoLocalStartOfMonth(d){ var m=firstDayOfMonth(d); return ymd(m)+"T00:00:00"; }

  async function fetchPickedKPIs(){
    var today = new Date();
    var startDay = isoLocalStartOfDay(today);
    var startMonth = isoLocalStartOfMonth(today);

    var stNew = stageIdByName(CFG.STAGE_NAMES.NEW);

    var dayTotal = 0, monthTotal = 0;
    var perUser = {};

    for (var i=0;i<CFG.USERS.length;i++){
      var u = CFG.USERS[i];

      var listToday = await bxListAll("crm.lead.list", {
        order: { "DATE_MODIFY": "DESC" },
        filter: Object.assign({
          "ASSIGNED_BY_ID": u.id,
          ">=DATE_MODIFY": startDay
        }, (stNew ? {"!STATUS_ID": stNew} : {})),
        select: ["ID","TITLE","NAME","DATE_MODIFY", CFG.UF_OPERADORA, CFG.UF_DT_LEAD, CFG.UF_IDADE, CFG.UF_BAIRRO, CFG.UF_FONTE, "PHONE"]
      });

      if (listToday.length){
        perUser[u.id] = { user:u, count:listToday.length, last2:listToday.slice(0,2) };
        dayTotal += listToday.length;
      }

      var listMonth = await bxListAll("crm.lead.list", {
        order: { "DATE_MODIFY": "DESC" },
        filter: Object.assign({
          "ASSIGNED_BY_ID": u.id,
          ">=DATE_MODIFY": startMonth
        }, (stNew ? {"!STATUS_ID": stNew} : {})),
        select: ["ID"]
      });
      monthTotal += listMonth.length;
    }

    S.pickedTodayByUser = perUser;
    setText("kpi-day", String(dayTotal));
    setText("kpi-month", String(monthTotal));
  }

  function renderLeft(leads){
    $("highlight").innerHTML = "";
    $("pending").innerHTML = "";

    var hasNew = leads && leads.length;
    show("newLeadAlert", !!hasNew);

    if (!hasNew){
      $("hint").innerHTML = "Sem leads em <b>"+esc(CFG.STAGE_NAMES.NEW)+"</b> agora.";
      return;
    }

    var top = leads[0];
    $("highlight").appendChild(renderCard(top,true));
    for (var i=1;i<leads.length;i++){
      $("pending").appendChild(renderCard(leads[i],false));
    }

    var newId = String(top.ID || "");
    if (newId && S.lastNewLeadId !== newId){
      S.lastNewLeadId = newId;
      beep();
    }

    $("hint").innerHTML = "Total pendentes: <b>"+leads.length+"</b> • Atualiza a cada <b>"+Math.round(CFG.REFRESH_MS/1000)+"s</b>.";
  }

  function renderUsers(){
    var rootU = $("users");
    rootU.innerHTML = "";

    var entries = Object.values(S.pickedTodayByUser || {});
    if (!entries.length){
      rootU.innerHTML = "<div class='small muted'>Nenhuma usuária puxou lead hoje ainda.</div>";
      return;
    }

    entries.sort(function(a,b){ return b.count - a.count; });

    entries.forEach(function(it){
      var box = document.createElement("div");
      box.className = "userbox";
      box.innerHTML =
        "<div class='uh'>" +
          "<div>"+esc(it.user.name)+" <small>(ID "+it.user.id+")</small></div>" +
          "<div><small>Puxados hoje:</small> <b>"+it.count+"</b></div>" +
        "</div>" +
        "<div class='mini'></div>";

      var mini = box.querySelector(".mini");
      it.last2.forEach(function(lead){
        var m = document.createElement("div");
        m.className = "mcard";
        m.innerHTML = renderLeadLine(lead,false);
        mini.appendChild(m);
      });

      rootU.appendChild(box);
    });
  }

  function fillUserSelects(){
    var opts = CFG.USERS.map(function(u){
      return "<option value='"+u.id+"'>"+esc(u.name)+" (ID "+u.id+")</option>";
    }).join("");

    $("pickUser").innerHTML = "<option value=''>Selecione...</option>" + opts;
    $("batchUser").innerHTML = "<option value=''>Selecione...</option>" + opts;
  }

  async function pickLeadToUser(leadId, userId){
    var stIn = stageIdByName(CFG.STAGE_NAMES.IN_PROGRESS);
    if (!stIn) throw new Error("Não encontrei STATUS_ID para \""+CFG.STAGE_NAMES.IN_PROGRESS+"\".");
    await bx("crm.lead.update", { id: leadId, fields: { ASSIGNED_BY_ID: Number(userId), STATUS_ID: stIn } });
  }
  async function moveLeadToStage(leadId, stageName){
    var st = stageIdByName(stageName);
    if (!st) throw new Error("Não encontrei STATUS_ID para \""+stageName+"\".");
    await bx("crm.lead.update", { id: leadId, fields: { STATUS_ID: st } });
  }

  // ====== MODAL PICK ======
  var pickLead = null;
  function openPick(lead){
    pickLead = lead;
    $("pickStage").value = CFG.STAGE_NAMES.IN_PROGRESS;
    $("pickLeadPreview").innerHTML = renderLeadLine(lead,true);
    $("pickStatus").textContent = "";
    $("modalPickBack").style.display = "flex";
    applyNextToPickModal_();
  }
  function closePick(){
    $("modalPickBack").style.display = "none";
    pickLead = null;
  }

  // ====== BATCH ======
  function openBatch(){
    $("batchStatus").textContent = "";
    $("modalBatchBack").style.display = "flex";
    renderBatchTable();
  }
  function closeBatch(){
    $("modalBatchBack").style.display = "none";
  }

  function renderBatchTable(){
    var tbody = $("batchTbody");
    tbody.innerHTML = "";

    var sort = $("batchSort").value;
    var arr = (S.pendingLeads||[]).slice();

    arr.sort(function(a,b){
      var dta = String(a[CFG.UF_DT_LEAD]||"");
      var dtb = String(b[CFG.UF_DT_LEAD]||"");
      var opa = String(a[CFG.UF_OPERADORA]||"");
      var opb = String(b[CFG.UF_OPERADORA]||"");
      if (sort==="DT_ASC") return dta.localeCompare(dtb);
      if (sort==="DT_DESC") return dtb.localeCompare(dta);
      if (sort==="OP_ASC") return opa.localeCompare(opb);
      if (sort==="OP_DESC") return opb.localeCompare(opa);
      return 0;
    });

    arr.forEach(function(lead){
      var phone = (lead.PHONE && lead.PHONE[0] && lead.PHONE[0].VALUE) ? lead.PHONE[0].VALUE : "";
      var tr = document.createElement("tr");
      tr.dataset.id = lead.ID;
      tr.innerHTML =
        "<td><input class='chk' type='checkbox'/></td>" +
        "<td>"+esc(lead[CFG.UF_DT_LEAD] || lead.DATE_CREATE || "—")+"</td>" +
        "<td>"+esc(lead.NAME || lead.TITLE || "—")+"</td>" +
        "<td>"+esc(phone || "—")+"</td>" +
        "<td>"+esc(lead[CFG.UF_BAIRRO] || "—")+"</td>" +
        "<td>"+esc(lead[CFG.UF_IDADE] || "—")+"</td>" +
        "<td>"+esc(lead[CFG.UF_OPERADORA] || "—")+"</td>" +
        "<td>"+esc(lead[CFG.UF_FONTE] || "—")+"</td>";
      tbody.appendChild(tr);
    });
  }

  function getSelectedBatchIds(){
    var ids = [];
    Array.from($("batchTbody").querySelectorAll("tr")).forEach(function(r){
      var chk = r.querySelector("input[type=checkbox]");
      if (chk && chk.checked) ids.push(r.dataset.id);
    });
    return ids;
  }

  async function batchTransfer(ids, userId){
    var stIn = stageIdByName(CFG.STAGE_NAMES.IN_PROGRESS);
    if (!stIn) throw new Error("Não encontrei STATUS_ID para \""+CFG.STAGE_NAMES.IN_PROGRESS+"\".");

    var statusEl = $("batchStatus");
    statusEl.textContent = "Transferindo " + ids.length + " lead(s)...";

    var ok=0, fail=0;
    for (var i=0;i<ids.length;i++){
      var id = ids[i];
      try{
        await bx("crm.lead.update", { id:id, fields: { ASSIGNED_BY_ID: Number(userId), STATUS_ID: stIn } });
        ok++;
      }catch(_e){
        fail++;
      }
    }
    statusEl.innerHTML = "<span class='ok'>OK: "+ok+"</span> • <span class='dangerText'>Falhas: "+fail+"</span>";
  }

  // ====== QUEUE (fallback local + opcional Bitrix List) ======
  function defaultQueueFromUsers_(){ return CFG.USERS.map(function(u){ return ({ id:u.id, name:u.name, on:true }); }); }

  function loadQueueFallbackLocal_(){
    try{
      var raw = localStorage.getItem(CFG.QUEUE_LOCAL_FALLBACK_KEY);
      if(!raw) return null;
      return JSON.parse(raw);
    }catch(_){ return null; }
  }
  function saveQueueFallbackLocal_(q){
    try{ localStorage.setItem(CFG.QUEUE_LOCAL_FALLBACK_KEY, JSON.stringify(q)); }catch(_){}
  }
  function queueIsConfigured_(){
    return CFG.QUEUE_IBLOCK_ID && CFG.QUEUE_IBLOCK_ID !== "COLE_AQUI_O_IBLOCK_ID_DA_LISTA";
  }

  async function queueLoadFromBitrix_(){
    if (!queueIsConfigured_()) return null;
    var items = await bx("lists.element.get", {
      IBLOCK_TYPE_ID: CFG.QUEUE_IBLOCK_TYPE_ID,
      IBLOCK_ID: CFG.QUEUE_IBLOCK_ID,
      FILTER: { "NAME": CFG.QUEUE_ELEMENT_NAME }
    });
    if (!items || !items.length) return null;
    var el = items[0];
    var propKey = "PROPERTY_" + CFG.QUEUE_PROP_CODE;
    var raw = el[propKey];
    if (!raw) return null;

    try{
      var val = Array.isArray(raw) ? (raw[0] || "") : raw;
      var q = JSON.parse(val);
      return Array.isArray(q) ? q : null;
    }catch(_){
      return null;
    }
  }

  async function queueSaveToBitrix_(q){
    if (!queueIsConfigured_()) return false;
    var json = JSON.stringify(q);
    var propKey = "PROPERTY_" + CFG.QUEUE_PROP_CODE;

    var items = await bx("lists.element.get", {
      IBLOCK_TYPE_ID: CFG.QUEUE_IBLOCK_TYPE_ID,
      IBLOCK_ID: CFG.QUEUE_IBLOCK_ID,
      FILTER: { "NAME": CFG.QUEUE_ELEMENT_NAME }
    });

    if (items && items.length){
      var elId = items[0].ID;
      await bx("lists.element.update", {
        IBLOCK_TYPE_ID: CFG.QUEUE_IBLOCK_TYPE_ID,
        IBLOCK_ID: CFG.QUEUE_IBLOCK_ID,
        ELEMENT_ID: elId,
        FIELDS: { NAME: CFG.QUEUE_ELEMENT_NAME, [propKey]: json }
      });
    } else {
      await bx("lists.element.add", {
        IBLOCK_TYPE_ID: CFG.QUEUE_IBLOCK_TYPE_ID,
        IBLOCK_ID: CFG.QUEUE_IBLOCK_ID,
        FIELDS: { NAME: CFG.QUEUE_ELEMENT_NAME, [propKey]: json }
      });
    }
    return true;
  }

  function mergeQueueWithUsers_(q){
    var byId = new Map((q||[]).map(function(x){ return [Number(x.id), x]; }));
    CFG.USERS.forEach(function(u){
      if (!byId.has(Number(u.id))) byId.set(Number(u.id), {id:u.id, name:u.name, on:true});
    });
    var merged = Array.from(byId.values()).map(function(x){ return ({id:Number(x.id), name:String(x.name||""), on: !!x.on}); });

    var savedOrder = (q||[]).map(function(x){ return Number(x.id); });
    merged.sort(function(a,b){
      var ia = savedOrder.indexOf(a.id);
      var ib = savedOrder.indexOf(b.id);
      return (ia===-1 ? 999999 : ia) - (ib===-1 ? 999999 : ib);
    });
    return merged;
  }

  async function loadQueue_(){
    if (queueIsConfigured_()){
      var qB = await queueLoadFromBitrix_();
      if (qB && qB.length) return mergeQueueWithUsers_(qB);
    }
    var qL = loadQueueFallbackLocal_();
    if (qL && qL.length) return mergeQueueWithUsers_(qL);
    return defaultQueueFromUsers_();
  }

  function scheduleQueueSave_(q){
    saveQueueFallbackLocal_(q);
    if (!queueIsConfigured_()) return;
    clearTimeout(S.queueSaveTimer);
    S.queueSaveTimer = setTimeout(async function(){
      try{ await queueSaveToBitrix_(q); }catch(_e){}
    }, 700);
  }

  function getNextAvailableFromQueue_(){
    var q = S.queue || [];
    return q.find(function(x){ return x.on; }) || null;
  }

  function applyNextToPickModal_(){
    var next = getNextAvailableFromQueue_();
    if (!next) return false;
    var sel = $("pickUser");
    if(!sel) return false;
    sel.value = String(next.id);
    return true;
  }

  function renderQueue_(){
    var rootQ = $("queueList");
    if(!rootQ) return;
    rootQ.innerHTML = "";

    var q = S.queue || [];
    q.forEach(function(item, idx){
      var div = document.createElement("div");
      div.className = "qb-item";
      div.innerHTML =
        "<div class='qb-col'>" +
          "<div class='qb-name'>"+esc(item.name)+"</div>" +
          "<div class='qb-meta'>ID "+item.id+" • #"+(idx+1)+"</div>" +
        "</div>" +
        "<div class='qb-controls'>" +
          "<div class='qb-arrows'>" +
            "<button title='Subir' data-act='up'>↑</button>" +
            "<button title='Descer' data-act='down'>↓</button>" +
          "</div>" +
          "<button class='qb-toggle "+(item.on ? "" : "off")+"' data-act='toggle'>" +
            (item.on ? "Disponível" : "Indisponível") +
          "</button>" +
        "</div>";

      Array.from(div.querySelectorAll("button")).forEach(function(btn){
        btn.addEventListener("click", function(){
          var act = btn.dataset.act;
          if (act==="up" && idx>0){
            var tmp = q[idx-1]; q[idx-1] = q[idx]; q[idx] = tmp;
            scheduleQueueSave_(q); renderQueue_();
          }
          if (act==="down" && idx<q.length-1){
            var tmp2 = q[idx+1]; q[idx+1] = q[idx]; q[idx] = tmp2;
            scheduleQueueSave_(q); renderQueue_();
          }
          if (act==="toggle"){
            q[idx].on = !q[idx].on;
            scheduleQueueSave_(q); renderQueue_();
          }
        });
      });

      rootQ.appendChild(div);
    });

    var next = getNextAvailableFromQueue_();
    var hint = $("queueHint");
    if (hint){
      hint.textContent = next ? ("Próxima disponível: "+next.name+" (ID "+next.id+").") : "Nenhuma disponível. Ative alguém na fila.";
    }
  }

  // ====== REFRESH ======
  async function refreshRight(){
    try{
      await fetchPickedKPIs();
      renderUsers();
    }catch(e){
      // silencioso
      console.warn(e);
    }
  }

  async function refreshAll(){
    try{
      if (!S.statusMap) await loadStatusMap();
      var leads = await fetchPendingLeads();
      renderLeft(leads);
      await refreshRight();
    }catch(e){
      $("hint").innerHTML = "<span class='dangerText'>Erro:</span> " + esc(e.message||e);
    }
  }

  // ====== EVENTS ======
  function wire(){
    fillUserSelects();

    $("btn-refresh").addEventListener("click", refreshAll);
    $("btn-refresh-right").addEventListener("click", refreshRight);

    $("btn-mute").addEventListener("click", function(){
      S.mute = !S.mute;
      $("btn-mute").textContent = S.mute ? "Ativar som" : "Silenciar";
    });

    $("btn-batch").addEventListener("click", openBatch);
    $("batchSort").addEventListener("change", renderBatchTable);

    $("btn-batch-selectall").addEventListener("click", function(){
      Array.from($("batchTbody").querySelectorAll("input[type=checkbox]")).forEach(function(c){ c.checked=true; });
    });
    $("btn-batch-clear").addEventListener("click", function(){
      Array.from($("batchTbody").querySelectorAll("input[type=checkbox]")).forEach(function(c){ c.checked=false; });
    });
    $("btn-batch-transfer").addEventListener("click", async function(){
      var userId = $("batchUser").value;
      var ids = getSelectedBatchIds();
      if (!userId) return $("batchStatus").innerHTML = "<span class='warn'>Selecione a vendedora.</span>";
      if (!ids.length) return $("batchStatus").innerHTML = "<span class='warn'>Selecione ao menos 1 lead.</span>";
      await batchTransfer(ids, userId);
      await refreshAll();
    });

    $("btn-confirm-pick").addEventListener("click", async function(){
      var userId = $("pickUser").value;
      if (!pickLead) return;
      if (!userId) return $("pickStatus").innerHTML = "<span class='warn'>Selecione a vendedora.</span>";
      $("pickStatus").textContent = "Transferindo...";
      try{
        await pickLeadToUser(pickLead.ID, userId);
        $("pickStatus").innerHTML = "<span class='ok'>Transferido com sucesso.</span>";
        setTimeout(closePick, 500);
        await refreshAll();
      }catch(e){
        $("pickStatus").innerHTML = "<span class='dangerText'>Erro:</span> " + esc(e.message||e);
      }
    });

    $("btn-close-pick").addEventListener("click", closePick);
    $("btn-close-batch").addEventListener("click", closeBatch);

    $("modalPickBack").addEventListener("click", function(e){ if(e.target && e.target.id==="modalPickBack") closePick(); });
    $("modalBatchBack").addEventListener("click", function(e){ if(e.target && e.target.id==="modalBatchBack") closeBatch(); });

    $("btn-queue-reset").addEventListener("click", function(){
      S.queue = defaultQueueFromUsers_();
      scheduleQueueSave_(S.queue);
      renderQueue_();
    });
    $("btn-queue-next").addEventListener("click", function(){
      applyNextToPickModal_();
      renderQueue_();
    });
  }

  // ====== INIT ======
  (async function init(){
    try{
      wire();

      try{ S.queue = await loadQueue_(); }
      catch(_){ S.queue = defaultQueueFromUsers_(); }

      renderQueue_();
      await refreshAll();
      setInterval(refreshAll, CFG.REFRESH_MS);

      setSent("JS iniciou ✅ (app carregado)");
    }catch(e){
      setSent("Falha no app ❌ (veja F12)");
      console.error(e);
      var h = $("hint");
      if(h) h.innerHTML = "<span class='dangerText'>Falha no app:</span> " + esc(e.message||e);
    }
  })();

})();