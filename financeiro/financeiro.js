(function () {
  "use strict";

  var WORKER_BASE = "https://financeiro199702.cgdseguros.workers.dev";
  var API_BASE = WORKER_BASE.replace(/\/$/, "") + "/api";

  var CFG = {
    DEAL_CATEGORY_ID: 27,
    REMINDER_CATEGORY_ID: 17,
    REMINDER_ASSIGNED_ID: 813,

    // ⚠️ AJUSTE SE SUA "coluna Manuela" tiver outro STAGE_ID:
    // Se você não souber, me mande o STAGE_ID da coluna da Manuela na pipeline 17.
    REMINDER_STAGE_ID: "C17:PREPARATION",

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

    F: {
      TIPO_FIN: "UF_CRM_1771208061",
      COMPETENCIA: "UF_CRM_1771163661",
      VALOR_PREV: "UF_CRM_1770769991",
      VALOR_REAL: "UF_CRM_1770770017",
      DATA_REAL: "UF_CRM_1770771170",
      FAVORECIDO: "UF_CRM_1770775760",
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

    PAGE_SIZE: 300,
    REL_PREFIX: "REL_P17:"
  };

  var root = document.getElementById("fin-root") || document.body;

  function esc(s) {
    s = String(s == null ? "" : s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function parseJson(t) { try { return JSON.parse(t); } catch (_) { return null; } }
  function el(q) { return root.querySelector(q); }

  // ===== PATCH CRÍTICO: API CALL sem preflight =====
  // 1) tenta GET simples (evita CORS/preflight)
  // 2) fallback: GET path
  // 3) fallback: POST query
  // 4) fallback: POST path
  function apiCall(method, payload) {
    payload = payload || {};
    var body = JSON.stringify(payload);
    var headersPost = { "content-type": "application/json" };

    function parseResp(r, url, mode) {
      return r.text().then(function (txt) {
        var j = parseJson(txt);
        if (!r.ok) throw new Error("HTTP " + r.status + " @ " + url + " :: " + (txt || ""));
        if (j && j.error) throw new Error((j.error_description || j.error) + " @ " + method);
        return { json: j || {}, mode: mode };
      });
    }

    function reqGET(url, mode) {
      // GET simples: sem headers custom, sem body
      var u = url;
      var qs = encodeURIComponent(JSON.stringify(payload));
      u += (u.indexOf("?") >= 0 ? "&" : "?") + "p=" + qs;
      return fetch(u, { method: "GET" }).then(function (r) { return parseResp(r, u, mode); });
    }

    function reqPOST(url, mode) {
      return fetch(url, { method: "POST", headers: headersPost, body: body })
        .then(function (r) { return parseResp(r, url, mode); });
    }

    var uQuery = API_BASE + "?method=" + encodeURIComponent(method);
    var uPath = API_BASE + "/" + method;

    return reqGET(uQuery, "get-query")
      .catch(function(){ return reqGET(uPath, "get-path"); })
      .catch(function(){ return reqPOST(uQuery, "post-query"); })
      .catch(function(){ return reqPOST(uPath, "post-path"); })
      .then(function (res) { S.apiMode = res.mode; return res.json; });
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

  function parseMoneyBR(s) {
    var t = String(s == null ? "" : s).trim();
    if (!t) return 0;
    t = t.replace(/[^\d,.-]/g, "");
    t = t.replace(/\./g, "");
    t = t.replace(",", ".");
    var n = Number(t);
    return isFinite(n) ? n : 0;
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

  function addDaysISO(iso, days) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() + days);
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1); if (mo.length < 2) mo = "0" + mo;
    var da = String(d.getDate()); if (da.length < 2) da = "0" + da;
    return y + "-" + mo + "-" + da;
  }

  function addMonthsISO(iso, months, forceDay) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    var y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3]);
    var d = new Date(y, mo, da);
    d.setMonth(d.getMonth() + months);

    if (forceDay != null) {
      var fd = Math.max(1, Math.min(31, Number(forceDay) || 1));
      var tryD = new Date(d.getFullYear(), d.getMonth(), fd);
      if (tryD.getMonth() === d.getMonth()) d = tryD;
      else d = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }

    var yy = d.getFullYear();
    var mm = String(d.getMonth() + 1); if (mm.length < 2) mm = "0" + mm;
    var dd = String(d.getDate()); if (dd.length < 2) dd = "0" + dd;
    return yy + "-" + mm + "-" + dd;
  }

  function addYearsISO(iso, years, forceMonth, forceDay) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    var y = Number(m[1]) + years;
    var mo = (forceMonth != null) ? (Math.max(1, Math.min(12, Number(forceMonth)||1)) - 1) : (Number(m[2]) - 1);
    var da = (forceDay != null) ? Math.max(1, Math.min(31, Number(forceDay)||1)) : Number(m[3]);

    var d = new Date(y, mo, da);
    if (d.getMonth() !== mo) d = new Date(y, mo + 1, 0);
    var yy = d.getFullYear();
    var mm = String(d.getMonth() + 1); if (mm.length < 2) mm = "0" + mm;
    var dd = String(d.getDate()); if (dd.length < 2) dd = "0" + dd;
    return yy + "-" + mm + "-" + dd;
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

  function modal(html, opts) {
    opts = opts || {};
    var wrap = document.createElement("div");
    wrap.className = "fin-modal-wrap";
    wrap.innerHTML =
      '<div class="fin-modal-backdrop" data-close="1"></div>' +
      '<div class="fin-modal ' + (opts.full ? 'is-full' : '') + '">' + html + "</div>";
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

  function setLoading(v) {
    S.loading = !!v;
    var badge = el("#fin-loading");
    if (badge) badge.style.display = S.loading ? "inline-flex" : "none";
    var btns = root.querySelectorAll("[data-busylock='1']");
    for (var i = 0; i < btns.length; i++) btns[i].disabled = S.loading;
  }

  var S = {
    enums: {},
    stages: [],
    deals: [],
    filtered: [],
    partners: [],
    lastSyncAt: null,
    loading: false,
    apiMode: null,

    filters: {
      q: "",
      centro: "",
      competencia: "",
      tipo: "",
      conta: "",
      statusFin: "",
      stageId: "",
      showPayables: true,
      showReceivables: true
    },

    reserve: { balance: 0 }
  };

  function loadReserve() {
    try {
      var raw = localStorage.getItem("FIN_RESERVE_BALANCE");
      S.reserve.balance = raw ? Number(raw) : 0;
      if (!isFinite(S.reserve.balance)) S.reserve.balance = 0;
    } catch (_) { S.reserve.balance = 0; }
  }
  function saveReserve() { try { localStorage.setItem("FIN_RESERVE_BALANCE", String(S.reserve.balance || 0)); } catch (_) {} }

  function buildOptions(items, includeBlank, blankText) {
    if (includeBlank !== false) includeBlank = true;
    blankText = blankText || "— Todos —";
    var arr = Array.isArray(items) ? items : [];
    var out = [];
    if (includeBlank) out.push('<option value="">' + esc(blankText) + "</option>");
    for (var i = 0; i < arr.length; i++) out.push('<option value="' + esc(arr[i].ID) + '">' + esc(arr[i].VALUE) + "</option>");
    return out.join("");
  }

  function enumName(fieldId, enumId) {
    if (!enumId) return "";
    var list = (S.enums && S.enums[fieldId]) ? S.enums[fieldId] : [];
    for (var i = 0; i < list.length; i++) if (String(list[i].ID) === String(enumId)) return list[i].VALUE;
    return String(enumId);
  }

  function stageName(stageId) {
    for (var i = 0; i < S.stages.length; i++) if (String(S.stages[i].STATUS_ID) === String(stageId)) return S.stages[i].NAME;
    return String(stageId || "");
  }

  function isBadFav(fav) {
    var s = String(fav || "").trim().toUpperCase();
    if (!s) return false;
    if (s.indexOf("__QUEUE__") === 0) return true;
    if (s.indexOf("FILA ATENDIMENTO") > -1) return true;
    return false;
  }

  function updateDeal(id, fields) { return apiCall("crm.deal.update", { id: String(id), fields: fields || {} }); }
  function createDeal(fields) { return apiCall("crm.deal.add", { fields: fields || {} }).then(function (r) { return r && r.result ? r.result : null; }); }
  function deleteDeal(id) { return apiCall("crm.deal.delete", { id: String(id) }); }

  // ===== LEMBRETE PIPELINE 17 (MANUELA) =====
  function createReminderDeal(finDealId, kind, fav, vprev, dateISO, freqLabel) {
    var title = "LEMBRETE FIN • " + kind + " • " + (fav || ("#" + finDealId));
    var desc = [
      "Origem: Financeiro (Pipeline 27)",
      "Deal Financeiro: " + finDealId,
      "Tipo: " + kind,
      "Favorecido: " + (fav || ""),
      "Valor: " + moneyBR(vprev || 0),
      "Data inicial: " + (dateISO || ""),
      "Recorrência: " + freqLabel
    ].join("\n");

    return createDeal({
      TITLE: title,
      CATEGORY_ID: String(CFG.REMINDER_CATEGORY_ID),
      STAGE_ID: String(CFG.REMINDER_STAGE_ID),
      ASSIGNED_BY_ID: String(CFG.REMINDER_ASSIGNED_ID),
      COMMENTS: desc
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
          S.enums[k] = v.items.map(function (it) { return { ID: String(it.ID), VALUE: String(it.VALUE) }; });
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
          CFG.F.DATA_PREV, CFG.F.STATUS_FIN, CFG.F.CONTA, CFG.F.CENTRO_CUSTO
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

  // ===== SALDO POR CENTRO =====
  function calcCenterBalances() {
    var map = {};
    var list = S.deals || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (String(d.CATEGORY_ID) !== String(CFG.DEAL_CATEGORY_ID)) continue;

      var centro = String(d[CFG.F.CENTRO_CUSTO] || "");
      if (!centro) centro = "__SEM__";

      var st = String(d.STAGE_ID || "");
      var isRec = (st === CFG.STAGES.REC_A_RECEBER || st === CFG.STAGES.REC_RECEBIDA);
      var isExp = (st === CFG.STAGES.DESP_A_PAGAR || st === CFG.STAGES.DESP_PAGA);

      if (!isRec && !isExp) continue;

      // saldo: usa REAL se tiver, senão PREV
      var val = Number(d[CFG.F.VALOR_REAL] || 0) || Number(d[CFG.F.VALOR_PREV] || 0) || 0;

      if (!map[centro]) map[centro] = 0;
      map[centro] += (isRec ? val : -val);
    }
    return map;
  }

  function renderSidebarCenters() {
    var host = el("#fin-side-centers");
    if (!host) return;

    var items = (S.enums && S.enums[CFG.F.CENTRO_CUSTO]) ? S.enums[CFG.F.CENTRO_CUSTO] : [];
    var sel = String(S.filters.centro || "");
    var bal = calcCenterBalances();

    function btn(id, label, active) {
      var b = (id ? (bal[id] || 0) : 0);
      var right = id ? ('<span class="fin-muted" style="margin-left:auto">' + esc(moneyBR(b)) + "</span>") : "";
      return (
        '<button class="fin-side-item ' + (active ? "is-active" : "") + '" data-centro="' + esc(id) + '">' +
          '<span class="fin-dot"></span><span class="fin-side-label">' + esc(label) + "</span>" + right +
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

  function renderTotals() {
    var list = S.filtered || [];
    var prev = 0, real = 0;

    for (var i = 0; i < list.length; i++) {
      prev += Number(list[i][CFG.F.VALOR_PREV] || 0) || 0;
      real += Number(list[i][CFG.F.VALOR_REAL] || 0) || 0;
    }

    if (el("#tot-prev")) el("#tot-prev").textContent = moneyBR(prev);
    if (el("#tot-real")) el("#tot-real").textContent = moneyBR(real);
    if (el("#reserve-balance")) el("#reserve-balance").textContent = moneyBR(S.reserve.balance || 0);
    if (el("#tot-count")) el("#tot-count").textContent = String(list.length);

    if (S.lastSyncAt && el("#fin-lastsync")) {
      el("#fin-lastsync").textContent = "Atualizado em " + S.lastSyncAt + " • API: " + (S.apiMode || "?");
    }
  }

  function renderChartsPlaceholders() {
    var a = el("#chart-cat");
    var b = el("#chart-evo");
    if (a) a.innerHTML = '<div class="fin-chart-box">Pizza: Despesas por Categorias (próximo passo)</div>';
    if (b) b.innerHTML = '<div class="fin-chart-box">Linha: Evolução Receitas x Despesas (próximo passo)</div>';
  }

  function applyFilters() {
    var q = String(S.filters.q || "").trim().toLowerCase();

    S.filtered = (S.deals || []).filter(function (d) {
      if (isBadFav(d[CFG.F.FAVORECIDO])) return false;

      if (S.filters.centro && String(d[CFG.F.CENTRO_CUSTO] || "") !== String(S.filters.centro)) return false;
      if (S.filters.competencia && String(d[CFG.F.COMPETENCIA] || "") !== String(S.filters.competencia)) return false;
      if (S.filters.tipo && String(d[CFG.F.TIPO_FIN] || "") !== String(S.filters.tipo)) return false;
      if (S.filters.conta && String(d[CFG.F.CONTA] || "") !== String(S.filters.conta)) return false;
      if (S.filters.statusFin && String(d[CFG.F.STATUS_FIN] || "") !== String(S.filters.statusFin)) return false;

      if (S.filters.stageId) {
        if (String(d.STAGE_ID || "") !== String(S.filters.stageId)) return false;
      } else {
        if (String(d.STAGE_ID || "") === String(CFG.STAGES.CONCLUIDO)) return false;
      }

      var st = String(d.STAGE_ID || "");
      var isExp = (st === CFG.STAGES.DESP_A_PAGAR || st === CFG.STAGES.DESP_PAGA);
      var isRec = (st === CFG.STAGES.REC_A_RECEBER || st === CFG.STAGES.REC_RECEBIDA);

      if (!S.filters.showPayables && isExp) return false;
      if (!S.filters.showReceivables && isRec) return false;

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
    renderSidebarCenters(); // saldo atualizado
  }

  function nextStageByCurrent(stageId) {
    stageId = String(stageId || "");
    if (stageId === CFG.STAGES.DESP_A_PAGAR) return CFG.STAGES.DESP_PAGA;
    if (stageId === CFG.STAGES.REC_A_RECEBER) return CFG.STAGES.REC_RECEBIDA;
    return "";
  }

  function openPayReceiveModal(deal) {
    var stageTo = nextStageByCurrent(deal.STAGE_ID);
    if (!stageTo) {
      toast("Este item não está em A PAGAR / A RECEBER.", "err");
      return;
    }

    var isDesp = String(deal.STAGE_ID) === CFG.STAGES.DESP_A_PAGAR;
    var title = isDesp ? "Marcar DESPESA como PAGA" : "Marcar RECEITA como RECEBIDA";

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">' + esc(title) + '</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-row" style="gap:10px;flex-wrap:wrap">' +
          '<div class="fin-field" style="flex:1;min-width:240px"><label>Valor pago/recebido</label><input id="pr-val" value="' + esc(String(deal[CFG.F.VALOR_REAL] || deal[CFG.F.VALOR_PREV] || "")) + '" placeholder="Ex.: 1500,00"></div>' +
          '<div class="fin-field" style="flex:1;min-width:240px"><label>Data pagamento/recebimento</label><input id="pr-date" value="' + esc(toISODate(deal[CFG.F.DATA_REAL] || "")) + '" placeholder="YYYY-MM-DD"></div>' +
        '</div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Voltar</button>' +
          '<button class="fin-btn fin-btn--primary" id="pr-save" data-busylock="1">Salvar</button>' +
        '</div>' +
      '</div>'
    );

    m.q("#pr-save").addEventListener("click", function () {
      setLoading(true);

      var v = parseMoneyBR(m.q("#pr-val").value || "");
      var dt = toISODate(m.q("#pr-date").value || "");

      var fields = {};
      fields[CFG.F.VALOR_REAL] = v;
      fields[CFG.F.DATA_REAL] = dt;
      fields.STAGE_ID = stageTo;

      updateDeal(deal.ID, fields)
        .then(function () { toast("Atualizado ✅"); m.close(); return refresh(); })
        .catch(function (e) { toast("Falha: " + (e.message || String(e)), "err"); })
        .finally(function () { setLoading(false); });
    });
  }

  function confirmDelete(deal) {
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Excluir lançamento</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div style="font-weight:900">Tem certeza que deseja EXCLUIR o card <span class="fin-mono">#' + esc(deal.ID) + '</span>?</div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Voltar</button>' +
          '<button class="fin-btn fin-btn--danger" id="del-ok" data-busylock="1">Excluir</button>' +
        '</div>' +
      '</div>'
    );

    m.q("#del-ok").addEventListener("click", function () {
      setLoading(true);
      deleteDeal(deal.ID)
        .then(function () { toast("Excluído ✅"); m.close(); return refresh(); })
        .catch(function (e) { toast("Falha: " + (e.message || String(e)), "err"); })
        .finally(function () { setLoading(false); });
    });
  }

  function guessCompetenciaIdFromISO(iso) {
    iso = toISODate(iso);
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    var yy = m[1], mm = m[2];

    var list = S.enums[CFG.F.COMPETENCIA] || [];
    var candidates = [];
    for (var i = 0; i < list.length; i++) {
      var v = String(list[i].VALUE || "").toLowerCase();
      if (v.indexOf(yy) > -1) candidates.push(list[i]);
    }
    var map = {
      "01":["jan","janeiro","01"],
      "02":["fev","fevereiro","02"],
      "03":["mar","março","03"],
      "04":["abr","abril","04"],
      "05":["mai","maio","05"],
      "06":["jun","junho","06"],
      "07":["jul","julho","07"],
      "08":["ago","agosto","08"],
      "09":["set","setembro","09"],
      "10":["out","outubro","10"],
      "11":["nov","novembro","11"],
      "12":["dez","dezembro","12"]
    };
    var keys = map[mm] || [mm, String(Number(mm))];
    for (var j = 0; j < candidates.length; j++) {
      var t = String(candidates[j].VALUE || "").toLowerCase();
      for (var k = 0; k < keys.length; k++) {
        if (t.indexOf(keys[k]) > -1) return String(candidates[j].ID);
      }
    }
    for (var a = 0; a < list.length; a++) {
      var tt = String(list[a].VALUE || "").toLowerCase();
      for (var kk = 0; kk < keys.length; kk++) {
        if (tt.indexOf(keys[kk]) > -1 && tt.indexOf(yy) > -1) return String(list[a].ID);
      }
    }
    return "";
  }

  // ========= TRANSFERÊNCIA ENTRE CENTROS =========
  function openTransferModal() {
    var ccOpts = buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—");
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Transferir entre centros</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-row" style="flex-wrap:wrap">' +
          '<div class="fin-field" style="min-width:260px;flex:1"><label>De (Centro)</label><select id="tr-from">' + ccOpts + '</select></div>' +
          '<div class="fin-field" style="min-width:260px;flex:1"><label>Para (Centro)</label><select id="tr-to">' + ccOpts + '</select></div>' +
        '</div>' +
        '<div class="fin-row" style="flex-wrap:wrap;margin-top:10px">' +
          '<div class="fin-field" style="min-width:260px;flex:1"><label>Valor</label><input id="tr-val" placeholder="Ex.: 1500,00"></div>' +
          '<div class="fin-field" style="min-width:260px;flex:1"><label>Data</label><input id="tr-date" placeholder="YYYY-MM-DD"></div>' +
        '</div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Voltar</button>' +
          '<button class="fin-btn fin-btn--primary" id="tr-go" data-busylock="1">Transferir</button>' +
        '</div>' +
      '</div>'
    );

    function tipoEnumForKind(kind) {
      var items = S.enums[CFG.F.TIPO_FIN] || [];
      for (var i = 0; i < items.length; i++) {
        var t = String(items[i].VALUE || "").toUpperCase();
        if (kind === "DESPESA" && t.indexOf("DESP") > -1) return String(items[i].ID);
        if (kind === "RECEITA" && t.indexOf("REC") > -1) return String(items[i].ID);
      }
      return "";
    }

    m.q("#tr-go").addEventListener("click", function(){
      var from = m.q("#tr-from").value || "";
      var to = m.q("#tr-to").value || "";
      var val = parseMoneyBR(m.q("#tr-val").value || "");
      var dt = toISODate(m.q("#tr-date").value || "");

      if (!from || !to || from === to) { toast("Escolha centros diferentes.", "err"); return; }
      if (!val) { toast("Informe o valor.", "err"); return; }
      if (!dt) { toast("Informe a data (YYYY-MM-DD).", "err"); return; }

      var tipoDesp = tipoEnumForKind("DESPESA");
      var tipoRec = tipoEnumForKind("RECEITA");
      if (!tipoDesp || !tipoRec) { toast("Enum Tipo Financeiro (DESPESA/RECEITA) não encontrado.", "err"); return; }

      setLoading(true);

      // cria 1 despesa (saída) e 1 receita (entrada)
      createDeal({
        TITLE: "TRANSFERÊNCIA • SAÍDA",
        CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID),
        STAGE_ID: CFG.STAGES.DESP_A_PAGAR,
        [CFG.F.TIPO_FIN]: tipoDesp,
        [CFG.F.CENTRO_CUSTO]: from,
        [CFG.F.FAVORECIDO]: "Transferência entre centros",
        [CFG.F.VALOR_PREV]: val,
        [CFG.F.DATA_PREV]: dt
      }).then(function(){
        return createDeal({
          TITLE: "TRANSFERÊNCIA • ENTRADA",
          CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID),
          STAGE_ID: CFG.STAGES.REC_A_RECEBER,
          [CFG.F.TIPO_FIN]: tipoRec,
          [CFG.F.CENTRO_CUSTO]: to,
          [CFG.F.FAVORECIDO]: "Transferência entre centros",
          [CFG.F.VALOR_PREV]: val,
          [CFG.F.DATA_PREV]: dt
        });
      }).then(function(){
        toast("Transferência criada ✅");
        m.close();
        return refresh();
      }).catch(function(e){
        toast("Falha: " + (e.message || String(e)), "err");
      }).finally(function(){
        setLoading(false);
      });
    });
  }

  /* ========= LOTE (Tabela) ========= */
  function openBatchTableModal(kindFixed) {
    // kindFixed: "DESPESA" | "RECEITA"
    var rows = [];
    for (var n=0;n<15;n++) rows.push(mkRow(kindFixed)); // ✅ 15 linhas por padrão

    function mkRow(kind) {
      return {
        centro: "",
        conta: "",      // opcional
        categoria: "",
        favorecido: "",
        valor: "",
        obs: "",        // opcional
        kind: (kind === "RECEITA") ? "RECEITA" : "DESPESA",
        freq: "once",   // once | weekly | monthly | yearly
        start: "",
        count: "1",
        weekday: "1",
        monthday: "1",
        month: "1"
      };
    }

    function calcDate(baseISO, row, idx) {
      baseISO = toISODate(baseISO);
      if (!baseISO) return "";
      if (row.freq === "once") return baseISO;

      if (row.freq === "weekly") {
        var wd = Number(row.weekday || 1);
        var d = new Date(baseISO + "T12:00:00");
        var jswd = d.getDay();
        var cur = (jswd === 0 ? 7 : jswd);
        var delta = wd - cur;
        if (delta < 0) delta += 7;
        var first = addDaysISO(baseISO, delta);
        return addDaysISO(first, idx * 7);
      }

      if (row.freq === "monthly") {
        var day = Number(row.monthday || 1);
        return addMonthsISO(baseISO, idx, day);
      }

      if (row.freq === "yearly") {
        var mo = Number(row.month || 1);
        var dayy = Number(row.monthday || 1);
        var baseY = String(baseISO).slice(0,4);
        var first = baseY + "-" + String(mo).padStart(2,"0") + "-" + String(dayy).padStart(2,"0");
        if (first < baseISO) first = String(Number(baseY)+1) + "-" + String(mo).padStart(2,"0") + "-" + String(dayy).padStart(2,"0");
        return addYearsISO(first, idx, mo, dayy);
      }

      return baseISO;
    }

    function tipoEnumForKind(kind) {
      var items = S.enums[CFG.F.TIPO_FIN] || [];
      for (var i = 0; i < items.length; i++) {
        var t = String(items[i].VALUE || "").toUpperCase();
        if (kind === "DESPESA" && t.indexOf("DESP") > -1) return String(items[i].ID);
        if (kind === "RECEITA" && t.indexOf("REC") > -1) return String(items[i].ID);
      }
      return "";
    }

    function stageForKind(kind) {
      return (kind === "RECEITA") ? CFG.STAGES.REC_A_RECEBER : CFG.STAGES.DESP_A_PAGAR;
    }

    function renderTable(host) {
      var ccOpts = buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—");
      var contaOpts = buildOptions(S.enums[CFG.F.CONTA] || [], true, "— (opcional) —");
      var catOpts = buildOptions(S.enums[CFG.F.CATEGORIA] || [], true, "—");

      var isReceita = (kindFixed === "RECEITA");

      var html =
        '<div class="fin-row" style="justify-content:space-between;flex-wrap:wrap;margin-bottom:10px">' +
          '<div class="fin-muted" style="font-weight:900">' +
            (isReceita ? 'LOTE RECEITAS' : 'LOTE DESPESAS') +
            ' • Competência opcional • CONTA/OBS opcionais' +
          '</div>' +
          '<div class="fin-row fin-row--right" style="gap:8px;flex-wrap:wrap">' +
            (isReceita ? '<button class="fin-btn" id="b-csv">Importar CSV (Favorecido;Valor;Data)</button>' : '') +
            '<button class="fin-btn" id="b-clean">Limpar linhas vazias</button>' +
            '<button class="fin-btn" data-close="1">Voltar</button>' +
          '</div>' +
        '</div>' +

        '<div style="overflow:auto;max-height:70vh">' +
          '<table class="fin-batch-table">' +
            '<thead><tr>' +
              '<th style="min-width:120px">CENTRO</th>' +
              '<th style="min-width:140px">CONTA (opcional)</th>' +
              '<th style="min-width:140px">CATEGORIA</th>' +
              '<th style="min-width:220px">FAVORECIDO</th>' +
              '<th style="min-width:120px">VALOR</th>' +
              '<th style="min-width:140px">DATA INICIAL</th>' +
              '<th style="min-width:220px">OBS (opcional)</th>' +
              '<th style="min-width:130px">RECORRÊNCIA</th>' +
              '<th style="min-width:110px">QTD</th>' +
              '<th style="min-width:90px"></th>' +
            '</tr></thead><tbody>';

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        html += '<tr data-i="'+i+'">' +
          '<td><select class="fin-batch-sel" data-k="centro">' + ccOpts + '</select></td>' +
          '<td><select class="fin-batch-sel" data-k="conta">' + contaOpts + '</select></td>' +
          '<td><select class="fin-batch-sel" data-k="categoria">' + catOpts + '</select></td>' +
          '<td><input class="fin-batch-inp" data-k="favorecido" value="'+esc(r.favorecido)+'" placeholder="Ex.: Light, Cliente..."></td>' +
          '<td><input class="fin-batch-inp" data-k="valor" value="'+esc(r.valor)+'" placeholder="1500,00"></td>' +
          '<td><input class="fin-batch-inp" data-k="start" value="'+esc(r.start)+'" placeholder="YYYY-MM-DD"></td>' +
          '<td><textarea class="fin-batch-txt" data-k="obs" placeholder="Observações...">'+esc(r.obs)+'</textarea></td>' +
          '<td>' +
            '<select class="fin-batch-sel" data-k="freq">' +
              '<option value="once" '+(r.freq==="once"?"selected":"")+'>Avulsa</option>' +
              '<option value="weekly" '+(r.freq==="weekly"?"selected":"")+'>Semanal</option>' +
              '<option value="monthly" '+(r.freq==="monthly"?"selected":"")+'>Mensal</option>' +
              '<option value="yearly" '+(r.freq==="yearly"?"selected":"")+'>Anual</option>' +
            '</select>' +
          '</td>' +
          '<td><input class="fin-batch-inp" data-k="count" value="'+esc(r.count)+'" placeholder="1"></td>' +
          '<td><button class="fin-btn fin-btn--danger" data-del="1" style="width:100%">Remover</button></td>' +
        '</tr>';
      }

      html += '</tbody></table></div>' +
        '<div class="fin-row" style="margin-top:10px;justify-content:space-between;flex-wrap:wrap">' +
          '<button class="fin-btn" id="b-add">+ Linha</button>' +
          '<div class="fin-row fin-row--right" style="gap:8px;flex-wrap:wrap">' +
            '<div class="fin-field" style="min-width:260px"><label>Competência (opcional)</label><select id="b-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || [], true, "Automático") + '</select></div>' +
            '<button class="fin-btn fin-btn--primary" id="b-create" data-busylock="1">Criar</button>' +
          '</div>' +
        '</div>' +
        (isReceita ? '<input type="file" id="csvfile" accept=".csv" style="display:none">' : '');

      host.innerHTML = html;

      // set selected values after render (evita replace)
      var trs = host.querySelectorAll("tr[data-i]");
      for (var x=0;x<trs.length;x++){
        var idx = Number(trs[x].getAttribute("data-i"));
        var rr = rows[idx];
        var s1 = trs[x].querySelector('[data-k="centro"]'); if (s1) s1.value = rr.centro || "";
        var s2 = trs[x].querySelector('[data-k="conta"]'); if (s2) s2.value = rr.conta || "";
        var s3 = trs[x].querySelector('[data-k="categoria"]'); if (s3) s3.value = rr.categoria || "";
        var s4 = trs[x].querySelector('[data-k="freq"]'); if (s4) s4.value = rr.freq || "once";
      }

      host.querySelector("#b-add").addEventListener("click", function(){
        rows.push(mkRow(kindFixed));
        renderTable(host);
      });

      host.querySelector("#b-clean").addEventListener("click", function(){
        var kept = [];
        for (var i=0;i<rows.length;i++){
          var r = rows[i];
          var has = (String(r.favorecido||"").trim() || String(r.valor||"").trim() || String(r.start||"").trim() || String(r.categoria||"").trim());
          if (has) kept.push(r);
        }
        rows = kept.length ? kept : [mkRow(kindFixed)];
        renderTable(host);
      });

      host.querySelector("#b-create").addEventListener("click", function(){
        createBatch(host.querySelector("#b-comp").value || "");
      });

      // listeners de edição
      var tbody = host.querySelector("tbody");
      tbody.addEventListener("input", function(e){
        var tr = e.target.closest("tr[data-i]");
        if (!tr) return;
        var i = Number(tr.getAttribute("data-i"));
        var k = e.target.getAttribute("data-k");
        if (!k) return;
        rows[i][k] = e.target.value;
      });
      tbody.addEventListener("change", function(e){
        var tr = e.target.closest("tr[data-i]");
        if (!tr) return;
        var i = Number(tr.getAttribute("data-i"));
        var k = e.target.getAttribute("data-k");
        if (!k) return;
        rows[i][k] = e.target.value;
      });

      tbody.addEventListener("click", function(e){
        var btn = e.target.closest("[data-del]");
        if (!btn) return;
        var tr = btn.closest("tr[data-i]");
        var i = Number(tr.getAttribute("data-i"));
        rows.splice(i, 1);
        if (!rows.length) rows.push(mkRow(kindFixed));
        renderTable(host);
      });

      // CSV (só receitas)
      if (isReceita) {
        host.querySelector("#b-csv").addEventListener("click", function(){
          host.querySelector("#csvfile").click();
        });
        host.querySelector("#csvfile").addEventListener("change", function(ev){
          var f = ev.target.files && ev.target.files[0];
          if (!f) return;
          var reader = new FileReader();
          reader.onload = function(){
            var txt = String(reader.result || "");
            var lines = txt.split(/\r?\n/).filter(function(l){ return String(l||"").trim(); });
            if (!lines.length) return;

            // aceita ; ou ,
            function splitLine(line){
              var a = line.split(";");
              if (a.length >= 3) return a;
              return line.split(",");
            }

            // pula header se parecer
            var startAt = 0;
            var head = splitLine(lines[0]).map(function(x){ return String(x||"").toLowerCase(); }).join("|");
            if (head.indexOf("fav")>-1 || head.indexOf("valor")>-1 || head.indexOf("data")>-1) startAt = 1;

            var idxRow = 0;
            for (var i=startAt;i<lines.length;i++){
              var cols = splitLine(lines[i]);
              var fav = String(cols[0]||"").trim();
              var val = String(cols[1]||"").trim();
              var dat = String(cols[2]||"").trim();
              if (!fav && !val && !dat) continue;

              if (!rows[idxRow]) rows.push(mkRow("RECEITA"));
              rows[idxRow].favorecido = fav;
              rows[idxRow].valor = val;
              rows[idxRow].start = toISODate(dat);
              idxRow++;
            }
            renderTable(host);
            toast("CSV importado ✅", "ok");
          };
          reader.readAsText(f);
        });
      }
    }

    function createBatch(compOverride) {
      setLoading(true);

      try {
        var ops = Promise.resolve();
        var created = 0;

        for (var i = 0; i < rows.length; i++) (function(r){
          ops = ops.then(function(){
            var fav = String(r.favorecido || "").trim();
            if (!fav) return; // linha vazia: ignora
            if (isBadFav(fav)) throw new Error("Favorecido inválido (FILA/QUEUE): " + fav);

            var vprev = parseMoneyBR(r.valor || "");
            var start = toISODate(r.start || "");
            if (!start) throw new Error("Linha sem Data inicial (YYYY-MM-DD).");

            var cc = r.centro || "";
            var conta = r.conta || "";   // opcional
            var cat = r.categoria || "";
            var obs = String(r.obs || "").trim(); // opcional

            var kind = (kindFixed === "RECEITA") ? "RECEITA" : "DESPESA";
            var tipoEnum = tipoEnumForKind(kind);
            if (!tipoEnum) throw new Error("Não encontrei enum de Tipo Financeiro para " + kind + ".");

            var stage = stageForKind(kind);
            var count = Math.max(1, parseInt(r.count || "1", 10) || 1);

            var comp = compOverride || "";
            if (!comp) comp = guessCompetenciaIdFromISO(start);

            var p = Promise.resolve();
            for (var k = 0; k < count; k++) (function(idx){
              p = p.then(function(){
                var dt = calcDate(start, r, idx);

                var fields = {};
                fields.TITLE = "FIN • " + kind + " • " + fav;
                fields.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
                fields.STAGE_ID = stage;

                fields[CFG.F.TIPO_FIN] = tipoEnum;
                if (comp) fields[CFG.F.COMPETENCIA] = comp;
                if (cc) fields[CFG.F.CENTRO_CUSTO] = cc;
                if (conta) fields[CFG.F.CONTA] = conta;        // ✅ opcional
                if (cat) fields[CFG.F.CATEGORIA] = cat;

                fields[CFG.F.DATA_PREV] = dt;
                fields[CFG.F.VALOR_PREV] = vprev;
                fields[CFG.F.FAVORECIDO] = fav;
                if (obs) fields[CFG.F.OBS] = obs;              // ✅ opcional

                return createDeal(fields).then(function(finId){
                  created++;

                  // ✅ Se recorrente, cria lembrete na Pipeline 17 (Manuela)
                  if (r.freq && r.freq !== "once") {
                    var label = (r.freq === "weekly") ? "Semanal" : (r.freq === "monthly") ? "Mensal" : (r.freq === "yearly") ? "Anual" : "Recorrente";
                    return createReminderDeal(finId, kind, fav, vprev, dt, label);
                  }
                });
              });
            })(k);

            return p;
          });
        })(rows[i]);

        ops.then(function(){
          toast("Lote criado ✅ (" + created + " itens)");
          m.close();
          return refresh();
        }).catch(function(e){
          toast("Falha no lote: " + (e.message || String(e)), "err");
        }).finally(function(){
          setLoading(false);
        });

      } catch(err) {
        toast(err.message || String(err), "err");
        setLoading(false);
      }
    }

    var m = modal(
      '<div class="fin-modal-head">' +
        '<div class="fin-modal-title">' + esc((kindFixed==="RECEITA") ? "LOTE — RECEITAS" : "LOTE — DESPESAS") + '</div>' +
        '<button class="fin-x" data-close="1" title="Voltar">×</button>' +
      '</div>' +
      '<div class="fin-modal-body"><div id="batch-host"></div></div>',
      { full: true } // ✅ quase tela cheia
    );

    renderTable(m.q("#batch-host"));
  }

  function openReserveModal() {
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Fundo de Reserva</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-field"><label>Saldo atual</label><input id="rv" value="' + esc(String(S.reserve.balance || 0).replace(".", ",")) + '" placeholder="Ex.: 5000,00"></div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Voltar</button>' +
          '<button class="fin-btn fin-btn--primary" id="rsave" data-busylock="1">Salvar</button>' +
        '</div>' +
      '</div>'
    );
    m.q("#rsave").addEventListener("click", function () {
      var val = parseMoneyBR(m.q("#rv").value || "");
      S.reserve.balance = val;
      saveReserve();
      toast("Reserva atualizada ✅");
      m.close();
      renderTotals();
    });
  }

  function renderTable() {
    var tb = el("#fin-tbody");
    if (!tb) return;

    var list = S.filtered || [];
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="11" class="fin-muted">Nenhum item encontrado.</td></tr>';
      return;
    }

    var rows = [];
    for (var i = 0; i < list.length && i < CFG.PAGE_SIZE; i++) {
      var d = list[i];
      var fav = d[CFG.F.FAVORECIDO] || d.TITLE || "";

      var st = String(d.STAGE_ID || "");
      var canCheck = (st === CFG.STAGES.DESP_A_PAGAR) || (st === CFG.STAGES.REC_A_RECEBER);
      var chkLabel = (st === CFG.STAGES.DESP_A_PAGAR) ? "Pagar" : ((st === CFG.STAGES.REC_A_RECEBER) ? "Receber" : "");
      var chk = canCheck
        ? '<span class="fin-rowchk"><input type="checkbox" data-act="chk" data-id="' + esc(d.ID) + '"><span>' + esc(chkLabel) + '</span></span>'
        : '<span class="fin-muted">—</span>';

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
          "<td>" + esc(stageName(d.STAGE_ID)) + "</td>" +
          "<td>" +
            '<div class="fin-actions-row">' +
              chk +
              '<button class="fin-mini fin-mini--danger" data-act="del" data-id="' + esc(d.ID) + '">Excluir</button>' +
            "</div>" +
          "</td>" +
        "</tr>"
      );
    }

    tb.innerHTML = rows.join("");

    var btns = tb.querySelectorAll("[data-act]");
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener("click", function () {
        var id = this.getAttribute("data-id");
        var act = this.getAttribute("data-act");
        var deal = null;
        for (var x = 0; x < S.deals.length; x++) if (String(S.deals[x].ID) === String(id)) { deal = S.deals[x]; break; }
        if (!deal) return;

        if (act === "del") return confirmDelete(deal);
        if (act === "chk") {
          try { this.checked = false; } catch(_) {}
          return openPayReceiveModal(deal);
        }
      });
    }
  }

  function render() {
    root.innerHTML =
      '<div class="fin-page">' +

        '<header class="fin-topbar">' +
          '<div class="fin-top-left">' +
            '<img class="fin-top-logo" src="' + esc(CFG.LOGO_URL) + '" alt="CGD">' +
            '<div>' +
              '<div class="fin-top-title">Financeiro CGD</div>' +
              '<div class="fin-top-sub"><span id="fin-lastsync">—</span> <span id="fin-loading" class="fin-loading" style="display:none">Carregando…</span></div>' +
            '</div>' +
          '</div>' +

          '<div class="fin-top-actions">' +
            '<div class="fin-search"><span aria-hidden="true">🔎</span><input id="f-q" placeholder="Buscar por favorecido, obs, centro..."></div>' +
            '<button class="fin-btn" id="btn-transfer" data-busylock="1">TRANSFERIR</button>' +
            '<button class="fin-btn" id="btn-reserve" data-busylock="1">RESERVA</button>' +
            '<button class="fin-btn fin-btn--primary" id="btn-batch-exp" data-busylock="1">LOTE DESPESAS</button>' +
            '<button class="fin-btn fin-btn--primary" id="btn-batch-rec" data-busylock="1">LOTE RECEITAS</button>' +
            '<button class="fin-btn" id="btn-refresh" data-busylock="1">ATUALIZAR</button>' +
          '</div>' +
        '</header>' +

        '<div class="fin-shell">' +
          '<div class="fin-body">' +
            '<aside class="fin-side">' +
              '<div class="fin-side-brand">' +
                '<div class="fin-brand-title">Financeiro CGD</div>' +
                '<div class="fin-brand-sub">Deals • Pipeline 27</div>' +
              '</div>' +
              '<div class="fin-side-block">' +
                '<div class="fin-side-h">Centro de custo (saldo)</div>' +
                '<div id="fin-side-centers" class="fin-side-list"></div>' +
              '</div>' +
            '</aside>' +

            '<main>' +
              '<section class="fin-panel"><div class="fin-panel-inner">' +

                '<div class="fin-kpis">' +
                  '<div class="fin-kpi"><div class="fin-kpi-k">Total Previsto</div><div class="fin-kpi-v" id="tot-prev">—</div></div>' +
                  '<div class="fin-kpi"><div class="fin-kpi-k">Total Realizado</div><div class="fin-kpi-v" id="tot-real">—</div></div>' +
                  '<div class="fin-kpi"><div class="fin-kpi-k">Fundo de reserva</div><div class="fin-kpi-v" id="reserve-balance">—</div></div>' +
                '</div>' +

                '<div class="fin-filters">' +
                  '<div class="fin-field"><label>Competência</label><select id="f-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || []) + '</select></div>' +
                  '<div class="fin-field"><label>Conta</label><select id="f-conta">' + buildOptions(S.enums[CFG.F.CONTA] || [], true, "—") + '</select></div>' +
                  '<div style="flex-basis:100%; height:0"></div>' +

                  '<div class="fin-toggles">' +
                    '<label class="fin-check"><input type="checkbox" id="tog-exp" checked> <span>Mostrar Despesas</span></label>' +
                    '<label class="fin-check"><input type="checkbox" id="tog-rec" checked> <span>Mostrar Receitas</span></label>' +
                    '<div class="fin-check" style="margin-left:auto"><span class="fin-muted">Qtd. Itens:</span> <span id="tot-count" class="fin-strong">0</span></div>' +
                  '</div>' +

                  '<div class="fin-charts" style="flex-basis:100%">' +
                    '<div id="chart-cat"></div>' +
                    '<div id="chart-evo"></div>' +
                  '</div>' +
                '</div>' +

                '<div class="fin-table-wrap" style="margin-top:12px">' +
                  '<table class="fin-table">' +
                    '<thead><tr>' +
                      '<th style="width:76px">ID</th>' +
                      '<th>Favorecido</th>' +
                      '<th style="width:170px">Centro</th>' +
                      '<th style="width:170px">Conta</th>' +
                      '<th style="width:140px">Tipo</th>' +
                      '<th style="width:130px">Competência</th>' +
                      '<th style="width:120px">Data Prev.</th>' +
                      '<th style="width:140px">Previsto</th>' +
                      '<th style="width:140px">Realizado</th>' +
                      '<th style="width:160px">Etapa</th>' +
                      '<th style="width:320px">Ações</th>' +
                    '</tr></thead>' +
                    '<tbody id="fin-tbody"><tr><td colspan="11" class="fin-muted">Carregando…</td></tr></tbody>' +
                  '</table>' +
                '</div>' +

                '<div id="fin-toast-host" class="fin-toast-host"></div>' +

              '</div></section>' +
            '</main>' +
          '</div>' +
        '</div>' +

        '<div class="fin-footerbar">' +
          '<div class="fin-footer-left"><div class="k">' + esc(CFG.FOOTER.addressTitle) + '</div><div class="v">' + esc(CFG.FOOTER.addressText) + '</div></div>' +
          '<div class="fin-footer-center">' + esc(CFG.FOOTER.credits) + '</div>' +
          '<div class="fin-footer-right">' +
            CFG.FOOTER.companies.map(function (c) {
              return '<div class="fin-footer-box"><div class="t">' + esc(c.name) + '</div><div class="s">' + esc(c.meta) + '</div></div>';
            }).join("") +
          '</div>' +
          '<div class="fin-footer-avatars" id="fin-avatars"></div>' +
        '</div>' +

      '</div>';

    el("#btn-transfer").addEventListener("click", function(){ openTransferModal(); });
    el("#btn-reserve").addEventListener("click", function () { openReserveModal(); });

    el("#btn-batch-exp").addEventListener("click", function () { openBatchTableModal("DESPESA"); });
    el("#btn-batch-rec").addEventListener("click", function () { openBatchTableModal("RECEITA"); });

    el("#btn-refresh").addEventListener("click", function () { refresh(); });

    el("#f-q").addEventListener("input", function (e) { S.filters.q = e.target.value || ""; applyFilters(); });
    el("#f-comp").addEventListener("change", function () { S.filters.competencia = el("#f-comp").value || ""; applyFilters(); });
    el("#f-conta").addEventListener("change", function () { S.filters.conta = el("#f-conta").value || ""; applyFilters(); });

    el("#tog-exp").addEventListener("change", function () { S.filters.showPayables = !!el("#tog-exp").checked; applyFilters(); });
    el("#tog-rec").addEventListener("change", function () { S.filters.showReceivables = !!el("#tog-rec").checked; applyFilters(); });

    renderSidebarCenters();
    renderChartsPlaceholders();
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
        if (tb) tb.innerHTML = '<tr><td colspan="11" class="fin-muted">Erro: ' + esc(e.message || String(e)) + '</td></tr>';
      })
      .finally(function () { setLoading(false); });
  }

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
    loadReserve();
    return loadMeta()
      .then(function () {
        render();
        return loadPartners();
      })
      .then(function () {
        renderPartnersAvatars();
        return refresh();
      })
      .catch(function (e) {
        toast("Erro ao iniciar: " + (e.message || String(e)), "err");
        root.innerHTML = '<div style="padding:16px">Falha ao iniciar. Veja console.</div>';
      });
  }

  boot();
})();
