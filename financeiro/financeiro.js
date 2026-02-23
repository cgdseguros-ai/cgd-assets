/* financeiro.js — CGD Financeiro (Bitrix via Worker)
   - LOTE full screen (despesas e receitas separados)
   - Import CSV via UPLOAD (somente RECEITAS: Favorecido, Valor, Data)
   - Export CSV (somente RECEITAS: Favorecido, Valor, Data)
   - Saldo por Centro de Custo (saldo inicial manual + ajustes)
   - Transferência entre Centros de Custo (ledger local)
   - Modal Cartão de Crédito (compras/parcelas) usando CONTA = UF_CRM_1770770758
   - Lembretes na Pipeline 17, coluna MANUELA (C17:PREPARATION), atribuído ao user 813
     com recorrência (avulso/semanal/mensal/anual) e N ocorrências
   - Campos opcionais em lote: CONTA, OBS, VALOR (pode lançar zerado e preencher depois)
*/
(function () {
  "use strict";

  // =========================
  // CONFIG (ajuste só aqui)
  // =========================
  var WORKER_BASE = "https://financeiro199702.cgdseguros.workers.dev";
  var API_BASE = WORKER_BASE.replace(/\/$/, "") + "/api";

  var CFG = {
    // Pipeline financeira
    DEAL_CATEGORY_ID: 27,

    // Pipeline lembretes / follow-up
    REMINDER_CATEGORY_ID: 17,
    REMINDER_STAGE_ID: "C17:PREPARATION", // MANUELA
    REMINDER_ASSIGNED_ID: 813,            // user 813

    // Logo e footer
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

    // Campos Bitrix
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
      CONTA: "UF_CRM_1770770758",          // ✅ cartões / contas
      CENTRO_CUSTO: "UF_CRM_1771801157"
    },

    // Stages pipeline 27
    STAGES: {
      DESP_A_PAGAR: "C27:NEW",
      DESP_PAGA: "C27:PREPARATION",
      REC_A_RECEBER: "C27:UC_EQAFD7",
      REC_RECEBIDA: "C27:PREPAYMENT_INVOIC",
      CANCELADO: "C27:EXECUTING",
      CONCLUIDO: "C27:UC_LP2NSK"
    },

    PAGE_SIZE: 300,

    // storage keys (apenas reserve + CC ledger/balances continuam locais)
    LS: {
      RESERVE: "FIN_RESERVE_BALANCE",
      CC_BALANCES: "FIN_CC_BALANCES_V1",
      CC_LEDGER: "FIN_CC_LEDGER_V1"
    }
  };

  // =========================
  // Root
  // =========================
  var root = document.getElementById("fin-root") || document.body;

  // =========================
  // Utils
  // =========================
  function esc(s) {
    s = String(s == null ? "" : s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function parseJson(t) { try { return JSON.parse(t); } catch (_) { return null; } }
  function el(q) { return root.querySelector(q); }

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
    var m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m2) {
      var dd = String(m2[1]).padStart(2, "0");
      var mm = String(m2[2]).padStart(2, "0");
      return m2[3] + "-" + mm + "-" + dd;
    }
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
    var mo = (forceMonth != null) ? (Math.max(1, Math.min(12, Number(forceMonth) || 1)) - 1) : (Number(m[2]) - 1);
    var da = (forceDay != null) ? Math.max(1, Math.min(31, Number(forceDay) || 1)) : Number(m[3]);

    var d = new Date(y, mo, da);
    if (d.getMonth() !== mo) d = new Date(y, mo + 1, 0);
    var yy = d.getFullYear();
    var mm = String(d.getMonth() + 1); if (mm.length < 2) mm = "0" + mm;
    var dd = String(d.getDate()); if (dd.length < 2) dd = "0" + dd;
    return yy + "-" + mm + "-" + dd;
  }

  function safeClosest(node, sel) {
    try { return node && node.closest ? node.closest(sel) : null; } catch (_) { return null; }
  }

  // =========================
  // Toast / Modal
  // =========================
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
    }, 3800);
  }

  function modal(html, opts) {
    opts = opts || {};
    var wrap = document.createElement("div");
    wrap.className = "fin-modal-wrap";
    wrap.innerHTML =
      '<div class="fin-modal-backdrop" data-close="1"></div>' +
      '<div class="fin-modal ' + (opts.full ? "fin-modal--full" : "") + '">' + html + "</div>";
    document.body.appendChild(wrap);

    wrap.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-close") === "1") {
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    });

    function onKey(ev) {
      if (ev.key === "Escape") {
        try { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (_) {}
        document.removeEventListener("keydown", onKey);
      }
    }
    document.addEventListener("keydown", onKey);

    return {
      node: wrap,
      close: function () {
        document.removeEventListener("keydown", onKey);
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      },
      q: function (s) { return wrap.querySelector(s); }
    };
  }

  // =========================
  // Loading lock
  // =========================
  function setLoading(v) {
    S.loading = !!v;
    var badge = el("#fin-loading");
    if (badge) badge.style.display = S.loading ? "inline-flex" : "none";
    var btns = root.querySelectorAll("[data-busylock='1']");
    for (var i = 0; i < btns.length; i++) btns[i].disabled = S.loading;
  }

  // =========================
  // API (Bitrix via Worker)
  // =========================
  function apiCall(method, payload) {
    var body = JSON.stringify(payload || {});
    var headers = { "content-type": "application/json" };

    function req(url) {
      return fetch(url, { method: "POST", headers: headers, body: body })
        .then(function (r) {
          return r.text().then(function (txt) {
            var j = parseJson(txt);
            if (!r.ok) throw new Error((j && (j.error_description || j.error)) || txt || ("HTTP " + r.status));
            if (j && j.error) throw new Error(j.error_description || j.error);
            return { json: j || {}, mode: (url.indexOf("?method=") > -1 ? "query" : "path") };
          });
        });
    }

    return req(API_BASE + "/" + method)
      .catch(function () { return req(API_BASE + "?method=" + encodeURIComponent(method)); })
      .then(function (res) { S.apiMode = res.mode; return res.json; });
  }

  function updateDeal(id, fields) { return apiCall("crm.deal.update", { id: String(id), fields: fields || {} }); }
  function createDeal(fields) { return apiCall("crm.deal.add", { fields: fields || {} }).then(function (r) { return r && r.result ? r.result : null; }); }
  function deleteDeal(id) { return apiCall("crm.deal.delete", { id: String(id) }); }

  // =========================
  // State
  // =========================
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
      conta: "",
      stageId: "",
      showPayables: true,
      showReceivables: true
    },

    reserve: { balance: 0 },

    cc: {
      balances: {},
      ledger: []
    }
  };

  // =========================
  // LocalStorage (somente reserva + CC)
  // =========================
  function loadReserve() {
    try {
      var raw = localStorage.getItem(CFG.LS.RESERVE);
      S.reserve.balance = raw ? Number(raw) : 0;
      if (!isFinite(S.reserve.balance)) S.reserve.balance = 0;
    } catch (_) { S.reserve.balance = 0; }
  }
  function saveReserve() {
    try { localStorage.setItem(CFG.LS.RESERVE, String(S.reserve.balance || 0)); } catch (_) {}
  }

  function loadCC() {
    try {
      var b = parseJson(localStorage.getItem(CFG.LS.CC_BALANCES) || "{}") || {};
      var l = parseJson(localStorage.getItem(CFG.LS.CC_LEDGER) || "[]") || [];
      S.cc.balances = b && typeof b === "object" ? b : {};
      S.cc.ledger = Array.isArray(l) ? l : [];
    } catch (_) {
      S.cc.balances = {};
      S.cc.ledger = [];
    }
  }
  function saveCC() {
    try { localStorage.setItem(CFG.LS.CC_BALANCES, JSON.stringify(S.cc.balances || {})); } catch (_) {}
    try { localStorage.setItem(CFG.LS.CC_LEDGER, JSON.stringify(S.cc.ledger || [])); } catch (_) {}
  }

  // =========================
  // Enums / helpers
  // =========================
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
    if (s.indexOf("QUEUE") === 0) return true;
    return false;
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

  function nextStageByCurrent(stageId) {
    stageId = String(stageId || "");
    if (stageId === CFG.STAGES.DESP_A_PAGAR) return CFG.STAGES.DESP_PAGA;
    if (stageId === CFG.STAGES.REC_A_RECEBER) return CFG.STAGES.REC_RECEBIDA;
    return "";
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
      "01": ["jan", "janeiro", "01"],
      "02": ["fev", "fevereiro", "02"],
      "03": ["mar", "março", "03"],
      "04": ["abr", "abril", "04"],
      "05": ["mai", "maio", "05"],
      "06": ["jun", "junho", "06"],
      "07": ["jul", "julho", "07"],
      "08": ["ago", "agosto", "08"],
      "09": ["set", "setembro", "09"],
      "10": ["out", "outubro", "10"],
      "11": ["nov", "novembro", "11"],
      "12": ["dez", "dezembro", "12"]
    };
    var keys = map[mm] || [mm];

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

  // =========================
  // Partners avatars
  // =========================
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

  // =========================
  // Load meta (fields + stages)
  // =========================
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

  // =========================
  // Deals list (all)
  // =========================
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

  // =========================
  // Apply filters
  // =========================
  function applyFilters() {
    var q = String(S.filters.q || "").trim().toLowerCase();

    S.filtered = (S.deals || []).filter(function (d) {
      if (isBadFav(d[CFG.F.FAVORECIDO])) return false;

      if (S.filters.centro && String(d[CFG.F.CENTRO_CUSTO] || "") !== String(S.filters.centro)) return false;
      if (S.filters.competencia && String(d[CFG.F.COMPETENCIA] || "") !== String(S.filters.competencia)) return false;
      if (S.filters.conta && String(d[CFG.F.CONTA] || "") !== String(S.filters.conta)) return false;

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
    renderSidebarCenters();
  }

  // =========================
  // Totals + CC balances
  // =========================
  function computeCCBalance(centroId) {
    centroId = String(centroId || "");
    var base = S.cc.balances[centroId] || { initial: 0, adjust: 0 };
    var initial = Number(base.initial || 0) || 0;
    var adjust = Number(base.adjust || 0) || 0;

    var realIn = 0, realOut = 0;

    for (var i = 0; i < (S.deals || []).length; i++) {
      var d = S.deals[i];
      if (String(d[CFG.F.CENTRO_CUSTO] || "") !== centroId) continue;

      var st = String(d.STAGE_ID || "");
      var vReal = Number(d[CFG.F.VALOR_REAL] || 0) || 0;

      if (st === CFG.STAGES.REC_RECEBIDA) realIn += vReal;
      if (st === CFG.STAGES.DESP_PAGA) realOut += vReal;
    }

    var tNet = 0;
    for (var j = 0; j < (S.cc.ledger || []).length; j++) {
      var t = S.cc.ledger[j] || {};
      if (String(t.from || "") === centroId) tNet -= Number(t.amount || 0) || 0;
      if (String(t.to || "") === centroId) tNet += Number(t.amount || 0) || 0;
    }

    return (initial + adjust + realIn - realOut + tNet);
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

    var ccSel = String(S.filters.centro || "");
    if (el("#cc-balance")) {
      if (!ccSel) el("#cc-balance").textContent = "—";
      else el("#cc-balance").textContent = moneyBR(computeCCBalance(ccSel));
    }

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

  // =========================
  // Sidebar centers
  // =========================
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
        applyFilters();
      });
    }
  }

  // =========================
  // Actions: pay/receive + delete
  // =========================
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
          '<div class="fin-field" style="flex:1;min-width:240px"><label>Valor pago/recebido (opcional)</label><input id="pr-val" value="' + esc(String(deal[CFG.F.VALOR_REAL] || deal[CFG.F.VALOR_PREV] || "")) + '" placeholder="Ex.: 1500,00"></div>' +
          '<div class="fin-field" style="flex:1;min-width:240px"><label>Data pagamento/recebimento</label><input id="pr-date" value="' + esc(toISODate(deal[CFG.F.DATA_REAL] || "")) + '" placeholder="YYYY-MM-DD"></div>' +
        '</div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
          '<button class="fin-btn fin-btn--primary" id="pr-save" data-busylock="1">Salvar</button>' +
        '</div>' +
      '</div>'
    );

    m.q("#pr-save").addEventListener("click", function () {
      setLoading(true);

      var v = parseMoneyBR(m.q("#pr-val").value || "");
      var dt = toISODate(m.q("#pr-date").value || "");
      if (!dt) {
        toast("Informe a data.", "err");
        setLoading(false);
        return;
      }

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
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
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

  // =========================
  // Reserve modal
  // =========================
  function openReserveModal() {
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Fundo de Reserva</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-field"><label>Saldo atual</label><input id="rv" value="' + esc(String(S.reserve.balance || 0).replace(".", ",")) + '" placeholder="Ex.: 5000,00"></div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
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

  // =========================
  // CC balance modal
  // =========================
  function openCCBalanceModal() {
    var ccSel = String(S.filters.centro || "");
    if (!ccSel) {
      toast("Selecione um Centro de Custo na lateral para ajustar saldo.", "err");
      return;
    }
    var base = S.cc.balances[ccSel] || { initial: 0, adjust: 0 };
    var name = enumName(CFG.F.CENTRO_CUSTO, ccSel) || ccSel;

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Saldo do Centro de Custo</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div style="font-weight:950;margin-bottom:10px">' + esc(name) + '</div>' +
        '<div class="fin-row" style="gap:10px;flex-wrap:wrap">' +
          '<div class="fin-field" style="flex:1;min-width:240px"><label>Saldo inicial (manual)</label><input id="cc-init" value="' + esc(String(base.initial || 0).replace(".", ",")) + '" placeholder="Ex.: 10000,00"></div>' +
          '<div class="fin-field" style="flex:1;min-width:240px"><label>Ajuste (diferenças)</label><input id="cc-adj" value="' + esc(String(base.adjust || 0).replace(".", ",")) + '" placeholder="Ex.: -250,00"></div>' +
        '</div>' +
        '<div class="fin-row" style="margin-top:10px">' +
          '<div class="fin-check"><span class="fin-muted">Saldo calculado agora:</span> <span class="fin-strong" id="cc-now">—</span></div>' +
        '</div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Voltar</button>' +
          '<button class="fin-btn fin-btn--primary" id="cc-save" data-busylock="1">Salvar</button>' +
        '</div>' +
      '</div>'
    );

    function updateNow() {
      var b2 = {
        initial: parseMoneyBR(m.q("#cc-init").value || ""),
        adjust: parseMoneyBR(m.q("#cc-adj").value || "")
      };
      S.cc.balances[ccSel] = b2;
      var val = computeCCBalance(ccSel);
      m.q("#cc-now").textContent = moneyBR(val);
    }
    m.q("#cc-init").addEventListener("input", updateNow);
    m.q("#cc-adj").addEventListener("input", updateNow);
    updateNow();

    m.q("#cc-save").addEventListener("click", function () {
      saveCC();
      toast("Saldo do centro atualizado ✅");
      m.close();
      renderTotals();
    });
  }

  // =========================
  // Transfer between centers modal
  // =========================
  function openTransferModal() {
    var items = S.enums[CFG.F.CENTRO_CUSTO] || [];
    if (!items.length) {
      toast("Centro de Custo não carregou.", "err");
      return;
    }
    var ccOpts = buildOptions(items, true, "Selecione…");

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Transferir entre Centros de Custo</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-row" style="gap:10px;flex-wrap:wrap">' +
          '<div class="fin-field" style="flex:1;min-width:260px"><label>De</label><select id="tr-from">' + ccOpts + '</select></div>' +
          '<div class="fin-field" style="flex:1;min-width:260px"><label>Para</label><select id="tr-to">' + ccOpts + '</select></div>' +
        '</div>' +
        '<div class="fin-row" style="gap:10px;flex-wrap:wrap;margin-top:10px">' +
          '<div class="fin-field" style="flex:1;min-width:260px"><label>Valor</label><input id="tr-val" placeholder="Ex.: 1500,00"></div>' +
          '<div class="fin-field" style="flex:2;min-width:260px"><label>Obs (opcional)</label><input id="tr-note" placeholder="Ex.: ajuste caixa / repasse..."></div>' +
        '</div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Voltar</button>' +
          '<button class="fin-btn fin-btn--primary" id="tr-save" data-busylock="1">Transferir</button>' +
        '</div>' +
        '<div class="fin-muted" style="margin-top:12px;font-weight:900">Obs.: isso ajusta o saldo por centro via ledger local (não cria Deal).</div>' +
      '</div>'
    );

    m.q("#tr-save").addEventListener("click", function () {
      var from = m.q("#tr-from").value || "";
      var to = m.q("#tr-to").value || "";
      var val = parseMoneyBR(m.q("#tr-val").value || "");
      var note = String(m.q("#tr-note").value || "").trim();

      if (!from || !to || from === to) { toast("Selecione centros diferentes.", "err"); return; }
      if (!(val > 0)) { toast("Informe um valor maior que zero.", "err"); return; }

      S.cc.ledger.unshift({ ts: Date.now(), from: from, to: to, amount: val, note: note });
      saveCC();
      toast("Transferência registrada ✅");
      m.close();
      renderTotals();
    });
  }

  // =========================
  // Reminder creation (pipeline 17 / MANUELA / user 813) + recorrência
  // =========================
  function calcRecurringISO(startISO, freq, idx, weekday, monthday, month) {
    startISO = toISODate(startISO);
    if (!startISO) return "";
    freq = freq || "once";

    if (freq === "once") return startISO;

    if (freq === "weekly") {
      var wd = Number(weekday || 1); // 1..7 (seg..dom)
      var d = new Date(startISO + "T12:00:00");
      var jswd = d.getDay(); // 0..6 (dom..sab)
      var cur = (jswd === 0 ? 7 : jswd);
      var delta = wd - cur;
      if (delta < 0) delta += 7;
      var first = addDaysISO(startISO, delta);
      return addDaysISO(first, idx * 7);
    }

    if (freq === "monthly") {
      var day = Number(monthday || 1);
      return addMonthsISO(startISO, idx, day);
    }

    if (freq === "yearly") {
      var mo = Number(month || 1);
      var dayy = Number(monthday || 1);
      var baseY = String(startISO).slice(0, 4);
      var first = baseY + "-" + String(mo).padStart(2, "0") + "-" + String(dayy).padStart(2, "0");
      if (first < startISO) first = String(Number(baseY) + 1) + "-" + String(mo).padStart(2, "0") + "-" + String(dayy).padStart(2, "0");
      return addYearsISO(first, idx, mo, dayy);
    }

    return startISO;
  }

  function createReminderDeals(opts) {
    // opts: { title, note, freq, start, count, weekday, monthday, month }
    var title = String(opts.title || "LEMBRETE");
    var note = String(opts.note || "");
    var freq = String(opts.freq || "once");
    var start = toISODate(opts.start || "");
    var count = Math.max(1, parseInt(opts.count || "1", 10) || 1);
    var weekday = String(opts.weekday || "1");
    var monthday = String(opts.monthday || "1");
    var month = String(opts.month || "1");

    if (!start) throw new Error("Informe a data inicial (YYYY-MM-DD).");

    // sequencial
    var created = 0;
    var p = Promise.resolve();

    for (var i = 0; i < count; i++) (function (idx) {
      p = p.then(function () {
        var dt = calcRecurringISO(start, freq, idx, weekday, monthday, month);
        if (!dt) return;

        var fields = {};
        fields.TITLE = title + (count > 1 ? (" • " + (idx + 1) + "/" + count) : "");
        fields.CATEGORY_ID = String(CFG.REMINDER_CATEGORY_ID);
        fields.STAGE_ID = String(CFG.REMINDER_STAGE_ID);
        fields.ASSIGNED_BY_ID = String(CFG.REMINDER_ASSIGNED_ID);

        // coloca a data do lembrete no COMMENTS + também tenta usar BEGINDATE se existir? (sem depender)
        fields.COMMENTS = "📌 Data: " + dt + "\n" + note;

        return apiCall("crm.deal.add", { fields: fields }).then(function () { created++; });
      });
    })(i);

    return p.then(function () { return created; });
  }

  function openReminderModalFromDeal(deal) {
    var fav = String(deal[CFG.F.FAVORECIDO] || deal.TITLE || ("Deal #" + deal.ID));
    var baseTitle = "LEMBRETE • " + fav;
    var baseNote = "Criado do Financeiro.\nDeal #" + deal.ID + " — " + stageName(deal.STAGE_ID) + "\n\nObs do lançamento:\n" + String(deal[CFG.F.OBS] || "");

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Lembrete (Pipeline 17 • MANUELA • User 813)</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +

        '<div class="fin-row" style="gap:10px;flex-wrap:wrap">' +
          '<div class="fin-field" style="flex:2;min-width:260px"><label>Título</label><input id="rm-title" value="' + esc(baseTitle) + '"></div>' +
          '<div class="fin-field" style="flex:1;min-width:220px"><label>Data inicial</label><input id="rm-start" value="' + esc(toISODate(deal[CFG.F.DATA_PREV] || "")) + '" placeholder="YYYY-MM-DD"></div>' +
        '</div>' +

        '<div class="fin-row" style="gap:10px;flex-wrap:wrap;margin-top:10px">' +
          '<div class="fin-field" style="flex:1;min-width:220px"><label>Recorrência</label>' +
            '<select id="rm-freq">' +
              '<option value="once">Avulso</option>' +
              '<option value="weekly">Semanal</option>' +
              '<option value="monthly">Mensal</option>' +
              '<option value="yearly">Anual</option>' +
            '</select>' +
          '</div>' +
          '<div class="fin-field" style="flex:1;min-width:160px"><label>Qtd</label><input id="rm-count" value="1" placeholder="1"></div>' +
          '<div class="fin-field" style="flex:1;min-width:200px"><label>Dia semana (semanal)</label>' +
            '<select id="rm-weekday">' +
              '<option value="1">Seg</option><option value="2">Ter</option><option value="3">Qua</option><option value="4">Qui</option><option value="5">Sex</option><option value="6">Sáb</option><option value="7">Dom</option>' +
            '</select>' +
          '</div>' +
        '</div>' +

        '<div class="fin-row" style="gap:10px;flex-wrap:wrap;margin-top:10px">' +
          '<div class="fin-field" style="flex:1;min-width:200px"><label>Dia do mês (mensal/anual)</label><input id="rm-monthday" value="1" placeholder="1..31"></div>' +
          '<div class="fin-field" style="flex:1;min-width:200px"><label>Mês (anual)</label><input id="rm-month" value="1" placeholder="1..12"></div>' +
        '</div>' +

        '<div class="fin-field" style="margin-top:10px"><label>Observação</label><textarea id="rm-note">' + esc(baseNote) + '</textarea></div>' +

        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Voltar</button>' +
          '<button class="fin-btn fin-btn--primary" id="rm-save" data-busylock="1">Criar lembrete</button>' +
        '</div>' +

        '<div class="fin-muted" style="margin-top:10px;font-weight:900">Cria 1 ou N cards na Pipeline 17, etapa MANUELA, atribuído à user 813. A data é registrada no COMMENTS.</div>' +
      '</div>',
      { full: true } // ✅ full screen também
    );

    function toggleByFreq() {
      var f = m.q("#rm-freq").value || "once";
      var wd = m.q("#rm-weekday");
      var md = m.q("#rm-monthday");
      var mo = m.q("#rm-month");
      wd.disabled = (f !== "weekly");
      md.disabled = !(f === "monthly" || f === "yearly");
      mo.disabled = (f !== "yearly");
    }
    m.q("#rm-freq").addEventListener("change", toggleByFreq);
    toggleByFreq();

    m.q("#rm-save").addEventListener("click", function () {
      try {
        setLoading(true);

        var opts = {
          title: m.q("#rm-title").value || baseTitle,
          note: m.q("#rm-note").value || "",
          freq: m.q("#rm-freq").value || "once",
          start: m.q("#rm-start").value || "",
          count: m.q("#rm-count").value || "1",
          weekday: m.q("#rm-weekday").value || "1",
          monthday: m.q("#rm-monthday").value || "1",
          month: m.q("#rm-month").value || "1"
        };

        createReminderDeals(opts)
          .then(function (created) {
            toast("Lembrete(s) criado(s) ✅ (" + created + ")", "ok");
            m.close();
          })
          .catch(function (e) {
            toast("Falha lembrete: " + (e.message || String(e)), "err");
          })
          .finally(function () { setLoading(false); });

      } catch (e0) {
        toast("Falha lembrete: " + (e0.message || String(e0)), "err");
        setLoading(false);
      }
    });
  }

  // =========================
  // CSV (Receitas) + UPLOAD import
  // =========================
  function parseCSV(text) {
    var t = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var lines = t.split("\n").filter(function (l) { return l.trim() !== ""; });
    if (!lines.length) return [];

    var sep = (lines[0].indexOf(";") > -1) ? ";" : ",";
    function split(line) {
      var out = [];
      var cur = "";
      var inQ = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line.charAt(i);
        if (ch === '"') {
          if (inQ && line.charAt(i + 1) === '"') { cur += '"'; i++; }
          else inQ = !inQ;
          continue;
        }
        if (!inQ && ch === sep) {
          out.push(cur);
          cur = "";
          continue;
        }
        cur += ch;
      }
      out.push(cur);
      return out.map(function (s) { return String(s || "").trim(); });
    }

    var header = split(lines[0]).map(function (h) { return h.toLowerCase(); });
    var idxFav = header.indexOf("favorecido");
    var idxVal = header.indexOf("valor");
    var idxDat = header.indexOf("data");

    var startRow = 1;
    if (idxFav < 0 || idxVal < 0 || idxDat < 0) {
      idxFav = 0; idxVal = 1; idxDat = 2;
      startRow = 0;
    }

    var rows = [];
    for (var r = startRow; r < lines.length; r++) {
      var cols = split(lines[r]);
      if (!cols.length) continue;
      rows.push({
        favorecido: cols[idxFav] || "",
        valor: cols[idxVal] || "",
        data: cols[idxDat] || ""
      });
    }
    return rows;
  }

  function downloadCSV(filename, rows) {
    var csv = rows.map(function (r) {
      return '"' + String(r.favorecido || "").replace(/"/g, '""') + '";' +
             '"' + String(r.valor || "").replace(/"/g, '""') + '";' +
             '"' + String(r.data || "").replace(/"/g, '""') + '"';
    }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(a.href); } catch (_) {}
      try { document.body.removeChild(a); } catch (_) {}
    }, 300);
  }

  function exportReceitasCSV() {
    var rows = [];
    for (var i = 0; i < (S.deals || []).length; i++) {
      var d = S.deals[i];
      var st = String(d.STAGE_ID || "");
      var isRec = (st === CFG.STAGES.REC_A_RECEBER || st === CFG.STAGES.REC_RECEBIDA);
      if (!isRec) continue;
      if (isBadFav(d[CFG.F.FAVORECIDO])) continue;

      var fav = String(d[CFG.F.FAVORECIDO] || "").trim();
      if (!fav) continue;

      var val = Number(d[CFG.F.VALOR_REAL] || 0) || Number(d[CFG.F.VALOR_PREV] || 0) || 0;
      var dat = toISODate(d[CFG.F.DATA_REAL] || d[CFG.F.DATA_PREV] || "");

      rows.push({ favorecido: fav, valor: String(val).replace(".", ","), data: dat });
    }

    downloadCSV("receitas.csv", rows);
  }

  function openImportCSVModal(onDone) {
    // ✅ FULL + UPLOAD
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">IMPORTAR CSV — RECEITAS</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-muted" style="font-weight:900;margin-bottom:10px">Formato: <b>Favorecido;Valor;Data</b> (com ou sem cabeçalho).</div>' +

        '<div class="fin-row" style="gap:10px;flex-wrap:wrap">' +
          '<div class="fin-field" style="flex:2;min-width:260px">' +
            '<label>Arquivo CSV</label>' +
            '<input id="csvfile" type="file" accept=".csv,text/csv" />' +
          '</div>' +
          '<div class="fin-field" style="flex:1;min-width:200px">' +
            '<label>Linhas detectadas</label>' +
            '<input id="csvcount" value="0" disabled />' +
          '</div>' +
        '</div>' +

        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Voltar</button>' +
          '<button class="fin-btn fin-btn--primary" id="csvok" data-busylock="1" disabled>Importar</button>' +
        '</div>' +

        '<div class="fin-muted" style="margin-top:10px;font-weight:900">O arquivo não é salvo. Só lemos e preenchemos as linhas.</div>' +
      '</div>',
      { full: true }
    );

    var parsed = [];

    function setCount(n) {
      try { m.q("#csvcount").value = String(n || 0); } catch (_) {}
      try { m.q("#csvok").disabled = !(n > 0); } catch (_) {}
    }

    m.q("#csvfile").addEventListener("change", function () {
      var f = (m.q("#csvfile").files || [])[0];
      if (!f) { parsed = []; setCount(0); return; }

      var reader = new FileReader();
      reader.onload = function () {
        try {
          var txt = String(reader.result || "");
          parsed = parseCSV(txt);
          setCount(parsed.length);
          if (!parsed.length) toast("CSV vazio ou inválido.", "err");
        } catch (e) {
          parsed = [];
          setCount(0);
          toast("Falha ao ler CSV: " + (e.message || String(e)), "err");
        }
      };
      reader.onerror = function () {
        parsed = [];
        setCount(0);
        toast("Falha ao ler o arquivo.", "err");
      };
      reader.readAsText(f, "utf-8");
    });

    m.q("#csvok").addEventListener("click", function () {
      if (!parsed.length) { toast("CSV vazio ou inválido.", "err"); return; }
      m.close();
      try { onDone(parsed); } catch (_) {}
    });
  }

  // =========================
  // Batch modal (full screen) — DESPESAS / RECEITAS separados
  // =========================
  function openBatch(kind) {
    kind = (kind === "RECEITA") ? "RECEITA" : "DESPESA";

    var rows = [];
    for (var i = 0; i < 15; i++) rows.push(mkRow(kind));

    function mkRow(kind0) {
      return {
        centro: "",
        conta: "",
        categoria: "",
        favorecido: "",
        valor: "",
        obs: "",
        kind: kind0,
        freq: "once",   // once | weekly | monthly | yearly
        start: "",
        count: "1",
        weekday: "1",
        monthday: "1",
        month: "1"
      };
    }

    function calcDate(baseISO, row, idx) {
      return calcRecurringISO(baseISO, row.freq, idx, row.weekday, row.monthday, row.month);
    }

    function renderTable(host) {
      var ccOpts = buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—");
      var contaOpts = buildOptions(S.enums[CFG.F.CONTA] || [], true, "— (opcional)");
      var catOpts = buildOptions(S.enums[CFG.F.CATEGORIA] || [], true, "—");

      var title = (kind === "RECEITA") ? "LOTE — RECEITAS" : "LOTE — DESPESAS";

      var html =
        '<div class="fin-row" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font-weight:950;font-size:14px">' + esc(title) + '</div>' +
            '<div class="fin-muted" style="margin-top:4px;font-weight:900">' +
              'Campos opcionais em lote: <b>CONTA</b>, <b>OBS</b>, <b>VALOR</b> (pode deixar em branco e preencher na hora de pagar/receber).' +
              '<br>Competência é opcional: se vazio, tentamos derivar pela Data inicial.' +
            '</div>' +
          '</div>' +
          '<div class="fin-row" style="gap:8px;flex-wrap:wrap">' +
            '<button class="fin-btn" id="b-export-rec" ' + (kind === "RECEITA" ? "" : 'style="display:none"') + '>EXPORTAR CSV (RECEITAS)</button>' +
            '<button class="fin-btn" id="b-import-rec" ' + (kind === "RECEITA" ? "" : 'style="display:none"') + '>IMPORTAR CSV (RECEITAS)</button>' +
            '<button class="fin-btn" data-close="1">Voltar</button>' +
          '</div>' +
        '</div>' +

        '<div style="overflow:auto;max-height:75vh;margin-top:10px">' +
          '<table class="fin-batch-table">' +
            '<thead><tr>' +
              '<th style="min-width:120px">CENTRO</th>' +
              '<th style="min-width:160px">CONTA (opc.)</th>' +
              '<th style="min-width:160px">CATEGORIA</th>' +
              '<th style="min-width:220px">FAVORECIDO</th>' +
              '<th style="min-width:120px">VALOR (opc.)</th>' +
              '<th style="min-width:260px">OBS (opc.)</th>' +
              '<th style="min-width:140px">RECORRÊNCIA</th>' +
              '<th style="min-width:110px">DIA SEM</th>' +
              '<th style="min-width:110px">DIA MÊS</th>' +
              '<th style="min-width:110px">MÊS</th>' +
              '<th style="min-width:160px">DATA INICIAL</th>' +
              '<th style="min-width:90px">QTD</th>' +
              '<th style="min-width:110px"></th>' +
            '</tr></thead><tbody>';

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var showWeek = (r.freq === "weekly");
        var showMonthDay = (r.freq === "monthly" || r.freq === "yearly");
        var showMonth = (r.freq === "yearly");

        html += '<tr data-i="' + i + '">' +
          '<td><select class="fin-batch-sel" data-k="centro">' + ccOpts + '</select></td>' +
          '<td><select class="fin-batch-sel" data-k="conta">' + contaOpts + '</select></td>' +
          '<td><select class="fin-batch-sel" data-k="categoria">' + catOpts + '</select></td>' +
          '<td><input class="fin-batch-inp" data-k="favorecido" value="' + esc(r.favorecido) + '" placeholder="Ex.: Light, Cliente..."></td>' +
          '<td><input class="fin-batch-inp" data-k="valor" value="' + esc(r.valor) + '" placeholder="1500,00"></td>' +
          '<td><textarea class="fin-batch-txt" data-k="obs" placeholder="Observações...">' + esc(r.obs) + '</textarea></td>' +

          '<td>' +
            '<select class="fin-batch-sel" data-k="freq">' +
              '<option value="once" ' + (r.freq === "once" ? "selected" : "") + '>Avulsa</option>' +
              '<option value="weekly" ' + (r.freq === "weekly" ? "selected" : "") + '>Semanal</option>' +
              '<option value="monthly" ' + (r.freq === "monthly" ? "selected" : "") + '>Mensal</option>' +
              '<option value="yearly" ' + (r.freq === "yearly" ? "selected" : "") + '>Anual</option>' +
            '</select>' +
          '</td>' +

          '<td>' +
            '<select class="fin-batch-sel" data-k="weekday" ' + (showWeek ? "" : "disabled") + ">" +
              '<option value="1" ' + (r.weekday === "1" ? "selected" : "") + '>Seg</option>' +
              '<option value="2" ' + (r.weekday === "2" ? "selected" : "") + '>Ter</option>' +
              '<option value="3" ' + (r.weekday === "3" ? "selected" : "") + '>Qua</option>' +
              '<option value="4" ' + (r.weekday === "4" ? "selected" : "") + '>Qui</option>' +
              '<option value="5" ' + (r.weekday === "5" ? "selected" : "") + '>Sex</option>' +
              '<option value="6" ' + (r.weekday === "6" ? "selected" : "") + '>Sáb</option>' +
              '<option value="7" ' + (r.weekday === "7" ? "selected" : "") + '>Dom</option>' +
            '</select>' +
          '</td>' +

          '<td><input class="fin-batch-inp" data-k="monthday" value="' + esc(r.monthday) + '" ' + (showMonthDay ? "" : "disabled") + ' placeholder="1..31"></td>' +
          '<td><input class="fin-batch-inp" data-k="month" value="' + esc(r.month) + '" ' + (showMonth ? "" : "disabled") + ' placeholder="1..12"></td>' +

          '<td><input class="fin-batch-inp" data-k="start" value="' + esc(r.start) + '" placeholder="YYYY-MM-DD"></td>' +
          '<td><input class="fin-batch-inp" data-k="count" value="' + esc(r.count) + '" placeholder="1"></td>' +

          '<td><button class="fin-btn fin-btn--danger" data-del="1" style="width:100%">Remover</button></td>' +
        '</tr>';
      }

      html += '</tbody></table></div>' +
        '<div class="fin-row" style="margin-top:10px;justify-content:space-between;flex-wrap:wrap">' +
          '<div class="fin-row" style="gap:8px;flex-wrap:wrap">' +
            '<button class="fin-btn" id="b-add">+ Linha</button>' +
            '<button class="fin-btn" id="b-clean">Limpar linhas vazias</button>' +
          '</div>' +
          '<div class="fin-row fin-row--right" style="gap:8px;flex-wrap:wrap">' +
            '<div class="fin-field" style="min-width:320px"><label>Competência (opc.)</label><select id="b-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || [], true, "Automático") + '</select></div>' +
            '<button class="fin-btn fin-btn--primary" id="b-create" data-busylock="1">Criar</button>' +
          '</div>' +
        '</div>';

      host.innerHTML = html;

      var trs = host.querySelectorAll("tr[data-i]");
      for (var ti = 0; ti < trs.length; ti++) {
        var idx = Number(trs[ti].getAttribute("data-i"));
        if (!isFinite(idx)) continue;
        var r2 = rows[idx];
        var s1 = trs[ti].querySelector('select[data-k="centro"]'); if (s1) s1.value = r2.centro || "";
        var s2 = trs[ti].querySelector('select[data-k="conta"]'); if (s2) s2.value = r2.conta || "";
        var s3 = trs[ti].querySelector('select[data-k="categoria"]'); if (s3) s3.value = r2.categoria || "";
      }

      host.querySelector("#b-add").addEventListener("click", function () {
        rows.push(mkRow(kind));
        renderTable(host);
      });

      host.querySelector("#b-clean").addEventListener("click", function () {
        rows = rows.filter(function (r) {
          return String(r.favorecido || "").trim() || String(r.start || "").trim() || String(r.valor || "").trim() || String(r.obs || "").trim();
        });
        if (!rows.length) {
          for (var i2 = 0; i2 < 15; i2++) rows.push(mkRow(kind));
        }
        renderTable(host);
      });

      host.querySelector("#b-create").addEventListener("click", function () {
        createBatch(host.querySelector("#b-comp").value || "");
      });

      var btnExp = host.querySelector("#b-export-rec");
      if (btnExp) btnExp.addEventListener("click", function(){ exportReceitasCSV(); });

      var btnImp = host.querySelector("#b-import-rec");
      if (btnImp) btnImp.addEventListener("click", function(){
        openImportCSVModal(function(importRows){
          for (var i3 = 0; i3 < importRows.length && i3 < rows.length; i3++) {
            rows[i3].favorecido = importRows[i3].favorecido || "";
            rows[i3].valor = importRows[i3].valor || "";
            rows[i3].start = toISODate(importRows[i3].data || "");
            rows[i3].freq = "once";
            rows[i3].count = "1";
          }
          renderTable(host);
          toast("CSV importado ✅ (preencheu as linhas)");
        });
      });

      var tbody = host.querySelector("tbody");

      tbody.addEventListener("input", function (e) {
        var tr = safeClosest(e.target, "tr[data-i]");
        if (!tr) return;
        var i = Number(tr.getAttribute("data-i"));
        var k = e.target.getAttribute("data-k");
        if (!k) return;
        rows[i][k] = e.target.value;
      });

      tbody.addEventListener("change", function (e) {
        var tr = safeClosest(e.target, "tr[data-i]");
        if (!tr) return;
        var i = Number(tr.getAttribute("data-i"));
        var k = e.target.getAttribute("data-k");
        if (!k) return;
        rows[i][k] = e.target.value;
        if (k === "freq") renderTable(host);
      });

      tbody.addEventListener("click", function (e) {
        var btn = safeClosest(e.target, "[data-del]");
        if (!btn) return;
        var tr = safeClosest(btn, "tr[data-i]");
        var i = Number(tr.getAttribute("data-i"));
        rows.splice(i, 1);
        if (!rows.length) {
          for (var z = 0; z < 15; z++) rows.push(mkRow(kind));
        }
        renderTable(host);
      });
    }

    function createBatch(compOverride) {
      setLoading(true);

      var created = 0;
      var tipoEnum = tipoEnumForKind(kind);
      if (!tipoEnum) {
        toast("Não encontrei enum de Tipo Financeiro para " + kind + ".", "err");
        setLoading(false);
        return;
      }

      var ops = Promise.resolve();

      for (var i = 0; i < rows.length; i++) (function (r) {
        ops = ops.then(function () {
          var fav = String(r.favorecido || "").trim();
          if (!fav) return;
          if (isBadFav(fav)) throw new Error("Favorecido inválido (FILA/QUEUE): " + fav);

          var start = toISODate(r.start || "");
          if (!start) throw new Error("Linha com Favorecido sem Data inicial (YYYY-MM-DD). Fav: " + fav);

          var vprev = parseMoneyBR(r.valor || "");
          var cc = r.centro || "";
          var conta = r.conta || "";
          var cat = r.categoria || "";
          var obs = String(r.obs || "").trim();

          var stage = stageForKind(kind);
          var count = Math.max(1, parseInt(r.count || "1", 10) || 1);

          var comp = compOverride || "";
          if (!comp) comp = guessCompetenciaIdFromISO(start);

          var p = Promise.resolve();
          for (var k = 0; k < count; k++) (function (idx) {
            p = p.then(function () {
              var dt = calcDate(start, r, idx);

              var fields = {};
              fields.TITLE = "FIN • " + kind + " • " + fav;
              fields.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
              fields.STAGE_ID = stage;

              fields[CFG.F.TIPO_FIN] = tipoEnum;

              if (comp) fields[CFG.F.COMPETENCIA] = comp;
              if (cc) fields[CFG.F.CENTRO_CUSTO] = cc;
              if (conta) fields[CFG.F.CONTA] = conta;
              if (cat) fields[CFG.F.CATEGORIA] = cat;

              fields[CFG.F.DATA_PREV] = dt;
              if (vprev) fields[CFG.F.VALOR_PREV] = vprev;
              fields[CFG.F.FAVORECIDO] = fav;
              if (obs) fields[CFG.F.OBS] = obs;

              return createDeal(fields).then(function () { created++; });
            });
          })(k);

          return p;
        });
      })(rows[i]);

      ops.then(function () {
        toast("Lote criado ✅ (" + created + " itens)");
        m.close();
        return refresh();
      }).catch(function (e) {
        toast("Falha no lote: " + (e.message || String(e)), "err");
      }).finally(function () {
        setLoading(false);
      });
    }

    var m = modal(
      '<div class="fin-modal-head">' +
        '<div class="fin-modal-title">' + esc(kind === "RECEITA" ? "LOTE — RECEITAS" : "LOTE — DESPESAS") + '</div>' +
        '<button class="fin-x" data-close="1">×</button>' +
      '</div>' +
      '<div class="fin-modal-body"><div id="batch-host"></div></div>',
      { full: true } // ✅ full screen
    );

    renderTable(m.q("#batch-host"));
  }

  // =========================
  // Credit card purchases modal (FULL)
  // =========================
  function openCardModal() {
    var contas = S.enums[CFG.F.CONTA] || [];
    if (!contas.length) {
      toast("Não encontrei enum de CONTA (UF_CRM_1770770758) para cartões.", "err");
      return;
    }

    var rows = [];
    for (var i = 0; i < 15; i++) rows.push({
      favorecido: "",
      valor: "",
      data: "",
      parcelas: "1",
      parcelaAtual: "1",
      centro: "",
      categoria: "",
      obs: ""
    });

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Cartão de Crédito — Lançar compras</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-row" style="gap:10px;flex-wrap:wrap">' +
          '<div class="fin-field" style="min-width:320px;flex:1"><label>Cartão (CONTA)</label><select id="cc-card">' + buildOptions(contas, true, "Selecione o cartão…") + '</select></div>' +
          '<div class="fin-field" style="min-width:320px;flex:1"><label>Competência (opc.)</label><select id="cc-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || [], true, "Automático") + '</select></div>' +
        '</div>' +
        '<div class="fin-muted" style="font-weight:900;margin-top:8px">Cria DESPESAS “A PAGAR” com CONTA=cartão e OBS indicando parcela. Valor é opcional, mas recomendado.</div>' +
        '<div style="overflow:auto;max-height:60vh;margin-top:10px">' +
          '<table class="fin-batch-table">' +
            '<thead><tr>' +
              '<th style="min-width:160px">CENTRO</th>' +
              '<th style="min-width:160px">CATEGORIA</th>' +
              '<th style="min-width:220px">FAVORECIDO</th>' +
              '<th style="min-width:120px">VALOR</th>' +
              '<th style="min-width:160px">DATA COMPRA</th>' +
              '<th style="min-width:110px">PARCELAS</th>' +
              '<th style="min-width:120px">PARC. INI</th>' +
              '<th style="min-width:220px">OBS (opc.)</th>' +
              '<th style="min-width:110px"></th>' +
            '</tr></thead><tbody id="cc-tb"></tbody>' +
          '</table>' +
        '</div>' +
        '<div class="fin-row" style="justify-content:space-between;margin-top:10px;flex-wrap:wrap">' +
          '<button class="fin-btn" id="cc-add">+ Linha</button>' +
          '<div class="fin-row fin-row--right" style="gap:8px;flex-wrap:wrap">' +
            '<button class="fin-btn" data-close="1">Voltar</button>' +
            '<button class="fin-btn fin-btn--primary" id="cc-save" data-busylock="1">Criar compras</button>' +
          '</div>' +
        '</div>' +
      '</div>',
      { full: true } // ✅ full screen
    );

    function renderRows() {
      var ccOpts = buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—");
      var catOpts = buildOptions(S.enums[CFG.F.CATEGORIA] || [], true, "—");
      var tb = m.q("#cc-tb");
      var html = "";
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        html += '<tr data-i="' + i + '">' +
          '<td><select class="fin-batch-sel" data-k="centro">' + ccOpts + '</select></td>' +
          '<td><select class="fin-batch-sel" data-k="categoria">' + catOpts + '</select></td>' +
          '<td><input class="fin-batch-inp" data-k="favorecido" value="' + esc(r.favorecido) + '"></td>' +
          '<td><input class="fin-batch-inp" data-k="valor" value="' + esc(r.valor) + '" placeholder="1500,00"></td>' +
          '<td><input class="fin-batch-inp" data-k="data" value="' + esc(r.data) + '" placeholder="YYYY-MM-DD"></td>' +
          '<td><input class="fin-batch-inp" data-k="parcelas" value="' + esc(r.parcelas) + '" placeholder="1"></td>' +
          '<td><input class="fin-batch-inp" data-k="parcelaAtual" value="' + esc(r.parcelaAtual) + '" placeholder="1"></td>' +
          '<td><input class="fin-batch-inp" data-k="obs" value="' + esc(r.obs) + '" placeholder="opcional"></td>' +
          '<td><button class="fin-btn fin-btn--danger" data-del="1" style="width:100%">Remover</button></td>' +
        '</tr>';
      }
      tb.innerHTML = html;

      var trs = tb.querySelectorAll("tr[data-i]");
      for (var t = 0; t < trs.length; t++) {
        var idx = Number(trs[t].getAttribute("data-i"));
        var rr = rows[idx];
        var s1 = trs[t].querySelector('select[data-k="centro"]'); if (s1) s1.value = rr.centro || "";
        var s2 = trs[t].querySelector('select[data-k="categoria"]'); if (s2) s2.value = rr.categoria || "";
      }
    }

    renderRows();

    m.q("#cc-add").addEventListener("click", function () {
      rows.push({ favorecido: "", valor: "", data: "", parcelas: "1", parcelaAtual: "1", centro: "", categoria: "", obs: "" });
      renderRows();
    });

    m.q("#cc-tb").addEventListener("input", function (e) {
      var tr = safeClosest(e.target, "tr[data-i]");
      if (!tr) return;
      var i = Number(tr.getAttribute("data-i"));
      var k = e.target.getAttribute("data-k");
      if (!k) return;
      rows[i][k] = e.target.value;
    });
    m.q("#cc-tb").addEventListener("change", function (e) {
      var tr = safeClosest(e.target, "tr[data-i]");
      if (!tr) return;
      var i = Number(tr.getAttribute("data-i"));
      var k = e.target.getAttribute("data-k");
      if (!k) return;
      rows[i][k] = e.target.value;
    });
    m.q("#cc-tb").addEventListener("click", function (e) {
      var btn = safeClosest(e.target, "[data-del]");
      if (!btn) return;
      var tr = safeClosest(btn, "tr[data-i]");
      var i = Number(tr.getAttribute("data-i"));
      rows.splice(i, 1);
      if (!rows.length) rows.push({ favorecido: "", valor: "", data: "", parcelas: "1", parcelaAtual: "1", centro: "", categoria: "", obs: "" });
      renderRows();
    });

    m.q("#cc-save").addEventListener("click", function () {
      var card = m.q("#cc-card").value || "";
      if (!card) { toast("Selecione o cartão (CONTA).", "err"); return; }

      var tipoEnum = tipoEnumForKind("DESPESA");
      if (!tipoEnum) { toast("Enum de Tipo (DESPESA) não encontrado.", "err"); return; }

      var compOverride = m.q("#cc-comp").value || "";
      var cardName = enumName(CFG.F.CONTA, card) || card;

      setLoading(true);

      var created = 0;
      var ops = Promise.resolve();

      rows.forEach(function (r) {
        ops = ops.then(function () {
          var fav = String(r.favorecido || "").trim();
          if (!fav) return;
          if (isBadFav(fav)) throw new Error("Favorecido inválido: " + fav);

          var dt0 = toISODate(r.data || "");
          if (!dt0) throw new Error("Linha sem data (YYYY-MM-DD). Fav: " + fav);

          var v = parseMoneyBR(r.valor || "");
          var parcelas = Math.max(1, parseInt(r.parcelas || "1", 10) || 1);
          var parcIni = Math.max(1, parseInt(r.parcelaAtual || "1", 10) || 1);
          if (parcIni > parcelas) parcIni = parcelas;

          var cc = r.centro || "";
          var cat = r.categoria || "";
          var obs = String(r.obs || "").trim();

          var comp = compOverride || guessCompetenciaIdFromISO(dt0);

          var p = Promise.resolve();
          for (var k = 0; k < parcelas; k++) (function (idx) {
            p = p.then(function () {
              var parc = parcIni + idx;
              if (parc > parcelas) return;

              var dt = addMonthsISO(dt0, idx, null);

              var fields = {};
              fields.TITLE = "FIN • DESPESA • " + fav + " (Cartão)";
              fields.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
              fields.STAGE_ID = CFG.STAGES.DESP_A_PAGAR;

              fields[CFG.F.TIPO_FIN] = tipoEnum;
              if (comp) fields[CFG.F.COMPETENCIA] = comp;
              if (cc) fields[CFG.F.CENTRO_CUSTO] = cc;

              // ✅ salva cartão no campo CONTA
              fields[CFG.F.CONTA] = card;

              if (cat) fields[CFG.F.CATEGORIA] = cat;

              fields[CFG.F.DATA_PREV] = dt;
              if (v) fields[CFG.F.VALOR_PREV] = v;

              fields[CFG.F.FAVORECIDO] = fav;
              var obs2 = "Cartão: " + cardName + " • Parcela " + parc + "/" + parcelas + (obs ? " • " + obs : "");
              fields[CFG.F.OBS] = obs2;

              return createDeal(fields).then(function () { created++; });
            });
          })(k);

          return p;
        });
      });

      ops.then(function () {
        toast("Compras criadas ✅ (" + created + " parcelas)");
        m.close();
        return refresh();
      }).catch(function (e) {
        toast("Falha no cartão: " + (e.message || String(e)), "err");
      }).finally(function () {
        setLoading(false);
      });
    });
  }

  // =========================
  // Table render
  // =========================
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
        ? '<button class="fin-mini fin-mini--ok" data-act="chk" data-id="' + esc(d.ID) + '">' + esc(chkLabel) + '</button>'
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
              '<button class="fin-mini" data-act="rem" data-id="' + esc(d.ID) + '">Lembrete (MANUELA)</button>' +
              '<button class="fin-mini fin-mini--danger" data-act="del" data-id="' + esc(d.ID) + '">Excluir</button>' +
            "</div>" +
          "</td>" +
        "</tr>"
      );
    }

    tb.innerHTML = rows.join("");

    tb.onclick = function (ev) {
      var t = safeClosest(ev.target, "[data-act]");
      if (!t) return;
      var id = t.getAttribute("data-id");
      var act = t.getAttribute("data-act");

      var deal = null;
      for (var x = 0; x < S.deals.length; x++) if (String(S.deals[x].ID) === String(id)) { deal = S.deals[x]; break; }
      if (!deal) return;

      if (act === "del") return confirmDelete(deal);
      if (act === "chk") return openPayReceiveModal(deal);
      if (act === "rem") return openReminderModalFromDeal(deal);
    };
  }

  // =========================
  // Render UI
  // =========================
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
            '<button class="fin-btn" id="btn-reserve" data-busylock="1">RESERVA</button>' +
            '<button class="fin-btn" id="btn-cc-balance" data-busylock="1">SALDO CENTRO</button>' +
            '<button class="fin-btn" id="btn-transfer" data-busylock="1">TRANSFERIR</button>' +
            '<button class="fin-btn" id="btn-card" data-busylock="1">CARTÃO</button>' +
            '<button class="fin-btn fin-btn--primary" id="btn-batch-d" data-busylock="1">LOTE DESPESAS</button>' +
            '<button class="fin-btn fin-btn--primary" id="btn-batch-r" data-busylock="1">LOTE RECEITAS</button>' +
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
                '<div class="fin-side-h">Centro de custo</div>' +
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
                  '<div class="fin-check" style="margin-left:auto"><span class="fin-muted">Saldo Centro:</span> <span id="cc-balance" class="fin-strong">—</span></div>' +

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
                      '<th style="width:420px">Ações</th>' +
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

    el("#btn-reserve").addEventListener("click", openReserveModal);
    el("#btn-cc-balance").addEventListener("click", openCCBalanceModal);
    el("#btn-transfer").addEventListener("click", openTransferModal);
    el("#btn-card").addEventListener("click", openCardModal);

    el("#btn-batch-d").addEventListener("click", function () { openBatch("DESPESA"); });
    el("#btn-batch-r").addEventListener("click", function () { openBatch("RECEITA"); });

    el("#btn-refresh").addEventListener("click", refresh);

    el("#f-q").addEventListener("input", function (e) { S.filters.q = e.target.value || ""; applyFilters(); });
    el("#f-comp").addEventListener("change", function () { S.filters.competencia = el("#f-comp").value || ""; applyFilters(); });
    el("#f-conta").addEventListener("change", function () { S.filters.conta = el("#f-conta").value || ""; applyFilters(); });

    el("#tog-exp").addEventListener("change", function () { S.filters.showPayables = !!el("#tog-exp").checked; applyFilters(); });
    el("#tog-rec").addEventListener("change", function () { S.filters.showReceivables = !!el("#tog-rec").checked; applyFilters(); });

    renderSidebarCenters();
    renderChartsPlaceholders();
  }

  // =========================
  // Refresh
  // =========================
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

  // =========================
  // Boot
  // =========================
  function boot() {
    loadReserve();
    loadCC();
    setLoading(true);
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
      })
      .finally(function () {
        setLoading(false);
      });
  }

  boot();
})();
