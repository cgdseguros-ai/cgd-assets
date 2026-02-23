(function () {
  "use strict";

  var WORKER_BASE = "https://financeiro199702.cgdseguros.workers.dev";
  var API_BASE = WORKER_BASE.replace(/\/$/, "") + "/api";

  var CFG = {
    DEAL_CATEGORY_ID: 27,
    REMINDER_CATEGORY_ID: 17,
    REMINDER_ASSIGNED_ID: 813,
    REMINDER_STAGE_ID: "C17:NEW", // ✅ troque aqui se a coluna da Pipeline 17 for outra

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

    // Cartões (nome + vencimento + melhor dia)
    CARDS: [
      { name: "CT ITAÚ PJ", dueDay: 2, bestDay: 21 },
      { name: "CT PORTO PF", dueDay: 10, bestDay: 4 },
      { name: "CT C6 PJ", dueDay: 15, bestDay: 9 },
      { name: "CT XP PF", dueDay: 15, bestDay: 11 },
      { name: "CT ITAÚ PF", dueDay: 21, bestDay: 13 },
      { name: "CT CORA CGD BARRA", dueDay: 23, bestDay: 17 },
      { name: "CT PORTO PJ", dueDay: 30, bestDay: 25 }
    ],

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

    PAGE_SIZE: 500,
    REL_PREFIX: "REL_P17:",
    TRF_PREFIX: "TRF:"
  };

  var root = document.getElementById("fin-root") || document.body;

  function esc(s) {
    s = String(s == null ? "" : s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function parseJson(t) { try { return JSON.parse(t); } catch (_) { return null; } }
  function el(q) { return root.querySelector(q); }

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

  function modal(html, fullscreen) {
    var wrap = document.createElement("div");
    wrap.className = "fin-modal-wrap";
    wrap.innerHTML =
      '<div class="fin-modal-backdrop" data-close="1"></div>' +
      '<div class="fin-modal">' + html + "</div>";
    document.body.appendChild(wrap);

    if (fullscreen) {
      var m = wrap.querySelector(".fin-modal");
      if (m) m.classList.add("is-fullscreen");
    }

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

    // saldo inicial/ajustes por centro: { [centroId]: number }
    centroAdjust: {},

    filters: {
      q: "",
      centro: "",
      competencia: "",
      conta: "",
      stageId: "",
      showPayables: true,
      showReceivables: true
    },

    reserve: { balance: 0 }
  };

  function loadLocal() {
    try {
      var rawR = localStorage.getItem("FIN_RESERVE_BALANCE");
      S.reserve.balance = rawR ? Number(rawR) : 0;
      if (!isFinite(S.reserve.balance)) S.reserve.balance = 0;

      var rawA = localStorage.getItem("FIN_CENTRO_ADJUST");
      S.centroAdjust = rawA ? (parseJson(rawA) || {}) : {};
      if (!S.centroAdjust || typeof S.centroAdjust !== "object") S.centroAdjust = {};
    } catch (_) {
      S.reserve.balance = 0;
      S.centroAdjust = {};
    }
  }
  function saveReserve() { try { localStorage.setItem("FIN_RESERVE_BALANCE", String(S.reserve.balance || 0)); } catch (_) {} }
  function saveCentroAdjust() { try { localStorage.setItem("FIN_CENTRO_ADJUST", JSON.stringify(S.centroAdjust || {})); } catch (_) {} }

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

  function enumIdByValue(fieldId, label) {
    var target = String(label || "").trim().toLowerCase();
    if (!target) return "";
    var list = (S.enums && S.enums[fieldId]) ? S.enums[fieldId] : [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].VALUE || "").trim().toLowerCase() === target) return String(list[i].ID);
    }
    // fallback "contains"
    for (var j = 0; j < list.length; j++) {
      var v = String(list[j].VALUE || "").trim().toLowerCase();
      if (v && target && v.indexOf(target) > -1) return String(list[j].ID);
    }
    return "";
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

  function calcSaldoCentroRealizado(centroId) {
    // Opção A: (Receitas Recebidas) - (Despesas Pagas) + ajuste manual
    var sumRec = 0;
    var sumDesp = 0;

    for (var i = 0; i < S.deals.length; i++) {
      var d = S.deals[i];
      if (String(d[CFG.F.CENTRO_CUSTO] || "") !== String(centroId || "")) continue;

      var st = String(d.STAGE_ID || "");
      var v = Number(d[CFG.F.VALOR_REAL] || 0) || 0;

      if (st === CFG.STAGES.REC_RECEBIDA) sumRec += v;
      if (st === CFG.STAGES.DESP_PAGA) sumDesp += v;
    }

    var adj = Number(S.centroAdjust[String(centroId)] || 0) || 0;
    return (sumRec - sumDesp + adj);
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

    // saldo centro (se um centro estiver selecionado)
    var c = S.filters.centro;
    if (el("#saldo-centro")) {
      if (c) el("#saldo-centro").textContent = moneyBR(calcSaldoCentroRealizado(c));
      else el("#saldo-centro").textContent = "—";
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
        // padrão: esconder CONCLUÍDO
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
    renderSaldoCentroList(); // sidebar list
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
        '<div class="fin-row fin-wrap" style="gap:10px">' +
          '<div class="fin-field" style="flex:1;min-width:240px"><label>Valor pago/recebido</label><input id="pr-val" value="' + esc(String(deal[CFG.F.VALOR_REAL] || deal[CFG.F.VALOR_PREV] || "")) + '" placeholder="Ex.: 1500,00"></div>' +
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

  /* ===== Competência opcional ===== */
  function guessCompetenciaIdFromISO(iso) {
    iso = toISODate(iso);
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    var yy = m[1], mm = m[2];

    var list = S.enums[CFG.F.COMPETENCIA] || [];
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
    var keys = map[mm] || [mm];

    for (var i = 0; i < list.length; i++) {
      var t = String(list[i].VALUE || "").toLowerCase();
      if (t.indexOf(yy) === -1) continue;
      for (var k = 0; k < keys.length; k++) {
        if (t.indexOf(keys[k]) > -1) return String(list[i].ID);
      }
    }
    return "";
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
  function stageForKind(kind) { return (kind === "RECEITA") ? CFG.STAGES.REC_A_RECEBER : CFG.STAGES.DESP_A_PAGAR; }

  function calcDate(baseISO, row, idx) {
    baseISO = toISODate(baseISO);
    if (!baseISO) return "";

    if (row.freq === "once") return baseISO;

    if (row.freq === "weekly") {
      var wd = Number(row.weekday || 1); // 1..7
      var d = new Date(baseISO + "T12:00:00");
      var jswd = d.getDay(); // 0..6 (dom..sab)
      var cur = (jswd === 0 ? 7 : jswd); // 1..7
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

  function createReminderP17(recKey, title, nextDueISO) {
    // ✅ cria “controle de recorrência” na Pipeline 17 para user 813
    // (você pode mudar os campos depois, mas aqui já cria)
    var fields = {
      TITLE: title,
      CATEGORY_ID: String(CFG.REMINDER_CATEGORY_ID),
      STAGE_ID: CFG.REMINDER_STAGE_ID,
      ASSIGNED_BY_ID: String(CFG.REMINDER_ASSIGNED_ID)
    };
    // guarda referência e próxima data no TITLE/OBS (sem depender de campo custom)
    // OBS do Deal (pipeline 17) pode ser outro campo — aqui usamos COMMENTS via "COMMENTS" se existir, ou ignora.
    fields.COMMENTS = (CFG.REL_PREFIX + recKey + " | next=" + nextDueISO);

    return createDeal(fields).catch(function(){ /* não trava o lote */ });
  }

  /* ========= CSV (receitas) ========= */
  function parseCSV(text) {
    // simples: detecta ; ou ,
    var sep = (text.indexOf(";") > -1 && text.indexOf(",") === -1) ? ";" : ",";
    var lines = text.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
    if (!lines.length) return [];
    var first = lines[0].toUpperCase();
    var hasHeader = (first.indexOf("FAVOREC")>-1 || first.indexOf("VALOR")>-1 || first.indexOf("DATA")>-1);

    var start = hasHeader ? 1 : 0;
    var out = [];
    for (var i = start; i < lines.length; i++) {
      var parts = lines[i].split(sep).map(function(x){ return x.trim(); });
      if (!parts.length) continue;
      var fav = parts[0] || "";
      var val = parts[1] || "";
      var dat = parts[2] || "";
      if (!fav) continue;
      out.push({ favorecido: fav, valor: val, data: dat });
    }
    return out;
  }

  /* ========= LOTE ========= */
  function openBatchTableModal(forceKind) {
    var rows = [ mkRow() ];

    function mkRow() {
      return {
        centro: S.filters.centro || "",
        conta: "",         // opcional
        categoria: "",
        favorecido: "",
        valor: "",         // ✅ opcional
        obs: "",           // opcional
        kind: forceKind || "DESPESA",
        freq: "once",      // once | weekly | monthly | yearly
        start: "",
        count: "1",
        weekday: "1",
        monthday: "1",
        month: "1"
      };
    }

    function renderTable(host) {
      var ccOpts = buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—");
      var contaOpts = buildOptions(S.enums[CFG.F.CONTA] || [], true, "— (opcional) —");
      var catOpts = buildOptions(S.enums[CFG.F.CATEGORIA] || [], true, "—");

      var isReceita = (forceKind === "RECEITA");

      var html =
        '<div class="fin-muted" style="margin-bottom:10px;font-weight:900">' +
          'LOTE ' + esc(forceKind || "DESPESAS/RECEITAS") + ' em modo lista/tabela.' +
          '<br><b>Obrigatório:</b> Favorecido e Data inicial. <b>Conta, Obs e Valor</b> são opcionais.' +
          '<br>Competência: opcional (se vazio, tenta derivar pela Data inicial).' +
        '</div>' +

        (isReceita ? (
          '<div class="fin-row fin-wrap" style="margin-bottom:10px; gap:10px; align-items:center">' +
            '<div class="fin-field" style="min-width:380px; flex:1">' +
              '<label>Importar CSV (FAVORECIDO, VALOR, DATA)</label>' +
              '<input type="file" id="csvFile" accept=".csv,text/csv" />' +
            '</div>' +
            '<button class="fin-btn" id="csvHelp">Formato CSV</button>' +
          '</div>'
        ) : '') +

        '<div style="overflow:auto;max-height:62vh">' +
          '<table class="fin-batch-table">' +
            '<thead><tr>' +
              '<th style="min-width:140px">CENTRO DE CUSTO</th>' +
              '<th style="min-width:160px">CONTA (opcional)</th>' +
              '<th style="min-width:140px">CATEGORIA</th>' +
              '<th style="min-width:220px">FAVORECIDO</th>' +
              '<th style="min-width:130px">VALOR (opcional)</th>' +
              '<th style="min-width:260px">OBS (opcional)</th>' +
              '<th style="min-width:140px">RECORRÊNCIA</th>' +
              '<th style="min-width:120px">DIA SEMANA</th>' +
              '<th style="min-width:110px">DIA MÊS</th>' +
              '<th style="min-width:110px">MÊS (ANUAL)</th>' +
              '<th style="min-width:140px">DATA INICIAL</th>' +
              '<th style="min-width:90px">QTD</th>' +
              '<th style="min-width:100px"></th>' +
            '</tr></thead><tbody>';

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var showWeek = (r.freq === "weekly");
        var showMonthDay = (r.freq === "monthly" || r.freq === "yearly");
        var showMonth = (r.freq === "yearly");

        html += '<tr data-i="'+i+'">' +
          '<td><select class="fin-batch-sel" data-k="centro">' + ccOpts + '</select></td>' +
          '<td><select class="fin-batch-sel" data-k="conta">' + contaOpts + '</select></td>' +
          '<td><select class="fin-batch-sel" data-k="categoria">' + catOpts + '</select></td>' +
          '<td><input class="fin-batch-inp" data-k="favorecido" value="'+esc(r.favorecido)+'" placeholder="Ex.: Light, Cliente..."></td>' +
          '<td><input class="fin-batch-inp" data-k="valor" value="'+esc(r.valor)+'" placeholder="1500,00 (opcional)"></td>' +
          '<td><textarea class="fin-batch-txt" data-k="obs" placeholder="Observações (opcional)">'+esc(r.obs)+'</textarea></td>' +

          '<td>' +
            '<select class="fin-batch-sel" data-k="freq">' +
              '<option value="once" '+(r.freq==="once"?"selected":"")+'>Avulsa</option>' +
              '<option value="weekly" '+(r.freq==="weekly"?"selected":"")+'>Semanal</option>' +
              '<option value="monthly" '+(r.freq==="monthly"?"selected":"")+'>Mensal</option>' +
              '<option value="yearly" '+(r.freq==="yearly"?"selected":"")+'>Anual</option>' +
            '</select>' +
          '</td>' +

          '<td>' +
            '<select class="fin-batch-sel" data-k="weekday" '+(showWeek?'':'disabled')+'>' +
              '<option value="1">Seg</option><option value="2">Ter</option><option value="3">Qua</option><option value="4">Qui</option>' +
              '<option value="5">Sex</option><option value="6">Sáb</option><option value="7">Dom</option>' +
            '</select>' +
          '</td>' +

          '<td><input class="fin-batch-inp" data-k="monthday" value="'+esc(r.monthday)+'" '+(showMonthDay?'':'disabled')+' placeholder="1..31"></td>' +
          '<td><input class="fin-batch-inp" data-k="month" value="'+esc(r.month)+'" '+(showMonth?'':'disabled')+' placeholder="1..12"></td>' +

          '<td><input class="fin-batch-inp" data-k="start" value="'+esc(r.start)+'" placeholder="YYYY-MM-DD"></td>' +
          '<td><input class="fin-batch-inp" data-k="count" value="'+esc(r.count)+'" placeholder="1"></td>' +
          '<td><button class="fin-btn fin-btn--danger" data-del="1" style="width:100%">Remover</button></td>' +
        '</tr>';
      }

      html += '</tbody></table></div>' +
        '<div class="fin-row fin-wrap" style="margin-top:10px;justify-content:space-between">' +
          '<button class="fin-btn" id="b-add">+ Linha</button>' +
          '<div class="fin-row fin-row--right fin-wrap" style="gap:8px">' +
            '<div class="fin-field" style="min-width:300px"><label>Competência (opcional)</label><select id="b-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || [], true, "Automático") + '</select></div>' +
            '<button class="fin-btn fin-btn--primary" id="b-create" data-busylock="1">Criar</button>' +
          '</div>' +
        '</div>';

      host.innerHTML = html;

      // preencher selects com valores atuais (após render)
      var trs = host.querySelectorAll("tr[data-i]");
      for (var ti = 0; ti < trs.length; ti++) {
        var idx = Number(trs[ti].getAttribute("data-i"));
        var r0 = rows[idx];

        function setSel(tr, k, val){
          var s = tr.querySelector('select[data-k="'+k+'"]');
          if (s) s.value = String(val||"");
        }
        setSel(trs[ti], "centro", r0.centro);
        setSel(trs[ti], "conta", r0.conta);
        setSel(trs[ti], "categoria", r0.categoria);
        setSel(trs[ti], "weekday", r0.weekday);
        // freq/others já estão em selected, mas garante:
        var f = trs[ti].querySelector('select[data-k="freq"]'); if (f) f.value = r0.freq;
      }

      host.querySelector("#b-add").addEventListener("click", function(){
        rows.push(mkRow());
        renderTable(host);
      });

      host.querySelector("#b-create").addEventListener("click", function(){
        createBatch(host.querySelector("#b-comp").value || "");
      });

      // CSV (receitas)
      if (isReceita) {
        var fInp = host.querySelector("#csvFile");
        var hBtn = host.querySelector("#csvHelp");
        if (hBtn) hBtn.addEventListener("click", function(){
          toast("CSV: FAVORECIDO,VALOR,DATA (ex.: Cliente X;1200,00;15/03/2026)", "ok");
        });
        if (fInp) {
          fInp.addEventListener("change", function(){
            var file = fInp.files && fInp.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(){
              var txt = String(reader.result || "");
              var items = parseCSV(txt);
              if (!items.length) { toast("CSV vazio ou inválido.", "err"); return; }
              rows = items.map(function(it){
                var r = mkRow();
                r.kind = "RECEITA";
                r.favorecido = it.favorecido;
                r.valor = it.valor || "";
                r.start = toISODate(it.data || "");
                return r;
              });
              renderTable(host);
              toast("CSV importado ✅ ("+rows.length+" linhas)", "ok");
            };
            reader.readAsText(file);
          });
        }
      }

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
        if (k === "freq") renderTable(host);
      });
      tbody.addEventListener("click", function(e){
        var btn = e.target.closest("[data-del]");
        if (!btn) return;
        var tr = btn.closest("tr[data-i]");
        var i = Number(tr.getAttribute("data-i"));
        rows.splice(i, 1);
        if (!rows.length) rows.push(mkRow());
        renderTable(host);
      });
    }

    function createBatch(compOverride) {
      setLoading(true);

      var ops = Promise.resolve();
      var created = 0;
      var createdRec = 0;

      for (var i = 0; i < rows.length; i++) (function(r){
        ops = ops.then(function(){
          var fav = String(r.favorecido || "").trim();
          if (!fav) throw new Error("Linha sem Favorecido.");
          if (isBadFav(fav)) throw new Error("Favorecido inválido (FILA/QUEUE): " + fav);

          var start = toISODate(r.start || "");
          if (!start) throw new Error("Linha sem Data inicial (YYYY-MM-DD ou dd/mm/aaaa).");

          // ✅ VALOR opcional
          var vprev = parseMoneyBR(r.valor || "");
          // conta/obs opcionais
          var cc = r.centro || "";
          var conta = r.conta || "";
          var cat = r.categoria || "";
          var obs = String(r.obs || "").trim();

          var kind = (forceKind === "RECEITA") ? "RECEITA" : "DESPESA";
          var tipoEnum = tipoEnumForKind(kind);
          if (!tipoEnum) throw new Error("Não achei enum de Tipo Financeiro para " + kind + ". (Precisa existir DESPESA/RECEITA no campo Tipo.)");

          var stage = stageForKind(kind);
          var count = Math.max(1, parseInt(r.count || "1", 10) || 1);

          var comp = compOverride || "";
          if (!comp) comp = guessCompetenciaIdFromISO(start);

          // se recorrente, cria “controle” na pipeline 17 (1 vez)
          var isRecurring = (r.freq !== "once");
          var recKey = "";
          if (isRecurring) {
            recKey = String(Date.now()) + "-" + Math.random().toString(16).slice(2);
          }

          var p = Promise.resolve();
          for (var k = 0; k < count; k++) (function(idx){
            p = p.then(function(){
              var dt = calcDate(start, r, idx);

              var fields = {};
              fields.TITLE = "FIN • " + kind + " • " + fav + (isRecurring ? (" • " + (idx+1)+"/"+count) : "");
              fields.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
              fields.STAGE_ID = stage;

              fields[CFG.F.TIPO_FIN] = tipoEnum;
              if (comp) fields[CFG.F.COMPETENCIA] = comp;
              if (cc) fields[CFG.F.CENTRO_CUSTO] = cc;
              if (conta) fields[CFG.F.CONTA] = conta;
              if (cat) fields[CFG.F.CATEGORIA] = cat;

              fields[CFG.F.DATA_PREV] = dt;
              fields[CFG.F.VALOR_PREV] = vprev; // 0 se vazio
              fields[CFG.F.FAVORECIDO] = fav;

              var extra = "";
              if (isRecurring) extra = (CFG.REL_PREFIX + recKey);
              var finalObs = [obs, extra].filter(Boolean).join(" | ");
              if (finalObs) fields[CFG.F.OBS] = finalObs;

              return createDeal(fields).then(function(){ created++; });
            });
          })(k);

          // cria o reminder na pipeline 17
          if (isRecurring) {
            var nextDue = calcDate(start, r, 0);
            p = p.then(function(){
              return createReminderP17(recKey, ("RECORRÊNCIA • " + kind + " • " + fav), nextDue)
                .then(function(){ createdRec++; });
            });
          }

          return p;
        });
      })(rows[i]);

      ops.then(function(){
        toast("Lote criado ✅ (" + created + " itens)" + (createdRec ? (" • " + createdRec + " lembrete(s) P17") : ""), "ok");
        m.close();
        return refresh();
      }).catch(function(e){
        toast("Falha no lote: " + (e.message || String(e)), "err");
      }).finally(function(){
        setLoading(false);
      });
    }

    var title = "LOTE — " + (forceKind === "RECEITA" ? "Receitas" : "Despesas");
    var m = modal(
      '<div class="fin-modal-head">' +
        '<div class="fin-modal-title">' + esc(title) + '</div>' +
        '<div class="fin-row" style="gap:8px">' +
          '<button class="fin-btn" id="batch-back">Voltar</button>' +
          '<button class="fin-x" data-close="1">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="fin-modal-body"><div id="batch-host"></div></div>',
      true
    );

    m.q("#batch-back").addEventListener("click", function(){ m.close(); });
    renderTable(m.q("#batch-host"));
  }

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

  function renderSaldoCentroList() {
    var host = el("#fin-saldo-centros");
    if (!host) return;

    var items = (S.enums && S.enums[CFG.F.CENTRO_CUSTO]) ? S.enums[CFG.F.CENTRO_CUSTO] : [];
    if (!items.length) { host.innerHTML = '<div class="fin-muted">Sem centros.</div>'; return; }

    var html = '<div class="fin-muted" style="font-weight:900;margin-bottom:8px">Saldo (realizado) por Centro</div>';
    html += '<div class="fin-side-list" style="max-height:220px">';
    for (var i = 0; i < items.length; i++) {
      var id = String(items[i].ID);
      var nm = String(items[i].VALUE);
      var saldo = calcSaldoCentroRealizado(id);
      html +=
        '<button class="fin-side-item" data-adj="'+esc(id)+'" style="justify-content:space-between">' +
          '<span style="display:flex;gap:10px;align-items:center"><span class="fin-dot"></span><span class="fin-side-label">'+esc(nm)+'</span></span>' +
          '<span class="fin-side-label">'+esc(moneyBR(saldo))+'</span>' +
        '</button>';
    }
    html += '</div>';
    html += '<div class="fin-muted" style="margin-top:8px">Clique em um centro para ajustar saldo inicial/manual.</div>';

    host.innerHTML = html;

    var btns = host.querySelectorAll("[data-adj]");
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener("click", function(){
        var centroId = this.getAttribute("data-adj");
        openCentroAdjustModal(centroId);
      });
    }
  }

  function openCentroAdjustModal(centroId) {
    var nome = enumName(CFG.F.CENTRO_CUSTO, centroId) || ("Centro " + centroId);
    var atual = Number(S.centroAdjust[String(centroId)] || 0) || 0;

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Ajuste manual — ' + esc(nome) + '</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-muted" style="font-weight:900;margin-bottom:10px">Esse ajuste é somado ao saldo realizado (Receitas Recebidas − Despesas Pagas).</div>' +
        '<div class="fin-field"><label>Saldo inicial / ajuste</label><input id="adjv" value="' + esc(String(atual).replace(".", ",")) + '" placeholder="Ex.: 12000,00"></div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
          '<button class="fin-btn fin-btn--primary" id="adjsave" data-busylock="1">Salvar</button>' +
        '</div>' +
      '</div>'
    );

    m.q("#adjsave").addEventListener("click", function(){
      var val = parseMoneyBR(m.q("#adjv").value || "");
      S.centroAdjust[String(centroId)] = val;
      saveCentroAdjust();
      toast("Ajuste salvo ✅");
      m.close();
      renderTotals();
      renderSaldoCentroList();
    });
  }

  /* ========= TRANSFERÊNCIA ========= */
  function openTransferModal() {
    var ccOpts = buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "— Selecione —");
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Transferir valores entre Centros</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-row fin-wrap">' +
          '<div class="fin-field" style="flex:1;min-width:260px"><label>Centro origem</label><select id="trf-from">' + ccOpts + '</select></div>' +
          '<div class="fin-field" style="flex:1;min-width:260px"><label>Centro destino</label><select id="trf-to">' + ccOpts + '</select></div>' +
        '</div>' +
        '<div class="fin-row fin-wrap" style="margin-top:10px">' +
          '<div class="fin-field" style="flex:1;min-width:200px"><label>Valor</label><input id="trf-val" placeholder="Ex.: 2500,00"></div>' +
          '<div class="fin-field" style="flex:1;min-width:200px"><label>Data</label><input id="trf-date" placeholder="YYYY-MM-DD"></div>' +
        '</div>' +
        '<div class="fin-field" style="margin-top:10px"><label>Observação (opcional)</label><input id="trf-obs" placeholder="Motivo / referência..."></div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
          '<button class="fin-btn fin-btn--primary" id="trf-ok" data-busylock="1">Transferir</button>' +
        '</div>' +
      '</div>'
    );

    m.q("#trf-ok").addEventListener("click", function(){
      var from = m.q("#trf-from").value || "";
      var to = m.q("#trf-to").value || "";
      var val = parseMoneyBR(m.q("#trf-val").value || "");
      var dt = toISODate(m.q("#trf-date").value || "");
      var obs = String(m.q("#trf-obs").value || "").trim();

      if (!from || !to) { toast("Selecione origem e destino.", "err"); return; }
      if (from === to) { toast("Origem e destino não podem ser iguais.", "err"); return; }
      if (!dt) { toast("Informe a data.", "err"); return; }

      var link = CFG.TRF_PREFIX + Date.now();

      // cria 2 deals vinculados
      setLoading(true);

      var desp = {};
      desp.TITLE = "FIN • TRANSFERÊNCIA → " + enumName(CFG.F.CENTRO_CUSTO, to);
      desp.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
      desp.STAGE_ID = CFG.STAGES.DESP_PAGA; // transferência executada já “paga”
      desp[CFG.F.TIPO_FIN] = tipoEnumForKind("DESPESA");
      desp[CFG.F.CENTRO_CUSTO] = from;
      desp[CFG.F.DATA_REAL] = dt;
      desp[CFG.F.VALOR_REAL] = val;
      desp[CFG.F.FAVORECIDO] = "TRANSFERÊNCIA";
      desp[CFG.F.OBS] = [obs, link].filter(Boolean).join(" | ");

      var rec = {};
      rec.TITLE = "FIN • TRANSFERÊNCIA ← " + enumName(CFG.F.CENTRO_CUSTO, from);
      rec.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
      rec.STAGE_ID = CFG.STAGES.REC_RECEBIDA; // recebida
      rec[CFG.F.TIPO_FIN] = tipoEnumForKind("RECEITA");
      rec[CFG.F.CENTRO_CUSTO] = to;
      rec[CFG.F.DATA_REAL] = dt;
      rec[CFG.F.VALOR_REAL] = val;
      rec[CFG.F.FAVORECIDO] = "TRANSFERÊNCIA";
      rec[CFG.F.OBS] = [obs, link].filter(Boolean).join(" | ");

      createDeal(desp)
        .then(function(){ return createDeal(rec); })
        .then(function(){
          toast("Transferência criada ✅");
          m.close();
          return refresh();
        })
        .catch(function(e){
          toast("Falha: " + (e.message || String(e)), "err");
        })
        .finally(function(){ setLoading(false); });
    });
  }

  /* ========= CARTÕES ========= */
  function openCardsModal() {
    var html = '<div class="fin-modal-head"><div class="fin-modal-title">Cartões de Crédito</div>' +
      '<div class="fin-row" style="gap:8px"><button class="fin-btn" id="cards-back">Voltar</button><button class="fin-x" data-close="1">×</button></div></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-muted" style="font-weight:900;margin-bottom:10px">Clique em um cartão para lançar compras (à vista ou parceladas).</div>' +
        '<div class="fin-side-list" id="cards-list" style="max-height:70vh"></div>' +
      '</div>';

    var m = modal(html, true);
    m.q("#cards-back").addEventListener("click", function(){ m.close(); });

    var list = m.q("#cards-list");
    var out = "";
    for (var i = 0; i < CFG.CARDS.length; i++) {
      var c = CFG.CARDS[i];
      out +=
        '<button class="fin-side-item" data-card="'+esc(c.name)+'" style="justify-content:space-between">' +
          '<span style="display:flex;gap:10px;align-items:center"><span class="fin-dot"></span><span class="fin-side-label">'+esc(c.name)+'</span></span>' +
          '<span class="fin-side-label">Venc: '+esc(String(c.dueDay).padStart(2,"0"))+' • Melhor dia: '+esc(String(c.bestDay).padStart(2,"0"))+'</span>' +
        '</button>';
    }
    list.innerHTML = out;

    var btns = list.querySelectorAll("[data-card]");
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener("click", function(){
        var name = this.getAttribute("data-card");
        m.close();
        openCardLaunchModal(name);
      });
    }
  }

  function nextCardDueDate(card, purchaseISO) {
    // regra simples (Brasil): compra até melhor dia entra na fatura do vencimento “do próximo ciclo”
    // Se compra > melhor dia, pula um ciclo.
    purchaseISO = toISODate(purchaseISO);
    var m = purchaseISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);

    var best = Number(card.bestDay || 1);
    var due = Number(card.dueDay || 1);

    // define mês do vencimento:
    // compra dia <= best => vence no mês seguinte
    // compra dia > best => vence em 2 meses
    var addM = (d <= best) ? 1 : 2;

    // cria data base no mesmo mês e ajusta
    var base = y + "-" + String(mo).padStart(2,"0") + "-" + String(d).padStart(2,"0");
    var dueISO = addMonthsISO(base, addM, due);
    return dueISO;
  }

  function openCardLaunchModal(cardName) {
    var card = null;
    for (var i = 0; i < CFG.CARDS.length; i++) if (CFG.CARDS[i].name === cardName) card = CFG.CARDS[i];
    if (!card) { toast("Cartão não encontrado.", "err"); return; }

    var ccOpts = buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "— Selecione —");
    var catOpts = buildOptions(S.enums[CFG.F.CATEGORIA] || [], true, "—");

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Lançar compra — ' + esc(card.name) + '</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-row fin-wrap">' +
          '<div class="fin-field" style="flex:1;min-width:260px"><label>Centro de custo</label><select id="c-cc">' + ccOpts + '</select></div>' +
          '<div class="fin-field" style="flex:1;min-width:260px"><label>Categoria</label><select id="c-cat">' + catOpts + '</select></div>' +
        '</div>' +
        '<div class="fin-row fin-wrap" style="margin-top:10px">' +
          '<div class="fin-field" style="flex:1;min-width:260px"><label>Favorecido</label><input id="c-fav" placeholder="Ex.: Mercado, Apple, etc"></div>' +
          '<div class="fin-field" style="flex:1;min-width:200px"><label>Valor total (opcional)</label><input id="c-val" placeholder="Ex.: 1200,00"></div>' +
        '</div>' +
        '<div class="fin-row fin-wrap" style="margin-top:10px">' +
          '<div class="fin-field" style="flex:1;min-width:220px"><label>Data da compra</label><input id="c-buy" placeholder="YYYY-MM-DD"></div>' +
          '<div class="fin-field" style="flex:1;min-width:220px"><label>Parcelas</label><input id="c-n" value="1" placeholder="1, 2, 3..."></div>' +
        '</div>' +
        '<div class="fin-field" style="margin-top:10px"><label>Observações (opcional)</label><input id="c-obs" placeholder="Ex.: NF, detalhes..."></div>' +
        '<div class="fin-muted" style="margin-top:10px;font-weight:900">Vencimento: dia ' + esc(String(card.dueDay)) + ' • Melhor dia: ' + esc(String(card.bestDay)) + '</div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
          '<button class="fin-btn fin-btn--primary" id="c-ok" data-busylock="1">Criar lançamentos</button>' +
        '</div>' +
      '</div>'
    );

    m.q("#c-ok").addEventListener("click", function(){
      var cc = m.q("#c-cc").value || "";
      var cat = m.q("#c-cat").value || "";
      var fav = String(m.q("#c-fav").value || "").trim();
      var total = parseMoneyBR(m.q("#c-val").value || "");
      var buy = toISODate(m.q("#c-buy").value || "");
      var n = Math.max(1, parseInt(m.q("#c-n").value || "1", 10) || 1);
      var obs = String(m.q("#c-obs").value || "").trim();

      if (!cc) { toast("Selecione o centro de custo.", "err"); return; }
      if (!fav) { toast("Informe o favorecido.", "err"); return; }
      if (!buy) { toast("Informe a data da compra.", "err"); return; }

      var contaId = enumIdByValue(CFG.F.CONTA, card.name); // se existir enum com o mesmo nome do cartão
      var tipoDesp = tipoEnumForKind("DESPESA");
      if (!tipoDesp) { toast("Tipo Financeiro DESPESA não encontrado.", "err"); return; }

      var firstDue = nextCardDueDate(card, buy);
      if (!firstDue) { toast("Não consegui calcular vencimento.", "err"); return; }

      var link = "CARD:" + card.name + ":" + Date.now();

      setLoading(true);

      var per = (n > 0) ? (total / n) : 0;

      var seq = Promise.resolve();
      for (var i = 0; i < n; i++) (function(idx){
        seq = seq.then(function(){
          var due = addMonthsISO(firstDue, idx, card.dueDay);

          // divide com ajuste na última parcela pra fechar centavos
          var v = per;
          if (idx === n - 1) {
            var prevSum = per * (n - 1);
            v = Math.max(0, total - prevSum);
          }

          var fields = {};
          fields.TITLE = "FIN • CARTÃO • " + card.name + " • " + fav + (n > 1 ? (" • Parc " + (idx+1) + "/" + n) : "");
          fields.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
          fields.STAGE_ID = CFG.STAGES.DESP_A_PAGAR;

          fields[CFG.F.TIPO_FIN] = tipoDesp;
          fields[CFG.F.CENTRO_CUSTO] = cc;
          if (cat) fields[CFG.F.CATEGORIA] = cat;
          if (contaId) fields[CFG.F.CONTA] = contaId;

          fields[CFG.F.DATA_PREV] = due;
          fields[CFG.F.VALOR_PREV] = v; // 0 se não informou

          fields[CFG.F.FAVORECIDO] = fav;

          var comp = guessCompetenciaIdFromISO(due);
          if (comp) fields[CFG.F.COMPETENCIA] = comp;

          var finalObs = [obs, link].filter(Boolean).join(" | ");
          if (finalObs) fields[CFG.F.OBS] = finalObs;

          return createDeal(fields);
        });
      })(i);

      seq.then(function(){
        toast("Cartão: lançamentos criados ✅ (" + n + ")", "ok");
        m.close();
        return refresh();
      }).catch(function(e){
        toast("Falha: " + (e.message || String(e)), "err");
      }).finally(function(){
        setLoading(false);
      });
    });
  }

  function renderTable() {
    var tb = el("#fin-tbody");
    if (!tb) return;

    var list = S.filtered || [];
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="12" class="fin-muted">Nenhum item encontrado.</td></tr>';
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
            '<button class="fin-btn" id="btn-cards" data-busylock="1">CARTÕES</button>' +
            '<button class="fin-btn" id="btn-transfer" data-busylock="1">TRANSFERIR</button>' +
            '<button class="fin-btn" id="btn-reserve" data-busylock="1">RESERVA</button>' +
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
              '<div class="fin-side-block" id="fin-saldo-centros"></div>' +
            '</aside>' +

            '<main>' +
              '<section class="fin-panel"><div class="fin-panel-inner">' +

                '<div class="fin-kpis">' +
                  '<div class="fin-kpi"><div class="fin-kpi-k">Total Previsto</div><div class="fin-kpi-v" id="tot-prev">—</div></div>' +
                  '<div class="fin-kpi"><div class="fin-kpi-k">Total Realizado</div><div class="fin-kpi-v" id="tot-real">—</div></div>' +
                  '<div class="fin-kpi"><div class="fin-kpi-k">Fundo de reserva</div><div class="fin-kpi-v" id="reserve-balance">—</div></div>' +
                  '<div class="fin-kpi"><div class="fin-kpi-k">Saldo do Centro (selecionado)</div><div class="fin-kpi-v" id="saldo-centro">—</div></div>' +
                '</div>' +

                '<div class="fin-filters">' +
                  '<div class="fin-field"><label>Competência</label><select id="f-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || []) + '</select></div>' +
                  '<div class="fin-field"><label>Conta</label><select id="f-conta">' + buildOptions(S.enums[CFG.F.CONTA] || [], true, "—") + '</select></div>' +
                  '<div class="fin-field"><label>Etapa</label><select id="f-stage">' +
                    '<option value="">(Padrão: sem CONCLUÍDO)</option>' +
                    '<option value="'+esc(CFG.STAGES.DESP_A_PAGAR)+'">DESPESA - A PAGAR</option>' +
                    '<option value="'+esc(CFG.STAGES.DESP_PAGA)+'">DESPESA - PAGA</option>' +
                    '<option value="'+esc(CFG.STAGES.REC_A_RECEBER)+'">RECEITA - A RECEBER</option>' +
                    '<option value="'+esc(CFG.STAGES.REC_RECEBIDA)+'">RECEITA RECEBIDA</option>' +
                    '<option value="'+esc(CFG.STAGES.CANCELADO)+'">CANCELADO</option>' +
                    '<option value="'+esc(CFG.STAGES.CONCLUIDO)+'">CONCLUÍDO</option>' +
                  '</select></div>' +

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
                    '<tbody id="fin-tbody"><tr><td colspan="12" class="fin-muted">Carregando…</td></tr></tbody>' +
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

    // handlers
    el("#btn-cards").addEventListener("click", function(){ openCardsModal(); });
    el("#btn-transfer").addEventListener("click", function(){ openTransferModal(); });
    el("#btn-reserve").addEventListener("click", function () { openReserveModal(); });

    el("#btn-batch-d").addEventListener("click", function(){ openBatchTableModal("DESPESA"); });
    el("#btn-batch-r").addEventListener("click", function(){ openBatchTableModal("RECEITA"); });

    el("#btn-refresh").addEventListener("click", function () { refresh(); });

    el("#f-q").addEventListener("input", function (e) { S.filters.q = e.target.value || ""; applyFilters(); });
    el("#f-comp").addEventListener("change", function () { S.filters.competencia = el("#f-comp").value || ""; applyFilters(); });
    el("#f-conta").addEventListener("change", function () { S.filters.conta = el("#f-conta").value || ""; applyFilters(); });
    el("#f-stage").addEventListener("change", function () { S.filters.stageId = el("#f-stage").value || ""; applyFilters(); });

    el("#tog-exp").addEventListener("change", function () { S.filters.showPayables = !!el("#tog-exp").checked; applyFilters(); });
    el("#tog-rec").addEventListener("change", function () { S.filters.showReceivables = !!el("#tog-rec").checked; applyFilters(); });

    renderSidebarCenters();
    renderChartsPlaceholders();
    renderSaldoCentroList();
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
        if (tb) tb.innerHTML = '<tr><td colspan="12" class="fin-muted">Erro: ' + esc(e.message || String(e)) + '</td></tr>';
      })
      .finally(function () { setLoading(false); });
  }

  // Promise.finally fallback
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
    loadLocal();
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
