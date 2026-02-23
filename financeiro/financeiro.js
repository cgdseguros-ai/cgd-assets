/* SUBSTITUA TODO SEU financeiro.js POR ESTE (Centro de custo na sidebar + Cartões modal + toggles + placeholders de gráficos)
   Mantém ES5 compat.
*/
(function () {
  "use strict";

  var WORKER_BASE = "https://financeiro199702.cgdseguros.workers.dev";
  var API_BASE = WORKER_BASE.replace(/\/$/, "") + "/api";

  var CFG = {
    DEAL_CATEGORY_ID: 27,
    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=1285iby7j41w",

    FOOTER: {
      addressTitle: "Endereço",
      addressText: "Av Ayrton Senna, 2500, SS109, Barra da Tijuca",
      credits: "System created by GRUPO CGD",
      companies: [
        { name: "CGD CORRETORA", meta: "CNPJ 01.654.471/0001-86 • SUSEP 202031791" },
        { name: "CGD BARRA", meta: "CNPJ 53.013.848/0001-11 • SUSEP 242158650" }
      ],
      partnersUserIds: [1, 27, 15]
    },

    // Cartões (do que você já passou)
    CARDS: [
      { name:"CT ITAÚ PJ", venc:"02", melhor:"21" },
      { name:"CT PORTO PF", venc:"10", melhor:"04" },
      { name:"CT C6 PJ", venc:"15", melhor:"09" },
      { name:"CT XP PF", venc:"15", melhor:"11" },
      { name:"CT ITAÚ PF", venc:"21", melhor:"13" },
      { name:"CT CORA CGD BARRA", venc:"23", melhor:"17" },
      { name:"CT PORTO PJ", venc:"30", melhor:"25" }
    ],

    // Campos UF
    F: {
      TIPO_FIN: "UF_CRM_1771208061",
      COMPETENCIA: "UF_CRM_1771163661",
      VALOR_PREV: "UF_CRM_1770769991",
      VALOR_REAL: "UF_CRM_1770770017",
      DATA_REAL: "UF_CRM_1770771170",
      FAVORECIDO: "UF_CRM_1770775760",
      FORMA_PGTO: "UF_CRM_1769351652",
      OBS: "UF_CRM_691385BE7D33D",
      CATEGORIA: "UF_CRM_1770770570",
      DATA_PREV: "UF_CRM_1770769767",
      STATUS_FIN: "UF_CRM_1770770088",
      CONTA: "UF_CRM_1770770758",
      CENTRO_CUSTO: "UF_CRM_1771801157"
    },

    STAGES: {
      DESP_A_PAGAR: "C27:NEW",
      DESP_PAGA: "C27:PREPARATION",
      REC_A_RECEBER: "C27:UC_EQAFD7",
      REC_RECEBIDA: "C27:PREPAYMENT_INVOIC",
      CANCELADO: "C27:EXECUTING",
      CONCLUIDO: "C27:UC_LP2NSK"
    },

    PAGE_SIZE: 200
  };

  var root = document.getElementById("fin-root") || document.body;

  function esc(s) {
    s = String(s == null ? "" : s);
    return s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function safeMsg(err) {
    try { return err && (err.stack || err.message) ? String(err.stack || err.message) : String(err); }
    catch (_) { return "Erro desconhecido"; }
  }

  function showFatal(msg, err) {
    root.innerHTML =
      '<div style="min-height:100vh;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;' +
      "background: linear-gradient(180deg, #0b1020, #070a14);color:#e5e7eb;\">" +
      '<div style="max-width:1100px;margin:0 auto;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<img src="' + esc(CFG.LOGO_URL) + '" style="width:44px;height:44px;border-radius:14px;background:#fff;padding:6px;object-fit:contain">' +
      '<div><div style="font-weight:950;font-size:16px">Falha ao carregar</div><div style="opacity:.85;font-weight:800;font-size:12px">' + esc(msg || "Erro") + "</div></div>" +
      "</div>" +
      '<pre style="margin-top:14px;white-space:pre-wrap;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px;overflow:auto">' +
      esc(safeMsg(err)) +
      "</pre></div></div>";
  }

  window.addEventListener("error", function (e) { showFatal("Erro JS", e.error || e.message || e); });
  window.addEventListener("unhandledrejection", function (e) { showFatal("Promise rejeitada", e.reason || e); });

  var S = {
    enums: {},
    stages: [],
    deals: [],
    filtered: [],
    partners: [],
    lastSyncAt: null,
    loading: false,
    apiMode: null,

    // filtros
    filters: {
      q: "",
      centro: "",     // sidebar
      competencia: "",
      tipo: "",
      conta: "",
      statusFin: "",
      stageId: "",

      // toggles
      showPayables: true,   // despesas a pagar/pagas
      showReceivables: true // receitas a receber/recebidas
    },

    // Fundo de reserva (localStorage)
    reserve: {
      balance: 0
    }
  };

  function el(q) { return root.querySelector(q); }
  function els(q) { return Array.prototype.slice.call(root.querySelectorAll(q)); }

  function setLoading(v) {
    S.loading = !!v;
    var badge = el("#fin-loading");
    if (badge) badge.style.display = S.loading ? "inline-flex" : "none";
    els("[data-busylock='1']").forEach(function (b) { b.disabled = S.loading; });
  }

  function toast(msg, type) {
    type = type || "ok";
    var host = el("#fin-toast-host");
    if (!host) { alert(msg); return; }
    var t = document.createElement("div");
    t.className = "fin-toast fin-toast--" + type;
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { t.classList.add("fin-toast--show"); }, 10);
    setTimeout(function () {
      t.classList.remove("fin-toast--show");
      setTimeout(function () { if (t && t.parentNode) t.parentNode.removeChild(t); }, 200);
    }, 3200);
  }

  function nowBR() {
    var dt = new Date();
    var dd = String(dt.getDate()); if (dd.length < 2) dd = "0" + dd;
    var mo = String(dt.getMonth() + 1); if (mo.length < 2) mo = "0" + mo;
    var yy = dt.getFullYear();
    var hh = String(dt.getHours()); if (hh.length < 2) hh = "0" + hh;
    var mm = String(dt.getMinutes()); if (mm.length < 2) mm = "0" + mm;
    return dd + "/" + mo + "/" + yy + " " + hh + ":" + mm;
  }

  function toISODate(d) {
    var s = String(d == null ? "" : d).trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    return s;
  }

  function moneyBR(v) {
    var n = Number(v);
    if (!isFinite(n)) return "R$ 0,00";
    var fixed = n.toFixed(2);
    var parts = fixed.split(".");
    var a = parts[0];
    var b = parts[1] || "00";
    a = a.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "R$ " + a + "," + b;
  }

  function parseMoneyBR(s) {
    var t = String(s == null ? "" : s).trim();
    if (!t) return 0;
    t = t.replace(/[^\d,.-]/g, "");
    t = t.replace(/\./g, "");
    t = t.replace(",", ".");
    var n = Number(t);
    return isFinite(n) ? n : 0;
  }

  function parseJson(text) { try { return JSON.parse(text); } catch (_) { return null; } }

  function apiCall(method, payload) {
    var body = JSON.stringify(payload || {});
    var headers = { "content-type": "application/json" };

    function req(url) {
      return fetch(url, { method: "POST", headers: headers, body: body })
        .then(function (r) {
          return r.text().then(function (txt) {
            var j = parseJson(txt);
            if (!r.ok) {
              var msg = (j && (j.error_description || j.error)) || txt || ("HTTP " + r.status);
              throw new Error(msg);
            }
            if (j && j.error) throw new Error(j.error_description || j.error);
            return { json: j || {}, mode: (url.indexOf("?method=") > -1 ? "query" : "path") };
          });
        });
    }

    return req(API_BASE + "/" + method)
      .catch(function () { return req(API_BASE + "?method=" + encodeURIComponent(method)); })
      .then(function (res) { S.apiMode = res.mode; return res.json; });
  }

  function buildOptions(items, includeBlank, blankText) {
    if (includeBlank !== false) includeBlank = true;
    blankText = blankText || "— Todos —";
    var arr = Array.isArray(items) ? items : [];
    var out = [];
    if (includeBlank) out.push('<option value="">' + esc(blankText) + "</option>");
    for (var i = 0; i < arr.length; i++) {
      out.push('<option value="' + esc(arr[i].ID) + '">' + esc(arr[i].VALUE) + "</option>");
    }
    return out.join("");
  }

  function enumName(fieldId, enumId) {
    if (!enumId) return "";
    var list = (S.enums && S.enums[fieldId]) ? S.enums[fieldId] : [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].ID) === String(enumId)) return list[i].VALUE;
    }
    return String(enumId);
  }

  function stageName(stageId) {
    for (var i = 0; i < S.stages.length; i++) {
      if (String(S.stages[i].STATUS_ID) === String(stageId)) return S.stages[i].NAME;
    }
    return String(stageId || "");
  }

  function isBadFav(fav) {
    var s = String(fav || "").trim().toUpperCase();
    if (!s) return false;
    if (s.indexOf("__QUEUE__") === 0) return true;
    if (s.indexOf("FILA ATENDIMENTO") > -1) return true;
    return false;
  }

  function isExpenseStage(stageId) {
    stageId = String(stageId || "");
    return stageId === CFG.STAGES.DESP_A_PAGAR || stageId === CFG.STAGES.DESP_PAGA;
  }
  function isRevenueStage(stageId) {
    stageId = String(stageId || "");
    return stageId === CFG.STAGES.REC_A_RECEBER || stageId === CFG.STAGES.REC_RECEBIDA;
  }

  function updateDeal(id, fields) {
    return apiCall("crm.deal.update", { id: String(id), fields: fields || {} });
  }
  function createDeal(fields) {
    return apiCall("crm.deal.add", { fields: fields || {} }).then(function (r) {
      return r && r.result ? r.result : null;
    });
  }

  function loadMeta() {
    return apiCall("crm.deal.fields", {}).then(function (fieldsRes) {
      var fields = (fieldsRes && fieldsRes.result) ? fieldsRes.result : {};
      S.enums = {};
      for (var k in fields) {
        if (!fields.hasOwnProperty(k)) continue;
        var v = fields[k];
        if (v && Array.isArray(v.items)) {
          S.enums[k] = v.items.map(function (it) {
            return { ID: String(it.ID), VALUE: String(it.VALUE) };
          });
        }
      }
      return apiCall("crm.status.list", { filter: { ENTITY_ID: "DEAL_STAGE_" + CFG.DEAL_CATEGORY_ID } });
    }).then(function (st) {
      var allowed = {};
      for (var a in CFG.STAGES) allowed[String(CFG.STAGES[a])] = true;

      var raw = (st && st.result) ? st.result : [];
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        var sid = String(raw[i].STATUS_ID || raw[i].ID || "");
        if (!allowed[sid]) continue;
        out.push({ STATUS_ID: sid, NAME: String(raw[i].NAME || ""), SORT: Number(raw[i].SORT || 0) });
      }
      out.sort(function (x, y) { return x.SORT - y.SORT; });
      S.stages = out;
    });
  }

  function listDealsAll() {
    var out = [];
    var start = 0;
    var stageArr = [
      CFG.STAGES.DESP_A_PAGAR,
      CFG.STAGES.DESP_PAGA,
      CFG.STAGES.REC_A_RECEBER,
      CFG.STAGES.REC_RECEBIDA,
      CFG.STAGES.CANCELADO,
      CFG.STAGES.CONCLUIDO
    ];
    function loop() {
      return apiCall("crm.deal.list", {
        select: [
          "ID", "TITLE", "STAGE_ID", "CATEGORY_ID",
          CFG.F.TIPO_FIN, CFG.F.COMPETENCIA, CFG.F.VALOR_PREV, CFG.F.VALOR_REAL,
          CFG.F.DATA_REAL, CFG.F.FAVORECIDO, CFG.F.OBS, CFG.F.CATEGORIA,
          CFG.F.DATA_PREV, CFG.F.STATUS_FIN, CFG.F.CONTA, CFG.F.CENTRO_CUSTO, CFG.F.FORMA_PGTO
        ],
        filter: { CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID), STAGE_ID: stageArr },
        order: { ID: "DESC" },
        start: start
      }).then(function (res) {
        var chunk = (res && res.result) ? res.result : [];
        for (var i = 0; i < chunk.length; i++) out.push(chunk[i]);
        if (res && res.next != null) { start = res.next; return loop(); }
        return out;
      });
    }
    return loop();
  }

  // ====== RESERVA ======
  function loadReserve() {
    try {
      var raw = localStorage.getItem("FIN_RESERVE_BALANCE");
      S.reserve.balance = raw ? Number(raw) : 0;
      if (!isFinite(S.reserve.balance)) S.reserve.balance = 0;
    } catch (_) { S.reserve.balance = 0; }
  }
  function saveReserve() {
    try { localStorage.setItem("FIN_RESERVE_BALANCE", String(S.reserve.balance || 0)); } catch (_) {}
  }

  // ====== MODAL ======
  function modal(html) {
    var wrap = document.createElement("div");
    wrap.className = "fin-modal-wrap";
    wrap.innerHTML =
      '<div class="fin-modal-backdrop" data-close="1"></div>' +
      '<div class="fin-modal">' + html + "</div>";
    document.body.appendChild(wrap);

    wrap.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-close") === "1") {
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    });

    return {
      node: wrap,
      close: function () { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); },
      q: function (s) { return wrap.querySelector(s); }
    };
  }

  function initialStageForTipo(tipoEnumId) {
    var txt = (enumName(CFG.F.TIPO_FIN, tipoEnumId) || "").toUpperCase();
    if (txt.indexOf("DESP") > -1) return CFG.STAGES.DESP_A_PAGAR;
    if (txt.indexOf("REC") > -1) return CFG.STAGES.REC_A_RECEBER;
    return CFG.STAGES.DESP_A_PAGAR;
  }

  function paidStageForTipo(tipoEnumId) {
    var txt = (enumName(CFG.F.TIPO_FIN, tipoEnumId) || "").toUpperCase();
    if (txt.indexOf("DESP") > -1) return CFG.STAGES.DESP_PAGA;
    if (txt.indexOf("REC") > -1) return CFG.STAGES.REC_RECEBIDA;
    return "";
  }

  function openReserveModal() {
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Fundo de Reserva</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-field"><label>Saldo atual</label>' +
          '<input id="rv" value="' + esc(String(S.reserve.balance || 0).replace(".", ",")) + '" placeholder="Ex.: 5000,00">' +
        "</div>" +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
          '<button class="fin-btn fin-btn--primary" id="rsave" data-busylock="1">Salvar</button>' +
        "</div>" +
      "</div>"
    );
    m.q("#rsave").addEventListener("click", function () {
      var val = parseMoneyBR(m.q("#rv").value || "");
      S.reserve.balance = val;
      saveReserve();
      toast("Reserva atualizada ✅");
      m.close();
      renderReserveCard();
    });
  }

  function openCardsModal() {
    var items = CFG.CARDS || [];
    var rows = [];
    for (var i = 0; i < items.length; i++) {
      rows.push(
        '<button class="fin-side-item" data-card="' + esc(items[i].name) + '" style="width:100%">' +
          '<span class="fin-dot"></span><span class="fin-side-label">' + esc(items[i].name) +
          ' <span style="opacity:.7;font-weight:800">• Venc ' + esc(items[i].venc) + ' • Melhor ' + esc(items[i].melhor) + "</span></span>" +
        "</button>"
      );
    }

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Cartões</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-hint">Clique em um cartão para ver/editar previsões e lançamentos.</div>' +
        '<div style="margin-top:12px; display:flex; flex-direction:column; gap:8px">' + rows.join("") + "</div>" +
      "</div>"
    );

    var btns = m.node.querySelectorAll("[data-card]");
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener("click", function () {
        var name = this.getAttribute("data-card");
        m.close();
        openCardDetailModal(name);
      });
    }
  }

  function openCardDetailModal(cardName) {
    // Por enquanto: mostra lançamentos filtrando por "Forma de pagamento" contendo cartão OU OBS contendo cartão
    // (Mais tarde podemos oficializar via campo específico se você quiser)
    var list = S.deals || [];
    var matches = [];
    var nameUpper = String(cardName || "").toUpperCase();

    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var fp = enumName(CFG.F.FORMA_PGTO, d[CFG.F.FORMA_PGTO]) || "";
      var obs = String(d[CFG.F.OBS] || "");
      var fav = String(d[CFG.F.FAVORECIDO] || "");
      var hay = (fp + " " + obs + " " + fav).toUpperCase();
      if (hay.indexOf(nameUpper) > -1) matches.push(d);
    }

    var lines = [];
    for (var k = 0; k < matches.length && k < 200; k++) {
      var x = matches[k];
      lines.push(
        "<tr>" +
          '<td class="fin-mono">#' + esc(x.ID) + "</td>" +
          "<td>" + esc(x[CFG.F.FAVORECIDO] || x.TITLE || "") + "</td>" +
          '<td class="fin-mono">' + esc(toISODate(x[CFG.F.DATA_PREV] || "")) + "</td>" +
          '<td class="fin-mono">' + esc(moneyBR(x[CFG.F.VALOR_PREV])) + "</td>" +
          "<td>" + esc(stageName(x.STAGE_ID)) + "</td>" +
        "</tr>"
      );
    }

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">' + esc(cardName) + "</div><button class=\"fin-x\" data-close=\"1\">×</button></div>" +
      '<div class="fin-modal-body">' +
        '<div class="fin-hint">Vencimento: <b>' + esc(cardName) + "</b>. Aqui lista lançamentos vinculados ao cartão.</div>" +
        '<div class="fin-table-wrap" style="margin-top:12px">' +
          '<table class="fin-table" style="min-width:720px">' +
            "<thead><tr><th>ID</th><th>Favorecido</th><th>Data</th><th>Previsto</th><th>Etapa</th></tr></thead>" +
            '<tbody>' + (lines.length ? lines.join("") : '<tr><td colspan="5" class="fin-muted">Nenhum lançamento encontrado para este cartão.</td></tr>') + "</tbody>" +
          "</table>" +
        "</div>" +
        '<div class="fin-hint" style="margin-top:10px">Depois vamos adicionar: previsão de fatura, valor pago editável e painel do cartão.</div>' +
      "</div>"
    );
  }

  function openEditModal(deal) {
    var isEdit = !!deal;
    function v(k) { return deal ? (deal[k] == null ? "" : deal[k]) : ""; }

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">' + (isEdit ? "Editar lançamento" : "Novo lançamento") + '</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-grid">' +

          '<div class="fin-field"><label>Tipo Financeiro</label>' +
            '<select id="m-tipo">' + buildOptions(S.enums[CFG.F.TIPO_FIN] || [], true, "Selecione...") + "</select>" +
          "</div>" +

          '<div class="fin-field"><label>Competência (mês)</label>' +
            '<select id="m-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || []) + "</select>" +
          "</div>" +

          '<div class="fin-field"><label>Centro de custo</label>' +
            '<select id="m-cc">' + buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—") + "</select>" +
          "</div>" +

          '<div class="fin-field"><label>Conta / Origem</label>' +
            '<select id="m-conta">' + buildOptions(S.enums[CFG.F.CONTA] || [], true, "—") + "</select>" +
          "</div>" +

          '<div class="fin-field"><label>Data Prevista</label>' +
            '<input id="m-dprev" placeholder="YYYY-MM-DD" value="' + esc(toISODate(v(CFG.F.DATA_PREV))) + '">' +
          "</div>" +

          '<div class="fin-field"><label>Valor Previsto</label>' +
            '<input id="m-vprev" placeholder="Ex.: 1500,00" value="' + esc(v(CFG.F.VALOR_PREV)) + '">' +
          "</div>" +

          '<div class="fin-field"><label>Favorecido / Pagador</label>' +
            '<input id="m-fav" placeholder="Ex.: Light, Vivo, Cliente..." value="' + esc(v(CFG.F.FAVORECIDO)) + '">' +
          "</div>" +

          '<div class="fin-field"><label>Categoria</label>' +
            '<select id="m-cat">' + buildOptions(S.enums[CFG.F.CATEGORIA] || [], true, "—") + "</select>" +
          "</div>" +

          '<div class="fin-field"><label>Status Financeiro</label>' +
            '<select id="m-status">' + buildOptions(S.enums[CFG.F.STATUS_FIN] || [], true, "—") + "</select>" +
          "</div>" +

          '<div class="fin-field"><label>Forma de pagamento</label>' +
            '<select id="m-forma">' + buildOptions(S.enums[CFG.F.FORMA_PGTO] || [], true, "—") + "</select>" +
          "</div>" +

        "</div>" +

        '<div class="fin-field" style="margin-top:10px"><label>Observações</label>' +
          '<textarea id="m-obs" rows="3">' + esc(v(CFG.F.OBS)) + "</textarea>" +
        "</div>" +

        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
          '<button class="fin-btn fin-btn--primary" id="m-save" data-busylock="1">' + (isEdit ? "Salvar" : "Criar") + "</button>" +
        "</div>" +
      "</div>"
    );

    m.q("#m-tipo").value = String(v(CFG.F.TIPO_FIN) || "");
    m.q("#m-comp").value = String(v(CFG.F.COMPETENCIA) || "");
    m.q("#m-cc").value = String(v(CFG.F.CENTRO_CUSTO) || "");
    m.q("#m-conta").value = String(v(CFG.F.CONTA) || "");
    m.q("#m-cat").value = String(v(CFG.F.CATEGORIA) || "");
    m.q("#m-status").value = String(v(CFG.F.STATUS_FIN) || "");
    m.q("#m-forma").value = String(v(CFG.F.FORMA_PGTO) || "");

    m.q("#m-save").addEventListener("click", function () {
      setLoading(true);
      try {
        var tipo = m.q("#m-tipo").value;
        if (!tipo) throw new Error("Selecione o Tipo Financeiro.");

        var fields = {};
        fields[CFG.F.TIPO_FIN] = tipo;
        fields[CFG.F.COMPETENCIA] = m.q("#m-comp").value || "";
        fields[CFG.F.CENTRO_CUSTO] = m.q("#m-cc").value || "";
        fields[CFG.F.CONTA] = m.q("#m-conta").value || "";
        fields[CFG.F.DATA_PREV] = toISODate(m.q("#m-dprev").value || "");
        fields[CFG.F.VALOR_PREV] = parseMoneyBR(m.q("#m-vprev").value || "");
        fields[CFG.F.FAVORECIDO] = String(m.q("#m-fav").value || "").trim();
        fields[CFG.F.CATEGORIA] = m.q("#m-cat").value || "";
        fields[CFG.F.STATUS_FIN] = m.q("#m-status").value || "";
        fields[CFG.F.FORMA_PGTO] = m.q("#m-forma").value || "";
        fields[CFG.F.OBS] = String(m.q("#m-obs").value || "").trim();

        if (isBadFav(fields[CFG.F.FAVORECIDO])) throw new Error("Favorecido inválido (parece FILA/QUEUE).");

        if (isEdit) {
          updateDeal(deal.ID, fields)
            .then(function () { toast("Atualizado ✅"); m.close(); return refresh(); })
            .catch(function (e) { toast(e.message || String(e), "err"); })
            .finally(function () { setLoading(false); });
        } else {
          var tipoTxt = enumName(CFG.F.TIPO_FIN, tipo) || "FIN";
          var fav = fields[CFG.F.FAVORECIDO] || "";
          var st = initialStageForTipo(tipo);

          var addFields = {};
          addFields.TITLE = "FIN • " + tipoTxt + (fav ? " • " + fav : "");
          addFields.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
          addFields.STAGE_ID = st;

          for (var k in fields) if (fields.hasOwnProperty(k)) addFields[k] = fields[k];

          createDeal(addFields)
            .then(function (newId) { toast("Criado ✅ (ID " + newId + ")"); m.close(); return refresh(); })
            .catch(function (e) { toast(e.message || String(e), "err"); })
            .finally(function () { setLoading(false); });
        }
      } catch (err) {
        toast(err.message || String(err), "err");
        setLoading(false);
      }
    });
  }

  function markRealizado(deal) {
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Marcar como realizado</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-grid">' +
          '<div class="fin-field"><label>Valor realizado</label><input id="r-val" value="' + esc(deal[CFG.F.VALOR_REAL] || deal[CFG.F.VALOR_PREV] || "") + '"></div>' +
          '<div class="fin-field"><label>Data realizada</label><input id="r-date" value="' + esc(toISODate(deal[CFG.F.DATA_REAL] || "")) + '" placeholder="YYYY-MM-DD"></div>' +
        "</div>" +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
          '<button class="fin-btn fin-btn--primary" id="r-save" data-busylock="1">Salvar</button>' +
        "</div>" +
      "</div>"
    );

    m.q("#r-save").addEventListener("click", function () {
      setLoading(true);
      var v = parseMoneyBR(m.q("#r-val").value || "");
      var dt = toISODate(m.q("#r-date").value || "");
      var paidStage = paidStageForTipo(deal[CFG.F.TIPO_FIN]);

      var fields = {};
      fields[CFG.F.VALOR_REAL] = v;
      fields[CFG.F.DATA_REAL] = dt;
      if (paidStage) fields.STAGE_ID = paidStage;

      updateDeal(deal.ID, fields)
        .then(function () { toast("Realizado salvo ✅"); m.close(); return refresh(); })
        .catch(function (e) { toast("Falha: " + (e.message || String(e)), "err"); })
        .finally(function () { setLoading(false); });
    });
  }

  function cancelDeal(deal) {
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Cancelar lançamento</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-hint">Isso move o negócio para <b>CANCELADO</b>.</div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Voltar</button>' +
          '<button class="fin-btn fin-btn--danger" id="c-save" data-busylock="1">Cancelar</button>' +
        "</div>" +
      "</div>"
    );

    m.q("#c-save").addEventListener("click", function () {
      setLoading(true);
      updateDeal(deal.ID, { STAGE_ID: CFG.STAGES.CANCELADO })
        .then(function () { toast("Cancelado ✅"); m.close(); return refresh(); })
        .catch(function (e) { toast("Falha: " + (e.message || String(e)), "err"); })
        .finally(function () { setLoading(false); });
    });
  }

  // ====== GRÁFICOS (placeholders agora; liga no próximo passo) ======
  function renderChartsPlaceholders() {
    var host1 = el("#chart-cat");
    var host2 = el("#chart-evo");
    if (host1) host1.innerHTML = '<div style="height:220px;border:1px dashed #cbd5e1;border-radius:14px;background:#fff;display:grid;place-items:center;font-weight:950;color:#111827">Pizza: Despesas por Categorias (em breve)</div>';
    if (host2) host2.innerHTML = '<div style="height:220px;border:1px dashed #cbd5e1;border-radius:14px;background:#fff;display:grid;place-items:center;font-weight:950;color:#111827">Linha: Evolução Receitas x Despesas (em breve)</div>';
  }

  // ====== Sidebar: Centro de custo ======
  function renderSidebarCenters() {
    var host = el("#fin-side-centers");
    if (!host) return;

    var items = (S.enums && S.enums[CFG.F.CENTRO_CUSTO]) ? S.enums[CFG.F.CENTRO_CUSTO] : [];
    var sel = String(S.filters.centro || "");

    function btn(id, label, active) {
      return (
        '<button class="fin-side-item ' + (active ? "is-active" : "") + '" data-centro="' + esc(id) + '">' +
          '<span class="fin-dot"></span><span class="fin-side-label">' + esc(label) + "</span>" +
        "</button>"
      );
    }

    var html = btn("", "Todos os centros", !sel);
    for (var i = 0; i < items.length; i++) html += btn(String(items[i].ID), String(items[i].VALUE), sel === String(items[i].ID));

    host.innerHTML = html;

    var bs = host.querySelectorAll("[data-centro]");
    for (var k = 0; k < bs.length; k++) {
      bs[k].addEventListener("click", function () {
        S.filters.centro = this.getAttribute("data-centro") || "";
        renderSidebarCenters();
        applyFilters();
      });
    }
  }

  // ====== Filters + toggles ======
  function applyFilters() {
    var q = String(S.filters.q || "").trim().toLowerCase();

    S.filtered = (S.deals || []).filter(function (d) {
      if (isBadFav(d[CFG.F.FAVORECIDO])) return false;

      // Sidebar: centro de custo
      if (S.filters.centro && String(d[CFG.F.CENTRO_CUSTO] || "") !== String(S.filters.centro)) return false;

      if (S.filters.competencia && String(d[CFG.F.COMPETENCIA] || "") !== String(S.filters.competencia)) return false;
      if (S.filters.tipo && String(d[CFG.F.TIPO_FIN] || "") !== String(S.filters.tipo)) return false;
      if (S.filters.conta && String(d[CFG.F.CONTA] || "") !== String(S.filters.conta)) return false;
      if (S.filters.statusFin && String(d[CFG.F.STATUS_FIN] || "") !== String(S.filters.statusFin)) return false;

      // Etapa: default esconde CONCLUÍDO
      if (S.filters.stageId) {
        if (String(d.STAGE_ID || "") !== String(S.filters.stageId)) return false;
      } else {
        if (String(d.STAGE_ID || "") === String(CFG.STAGES.CONCLUIDO)) return false;
      }

      // toggles despesas/receitas
      if (!S.filters.showPayables && isExpenseStage(d.STAGE_ID)) return false;
      if (!S.filters.showReceivables && isRevenueStage(d.STAGE_ID)) return false;

      if (q) {
        var hay = [
          d.ID, d.TITLE,
          d[CFG.F.FAVORECIDO],
          d[CFG.F.OBS],
          enumName(CFG.F.CONTA, d[CFG.F.CONTA]),
          enumName(CFG.F.CENTRO_CUSTO, d[CFG.F.CENTRO_CUSTO]),
          enumName(CFG.F.CATEGORIA, d[CFG.F.CATEGORIA])
        ].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    renderTable();
    renderTotals();
    renderChartsPlaceholders();
  }

  function renderTotals() {
    var list = S.filtered || [];
    var prev = 0, real = 0;

    for (var i = 0; i < list.length; i++) {
      prev += Number(list[i][CFG.F.VALOR_PREV] || 0) || 0;
      real += Number(list[i][CFG.F.VALOR_REAL] || 0) || 0;
    }

    if (el("#tot-prev")) el("#tot-prev").textContent = moneyBR(prev);
    if (el("#tot-real")) el("#tot-real").textContent = moneyBR(real);
    if (el("#tot-count")) el("#tot-count").textContent = String(list.length);

    if (S.lastSyncAt && el("#fin-lastsync")) {
      el("#fin-lastsync").textContent = "Atualizado em " + S.lastSyncAt + " • API: " + (S.apiMode || "?");
    }
  }

  function renderReserveCard() {
    var x = el("#reserve-balance");
    if (x) x.textContent = moneyBR(S.reserve.balance || 0);
  }

  function renderTable() {
    var tb = el("#fin-tbody");
    if (!tb) return;

    var list = S.filtered || [];
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="10" class="fin-muted">Nenhum item encontrado.</td></tr>';
      return;
    }

    var rows = [];
    for (var i = 0; i < list.length && i < CFG.PAGE_SIZE; i++) {
      var d = list[i];
      var fav = d[CFG.F.FAVORECIDO] || d.TITLE || "";

      rows.push(
        "<tr>" +
          '<td class="fin-mono">#' + esc(d.ID) + "</td>" +
          "<td><div class=\"fin-strong\">" + esc(fav) + "</div><div class=\"fin-small fin-muted\">" + esc(enumName(CFG.F.CATEGORIA, d[CFG.F.CATEGORIA]) || "") + "</div></td>" +
          "<td>" + esc(enumName(CFG.F.CENTRO_CUSTO, d[CFG.F.CENTRO_CUSTO]) || "") + "</td>" +
          "<td>" + esc(enumName(CFG.F.CONTA, d[CFG.F.CONTA]) || "") + "</td>" +
          "<td>" + esc(enumName(CFG.F.TIPO_FIN, d[CFG.F.TIPO_FIN]) || "") + "</td>" +
          "<td>" + esc(enumName(CFG.F.COMPETENCIA, d[CFG.F.COMPETENCIA]) || "") + "</td>" +
          '<td class="fin-mono">' + esc(toISODate(d[CFG.F.DATA_PREV] || "")) + "</td>" +
          '<td class="fin-mono">' + esc(moneyBR(d[CFG.F.VALOR_PREV])) + "</td>" +
          '<td class="fin-mono">' + esc(moneyBR(d[CFG.F.VALOR_REAL])) + "</td>" +
          "<td>" +
            '<div class="fin-actions-row">' +
              '<button class="fin-mini" data-act="edit" data-id="' + esc(d.ID) + '">Editar</button>' +
              '<button class="fin-mini fin-mini--ok" data-act="real" data-id="' + esc(d.ID) + '">Realizar</button>' +
              '<button class="fin-mini fin-mini--danger" data-act="cancel" data-id="' + esc(d.ID) + '">Cancelar</button>' +
            "</div>" +
          "</td>" +
        "</tr>"
      );
    }

    tb.innerHTML = rows.join("");

    var btns = tb.querySelectorAll("button[data-act]");
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener("click", function () {
        var id = this.getAttribute("data-id");
        var act = this.getAttribute("data-act");
        var deal = null;
        for (var x = 0; x < S.deals.length; x++) {
          if (String(S.deals[x].ID) === String(id)) { deal = S.deals[x]; break; }
        }
        if (!deal) return;

        if (act === "edit") openEditModal(deal);
        if (act === "real") markRealizado(deal);
        if (act === "cancel") cancelDeal(deal);
      });
    }
  }

  // ====== CSV ======
  function exportCSV() {
    var list = S.filtered || [];
    if (!list.length) { toast("Nada para exportar.", "err"); return; }

    var headers = ["ID","CENTRO_CUSTO","CONTA","TIPO","COMPETENCIA","DATA_PREVISTA","VALOR_PREVISTO","VALOR_REALIZADO","ETAPA","FAVORECIDO","CATEGORIA","OBS"];
    var csv = [];
    csv.push(headers.join(";"));

    function q(s) {
      s = String(s == null ? "" : s).replace(/"/g, '""');
      return '"' + s + '"';
    }

    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var row = [
        d.ID,
        enumName(CFG.F.CENTRO_CUSTO, d[CFG.F.CENTRO_CUSTO]),
        enumName(CFG.F.CONTA, d[CFG.F.CONTA]),
        enumName(CFG.F.TIPO_FIN, d[CFG.F.TIPO_FIN]),
        enumName(CFG.F.COMPETENCIA, d[CFG.F.COMPETENCIA]),
        toISODate(d[CFG.F.DATA_PREV] || ""),
        d[CFG.F.VALOR_PREV] != null ? d[CFG.F.VALOR_PREV] : "",
        d[CFG.F.VALOR_REAL] != null ? d[CFG.F.VALOR_REAL] : "",
        stageName(d.STAGE_ID),
        d[CFG.F.FAVORECIDO] || "",
        enumName(CFG.F.CATEGORIA, d[CFG.F.CATEGORIA]),
        String(d[CFG.F.OBS] || "").replace(/\s+/g," ").trim()
      ];
      var line = [];
      for (var j = 0; j < row.length; j++) line.push(q(row[j]));
      csv.push(line.join(";"));
    }

    var blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "financeiro_pipeline27_" + Date.now() + ".csv";
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1200);
  }

  // ====== Avatars ======
  function initialsFromName(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    var a = parts[0] ? parts[0].charAt(0) : "";
    var b = parts[1] ? parts[1].charAt(0) : "";
    var out = (a + b).toUpperCase();
    return out || "CG";
  }
  function resolveUserPhotoUrl(user) {
    var raw = user && (user.PERSONAL_PHOTO_URL || user.PERSONAL_PHOTO || user.PHOTO || "");
    if (!raw) return "";
    if (typeof raw === "string" && raw.indexOf("http") === 0) return raw;
    return "";
  }
  function loadPartners() {
    return apiCall("user.get", { ID: CFG.FOOTER.partnersUserIds })
      .then(function (r) { S.partners = (r && r.result) ? r.result : []; })
      .catch(function () { S.partners = []; });
  }
  function renderPartnersAvatars() {
    var host = el("#fin-avatars");
    if (!host) return;

    var byId = {};
    for (var i = 0; i < S.partners.length; i++) byId[String(S.partners[i].ID)] = S.partners[i];

    var html = [];
    for (var j = 0; j < CFG.FOOTER.partnersUserIds.length; j++) {
      var id = CFG.FOOTER.partnersUserIds[j];
      var u = byId[String(id)] || {};
      var name = ((u.NAME || "") + " " + (u.LAST_NAME || "")).trim() || ("User " + id);
      var url = resolveUserPhotoUrl(u);

      if (url) html.push('<div class="fin-avatar" title="' + esc(name) + '"><img src="' + esc(url) + '" alt="' + esc(name) + '"></div>');
      else html.push('<div class="fin-avatar" title="' + esc(name) + '">' + esc(initialsFromName(name)) + "</div>");
    }
    host.innerHTML = html.join("");
  }

  // ====== Render ======
  function render() {
    root.innerHTML =
      '<div class="fin-shell">' +
        '<aside class="fin-side">' +
          '<div class="fin-side-brand">' +
            '<img class="fin-brand-logo" src="' + esc(CFG.LOGO_URL) + '" alt="CGD">' +
            '<div><div class="fin-brand-title">Financeiro CGD</div><div class="fin-brand-sub">Deals • Pipeline 27</div></div>' +
          "</div>" +

          '<div class="fin-side-block">' +
            '<div class="fin-side-h">Centro de custo</div>' +
            '<div id="fin-side-centers" class="fin-side-list"></div>' +
          "</div>" +
        "</aside>" +

        '<main class="fin-main">' +
          '<header class="fin-topbar">' +
            '<div class="fin-top-left">' +
              '<img class="fin-top-logo" src="' + esc(CFG.LOGO_URL) + '" alt="CGD">' +
              '<div>' +
                '<div class="fin-top-title">Financeiro CGD</div>' +
                '<div class="fin-top-sub"><span id="fin-lastsync">—</span> <span id="fin-loading" class="fin-loading" style="display:none">Carregando…</span></div>' +
              "</div>" +
            "</div>" +

            '<div class="fin-top-actions">' +
              '<div class="fin-search"><span aria-hidden="true">🔎</span><input id="f-q" placeholder="Buscar por favorecido, obs, centro..."></div>' +
              '<button class="fin-btn" id="btn-reserve" data-busylock="1">RESERVA</button>' +
              '<button class="fin-btn" id="btn-cards" data-busylock="1">CARTÕES</button>' +
              '<button class="fin-btn fin-btn--primary" id="btn-new" data-busylock="1">NOVO</button>' +
              '<button class="fin-btn" id="btn-refresh" data-busylock="1">ATUALIZAR</button>' +
              '<button class="fin-btn" id="btn-csv" data-busylock="1">EXPORTAR CSV</button>' +
            "</div>" +
          "</header>" +

          '<section class="fin-panel"><div class="fin-panel-inner">' +

            '<div class="fin-kpis">' +
              '<div class="fin-kpi"><div class="fin-kpi-k">Total Previsto</div><div class="fin-kpi-v" id="tot-prev">—</div></div>' +
              '<div class="fin-kpi"><div class="fin-kpi-k">Total Realizado</div><div class="fin-kpi-v" id="tot-real">—</div></div>' +
              '<div class="fin-kpi"><div class="fin-kpi-k">Fundo de reserva</div><div class="fin-kpi-v" id="reserve-balance">—</div></div>' +
            "</div>" +

            '<div class="fin-filters">' +
              '<div class="fin-field"><label>Competência</label><select id="f-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || []) + "</select></div>" +
              '<div class="fin-field"><label>Tipo</label><select id="f-tipo">' + buildOptions(S.enums[CFG.F.TIPO_FIN] || []) + "</select></div>" +
              '<div class="fin-field"><label>Conta</label><select id="f-conta">' + buildOptions(S.enums[CFG.F.CONTA] || [], true, "—") + "</select></div>" +
              '<div class="fin-field"><label>Status</label><select id="f-status">' + buildOptions(S.enums[CFG.F.STATUS_FIN] || [], true, "—") + "</select></div>" +
              '<div class="fin-field"><label>Etapa</label><select id="f-stage"><option value="">— Todos (exceto CONCLUÍDO) —</option>' +
                (S.stages || []).map(function (s) { return '<option value="' + esc(s.STATUS_ID) + '">' + esc(s.NAME) + "</option>"; }).join("") +
              "</select></div>" +

              '<div class="fin-field" style="margin-left:auto"><label>Despesas</label>' +
                '<select id="tog-exp"><option value="1">A PAGAR + PAGAS</option><option value="0">Ocultar</option></select>' +
              "</div>" +
              '<div class="fin-field"><label>Receitas</label>' +
                '<select id="tog-rec"><option value="1">A RECEBER + RECEBIDAS</option><option value="0">Ocultar</option></select>' +
              "</div>" +
            "</div>" +

            '<div style="display:grid;grid-template-columns:1fr 1fr; gap:12px; margin-top:12px">' +
              '<div id="chart-cat"></div>' +
              '<div id="chart-evo"></div>' +
            "</div>" +

            '<div class="fin-table-wrap" style="margin-top:12px">' +
              '<table class="fin-table">' +
                "<thead><tr>" +
                  '<th style="width:76px">ID</th>' +
                  "<th>Favorecido</th>" +
                  '<th style="width:170px">Centro</th>' +
                  '<th style="width:170px">Conta</th>' +
                  '<th style="width:140px">Tipo</th>' +
                  '<th style="width:130px">Competência</th>' +
                  '<th style="width:120px">Data Prev.</th>' +
                  '<th style="width:140px">Previsto</th>' +
                  '<th style="width:140px">Realizado</th>' +
                  '<th style="width:240px">Ações</th>' +
                "</tr></thead>" +
                '<tbody id="fin-tbody"><tr><td colspan="10" class="fin-muted">Carregando…</td></tr></tbody>' +
              "</table>" +
            "</div>" +

            '<div id="fin-toast-host" class="fin-toast-host"></div>' +
          "</div></section>" +

          '<footer class="fin-footerbar">' +
            '<div class="fin-footer-left"><div class="k">' + esc(CFG.FOOTER.addressTitle) + '</div><div class="v">' + esc(CFG.FOOTER.addressText) + "</div></div>" +
            '<div class="fin-footer-center">' + esc(CFG.FOOTER.credits) + "</div>" +
            '<div class="fin-footer-right">' +
              CFG.FOOTER.companies.map(function (c) {
                return '<div class="fin-footer-box"><div class="t">' + esc(c.name) + '</div><div class="s">' + esc(c.meta) + "</div></div>";
              }).join("") +
            "</div>" +
            '<div class="fin-footer-avatars" id="fin-avatars"></div>' +
          "</footer>" +

        "</main>" +
      "</div>";

    // events
    el("#btn-new").addEventListener("click", function () { openEditModal(null); });
    el("#btn-refresh").addEventListener("click", function () { refresh(); });
    el("#btn-csv").addEventListener("click", function () { exportCSV(); });
    el("#btn-cards").addEventListener("click", function () { openCardsModal(); });
    el("#btn-reserve").addEventListener("click", function () { openReserveModal(); });

    el("#f-q").addEventListener("input", function (e) { S.filters.q = e.target.value || ""; applyFilters(); });
    el("#f-comp").addEventListener("change", function () { S.filters.competencia = el("#f-comp").value || ""; applyFilters(); });
    el("#f-tipo").addEventListener("change", function () { S.filters.tipo = el("#f-tipo").value || ""; applyFilters(); });
    el("#f-conta").addEventListener("change", function () { S.filters.conta = el("#f-conta").value || ""; applyFilters(); });
    el("#f-status").addEventListener("change", function () { S.filters.statusFin = el("#f-status").value || ""; applyFilters(); });
    el("#f-stage").addEventListener("change", function () { S.filters.stageId = el("#f-stage").value || ""; applyFilters(); });

    el("#tog-exp").addEventListener("change", function () { S.filters.showPayables = (el("#tog-exp").value === "1"); applyFilters(); });
    el("#tog-rec").addEventListener("change", function () { S.filters.showReceivables = (el("#tog-rec").value === "1"); applyFilters(); });

    renderSidebarCenters();
    renderReserveCard();
  }

  function refresh() {
    setLoading(true);
    return listDealsAll()
      .then(function (deals) {
        S.deals = deals || [];
        S.lastSyncAt = nowBR();
        applyFilters();
      })
      .catch(function (e) {
        toast("Falha ao carregar: " + (e.message || String(e)), "err");
        var tb = el("#fin-tbody");
        if (tb) tb.innerHTML = '<tr><td colspan="10" class="fin-muted">Erro: ' + esc(e.message || String(e)) + "</td></tr>";
      })
      .finally(function () { setLoading(false); });
  }

  // finally polyfill
  if (!Promise.prototype.finally) {
    Promise.prototype.finally = function (cb) {
      var P = this.constructor;
      return this.then(
        function (v) { return P.resolve(cb()).then(function () { return v; }); },
        function (e) { return P.resolve(cb()).then(function () { throw e; }); }
      );
    };
  }

  function boot() {
    try {
      var s = document.getElementById("fin-sentinel");
      if (s) s.textContent = "JS iniciou ✅";
    } catch (_) {}

    loadReserve();

    root.innerHTML = '<div class="fin-boot"><div class="fin-boot-card"><div class="fin-boot-title">Financeiro CGD</div><div class="fin-boot-sub">Carregando…</div></div></div>';

    return loadMeta()
      .then(function () {
        render();
        return loadPartners();
      })
      .then(function () {
        renderPartnersAvatars();
        return refresh();
      })
      .catch(function (e) { showFatal("Erro ao iniciar", e); });
  }

  boot();
})();
