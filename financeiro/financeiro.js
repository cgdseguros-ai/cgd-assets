/* Financeiro CGD — Pipeline 27 (Deals) — ES5 compat
   - Sidebar por Conta (UF_CRM_1770770758)
   - Oculta CONCLUÍDO por padrão (mas acessível no filtro)
   - Remove __QUEUE__/FILA ATENDIMENTO de Favorecido
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
    PAGE_SIZE: 120
  };

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
      conta: "",
      competencia: "",
      tipo: "",
      centro: "",
      statusFin: "",
      stageId: ""
    }
  };

  var root = document.getElementById("fin-root") || document.body;

  function esc(s) {
    s = String(s == null ? "" : s);
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeMsg(err) {
    try {
      if (!err) return "Erro desconhecido";
      if (err.stack) return String(err.stack);
      if (err.message) return String(err.message);
      return String(err);
    } catch (_) {
      return "Erro desconhecido";
    }
  }

  function showFatal(err) {
    var msg = safeMsg(err);
    root.innerHTML =
      '<div style="min-height:100vh;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;' +
      "background: radial-gradient(1200px 800px at 20% 20%, rgba(37,99,235,.35), transparent 60%)," +
      "radial-gradient(900px 650px at 75% 55%, rgba(22,163,74,.22), transparent 60%)," +
      "linear-gradient(180deg, #0b1020, #070a14);color:#e5e7eb;\">" +
      '<div style="max-width:1100px;margin:0 auto;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<img src="' + esc(CFG.LOGO_URL) + '" alt="CGD" style="width:44px;height:44px;border-radius:14px;background:#fff;padding:6px;object-fit:contain">' +
      "<div><div style=\"font-weight:950;font-size:16px\">Falha ao iniciar o Financeiro</div>" +
      '<div style="opacity:.85;font-weight:800;font-size:12px">Abra o Network e confirme se financeiro.js está vindo como JS (não HTML).</div></div>' +
      "</div>" +
      '<pre style="margin-top:14px;white-space:pre-wrap;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px;overflow:auto">' +
      esc(msg) +
      "</pre>" +
      "</div></div>";
  }

  window.addEventListener("error", function (e) { showFatal(e.error || e.message || e); });
  window.addEventListener("unhandledrejection", function (e) { showFatal(e.reason || e); });

  function el(q) { return root.querySelector(q); }
  function els(q) { return Array.prototype.slice.call(root.querySelectorAll(q)); }

  function nowBR() {
    var dt = new Date();
    var dd = String(dt.getDate()); if (dd.length < 2) dd = "0" + dd;
    var mo = String(dt.getMonth() + 1); if (mo.length < 2) mo = "0" + mo;
    var yy = dt.getFullYear();
    var hh = String(dt.getHours()); if (hh.length < 2) hh = "0" + hh;
    var mm = String(dt.getMinutes()); if (mm.length < 2) mm = "0" + mm;
    return dd + "/" + mo + "/" + yy + " " + hh + ":" + mm;
  }

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

  function apiCall(method, payload) {
    var body = JSON.stringify(payload || {});
    var headers = { "content-type": "application/json" };

    function parseJson(text) {
      try { return JSON.parse(text); } catch (_) { return null; }
    }

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
            return { json: j, mode: url.indexOf("?method=") > -1 ? "query" : "path" };
          });
        });
    }

    // auto: tenta /api/<method> e depois /api?method=
    var url1 = API_BASE + "/" + method;
    return req(url1).catch(function () {
      var url2 = API_BASE + "?method=" + encodeURIComponent(method);
      return req(url2);
    }).then(function (res) {
      S.apiMode = res.mode;
      return res.json || {};
    });
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

  function loadMeta() {
    return apiCall("crm.deal.fields", {}).then(function (fieldsRes) {
      var fields = fieldsRes.result || {};
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

      var raw = st.result || [];
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
          CFG.F.TIPO_FIN, CFG.F.COMPETENCIA,
          CFG.F.VALOR_PREV, CFG.F.VALOR_REAL,
          CFG.F.DATA_REAL, CFG.F.FAVORECIDO,
          CFG.F.OBS, CFG.F.CATEGORIA,
          CFG.F.DATA_PREV, CFG.F.STATUS_FIN,
          CFG.F.CONTA, CFG.F.CENTRO_CUSTO,
          CFG.F.FORMA_PGTO
        ],
        filter: { CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID), STAGE_ID: stageArr },
        order: { ID: "DESC" },
        start: start
      }).then(function (res) {
        var chunk = res.result || [];
        for (var i = 0; i < chunk.length; i++) out.push(chunk[i]);
        if (res.next == null) return out;
        start = res.next;
        if (out.length > 20000) return out;
        return loop();
      });
    }
    return loop();
  }

  function applyFilters() {
    var q = String(S.filters.q || "").trim().toLowerCase();
    var allowedStages = {};
    for (var k in CFG.STAGES) allowedStages[String(CFG.STAGES[k])] = true;

    S.filtered = (S.deals || []).filter(function (d) {
      if (!allowedStages[String(d.STAGE_ID || "")]) return false;
      if (isBadFav(d[CFG.F.FAVORECIDO])) return false;

      if (S.filters.conta && String(d[CFG.F.CONTA] || "") !== String(S.filters.conta)) return false;
      if (S.filters.competencia && String(d[CFG.F.COMPETENCIA] || "") !== String(S.filters.competencia)) return false;
      if (S.filters.tipo && String(d[CFG.F.TIPO_FIN] || "") !== String(S.filters.tipo)) return false;
      if (S.filters.centro && String(d[CFG.F.CENTRO_CUSTO] || "") !== String(S.filters.centro)) return false;
      if (S.filters.statusFin && String(d[CFG.F.STATUS_FIN] || "") !== String(S.filters.statusFin)) return false;

      if (S.filters.stageId) {
        if (String(d.STAGE_ID || "") !== String(S.filters.stageId)) return false;
      } else {
        if (String(d.STAGE_ID || "") === String(CFG.STAGES.CONCLUIDO)) return false;
      }

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
  }

  function render() {
    root.innerHTML =
      '<div class="fin-shell">' +
        '<aside class="fin-side">' +
          '<div class="fin-side-brand">' +
            '<img class="fin-brand-logo" src="' + esc(CFG.LOGO_URL) + '" alt="CGD">' +
            '<div><div class="fin-brand-title">Financeiro CGD</div><div class="fin-brand-sub">Deals • Pipeline 27</div></div>' +
          "</div>" +
          '<div class="fin-side-block">' +
            '<div class="fin-side-h">Conta / Origem</div>' +
            '<div id="fin-side-accounts" class="fin-side-list"></div>' +
          "</div>" +
          '<div class="fin-side-block fin-side-muted">' +
            '<div class="fin-side-h">Padrão</div>' +
            '<div class="fin-side-note">CONCLUÍDO fica oculto (mas aparece no filtro “Etapa”).</div>' +
          "</div>" +
        "</aside>" +
        '<main class="fin-main">' +
          '<header class="fin-topbar">' +
            '<div class="fin-top-left">' +
              '<img class="fin-top-logo" src="' + esc(CFG.LOGO_URL) + '" alt="CGD">' +
              '<div><div class="fin-top-title">Financeiro CGD</div>' +
              '<div class="fin-top-sub"><span id="fin-lastsync">—</span> <span id="fin-loading" class="fin-loading" style="display:none">Carregando…</span></div>' +
              "</div>" +
            "</div>" +
            '<div class="fin-top-actions">' +
              '<div class="fin-search"><span aria-hidden="true">🔎</span><input id="f-q" placeholder="Buscar por favorecido, categoria, obs..."></div>' +
              '<button class="fin-btn fin-btn--primary" id="btn-refresh" data-busylock="1">ATUALIZAR</button>' +
            "</div>" +
          "</header>" +

          '<section class="fin-panel"><div class="fin-panel-inner">' +
            '<div class="fin-kpis">' +
              '<div class="fin-kpi"><div class="fin-kpi-k">Total Previsto</div><div class="fin-kpi-v" id="tot-prev">—</div></div>' +
              '<div class="fin-kpi"><div class="fin-kpi-k">Total Realizado</div><div class="fin-kpi-v" id="tot-real">—</div></div>' +
              '<div class="fin-kpi"><div class="fin-kpi-k">Qtd. Itens</div><div class="fin-kpi-v" id="tot-count">—</div></div>' +
            "</div>" +

            '<div class="fin-filters">' +
              '<div class="fin-field"><label>Competência</label><select id="f-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || []) + "</select></div>" +
              '<div class="fin-field"><label>Tipo</label><select id="f-tipo">' + buildOptions(S.enums[CFG.F.TIPO_FIN] || []) + "</select></div>" +
              '<div class="fin-field"><label>Centro de custo</label><select id="f-centro">' + buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—") + "</select></div>" +
              '<div class="fin-field"><label>Status financeiro</label><select id="f-status">' + buildOptions(S.enums[CFG.F.STATUS_FIN] || [], true, "—") + "</select></div>" +
              '<div class="fin-field"><label>Etapa</label><select id="f-stage"><option value="">— Todos (exceto CONCLUÍDO) —</option>' +
                S.stages.map(function (s) { return '<option value="' + esc(s.STATUS_ID) + '">' + esc(s.NAME) + "</option>"; }).join("") +
              "</select></div>" +
            "</div>" +

            '<div class="fin-table-wrap"><table class="fin-table">' +
              "<thead><tr>" +
                '<th style="width:76px">ID</th><th>Favorecido</th><th style="width:180px">Conta</th>' +
                '<th style="width:130px">Tipo</th><th style="width:130px">Competência</th>' +
                '<th style="width:170px">Etapa</th>' +
              "</tr></thead>" +
              '<tbody id="fin-tbody"><tr><td colspan="6" class="fin-muted">Carregando…</td></tr></tbody>' +
            "</table></div>" +
            '<div id="fin-toast-host" class="fin-toast-host"></div>' +
          "</div></section>" +
        "</main>" +
      "</div>";

    el("#btn-refresh").addEventListener("click", refresh);
    el("#f-q").addEventListener("input", function (e) { S.filters.q = e.target.value || ""; applyFilters(); });
    el("#f-comp").addEventListener("change", function () { S.filters.competencia = el("#f-comp").value || ""; applyFilters(); });
    el("#f-tipo").addEventListener("change", function () { S.filters.tipo = el("#f-tipo").value || ""; applyFilters(); });
    el("#f-centro").addEventListener("change", function () { S.filters.centro = el("#f-centro").value || ""; applyFilters(); });
    el("#f-status").addEventListener("change", function () { S.filters.statusFin = el("#f-status").value || ""; applyFilters(); });
    el("#f-stage").addEventListener("change", function () { S.filters.stageId = el("#f-stage").value || ""; applyFilters(); });
  }

  function renderTable() {
    var tb = el("#fin-tbody");
    if (!tb) return;

    var list = S.filtered || [];
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6" class="fin-muted">Nenhum item encontrado.</td></tr>';
      return;
    }

    var rows = [];
    for (var i = 0; i < list.length && i < CFG.PAGE_SIZE; i++) {
      var d = list[i];
      var fav = d[CFG.F.FAVORECIDO] || d.TITLE || "";
      rows.push(
        "<tr>" +
          '<td class="fin-mono">#' + esc(d.ID) + "</td>" +
          "<td>" + esc(fav) + "</td>" +
          "<td>" + esc(enumName(CFG.F.CONTA, d[CFG.F.CONTA]) || "") + "</td>" +
          "<td>" + esc(enumName(CFG.F.TIPO_FIN, d[CFG.F.TIPO_FIN]) || "") + "</td>" +
          "<td>" + esc(enumName(CFG.F.COMPETENCIA, d[CFG.F.COMPETENCIA]) || "") + "</td>" +
          "<td>" + esc(stageName(d.STAGE_ID)) + "</td>" +
        "</tr>"
      );
    }
    tb.innerHTML = rows.join("");
  }

  function renderTotals() {
    var list = S.filtered || [];
    var prev = 0, real = 0;
    for (var i = 0; i < list.length; i++) {
      prev += Number(list[i][CFG.F.VALOR_PREV] || 0) || 0;
      real += Number(list[i][CFG.F.VALOR_REAL] || 0) || 0;
    }
    if (el("#tot-prev")) el("#tot-prev").textContent = "R$ " + prev.toFixed(2);
    if (el("#tot-real")) el("#tot-real").textContent = "R$ " + real.toFixed(2);
    if (el("#tot-count")) el("#tot-count").textContent = String(list.length);
    if (S.lastSyncAt && el("#fin-lastsync")) el("#fin-lastsync").textContent = "Atualizado em " + S.lastSyncAt + " • API: " + (S.apiMode || "?");
  }

  function refresh() {
    setLoading(true);
    return listDealsAll().then(function (deals) {
      S.deals = deals || [];
      S.lastSyncAt = nowBR();
      applyFilters();
    }).catch(function (e) {
      toast("Falha ao carregar: " + (e && e.message ? e.message : e), "err");
      var tb = el("#fin-tbody");
      if (tb) tb.innerHTML = '<tr><td colspan="6" class="fin-muted">Erro: ' + esc(e && e.message ? e.message : e) + "</td></tr>";
    }).finally(function () {
      setLoading(false);
    });
  }

  function boot() {
    // tela simples
    root.innerHTML =
      '<div class="fin-boot"><div class="fin-boot-card">' +
      '<div class="fin-boot-title">Financeiro CGD</div>' +
      '<div class="fin-boot-sub">JS iniciou ✅ (bootstrap)</div>' +
      "</div></div>";

    return loadMeta().then(function () {
      render();
      return refresh();
    });
  }

  // polyfill simples p/ finally em Promises (alguns ambientes)
  if (!Promise.prototype.finally) {
    Promise.prototype.finally = function (cb) {
      var P = this.constructor;
      return this.then(
        function (v) { return P.resolve(cb()).then(function () { return v; }); },
        function (e) { return P.resolve(cb()).then(function () { throw e; }); }
      );
    };
  }

  boot().catch(showFatal);
})();
