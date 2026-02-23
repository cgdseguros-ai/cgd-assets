/* Financeiro CGD — Pipeline 27 (Deals) — ES5 compat
   - Loader: /asset/financeiro.js e /asset/financeiro.css (via Worker)
   - API: tenta /api/<method> e fallback /api?method=<method>
   - Sidebar por Conta (UF_CRM_1770770758)
   - KPIs + filtros + tabela
   - Oculta CONCLUÍDO por padrão (mas disponível no filtro)
   - Remove __QUEUE__/FILA ATENDIMENTO no Favorecido
   - CRUD: Novo, Editar, Realizar, Cancelar (move para etapa CANCELADO)
   - CSV
   - Rodapé com fotos users 1,27,15 + endereço + créditos + CNPJ/SUSEP
*/

(function () {
  "use strict";

  // ========= CONFIG =========
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

    // Campos UF (Deals)
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

    // Etapas permitidas (Pipeline 27)
    STAGES: {
      DESP_A_PAGAR: "C27:NEW",
      DESP_PAGA: "C27:PREPARATION",
      REC_A_RECEBER: "C27:UC_EQAFD7",
      REC_RECEBIDA: "C27:PREPAYMENT_INVOIC",
      CANCELADO: "C27:EXECUTING",
      CONCLUIDO: "C27:UC_LP2NSK"
    },

    PAGE_SIZE: 200,
    CURRENCY_PREFIX: "R$ "
  };

  // ========= ROOT =========
  var root = document.getElementById("fin-root") || document.body;

  // ========= ERROR UI =========
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

  function showFatal(msg, err) {
    var pre = safeMsg(err);
    root.innerHTML =
      '<div style="min-height:100vh;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;' +
      "background: radial-gradient(1200px 800px at 20% 20%, rgba(37,99,235,.35), transparent 60%)," +
      "radial-gradient(900px 650px at 75% 55%, rgba(22,163,74,.22), transparent 60%)," +
      "linear-gradient(180deg, #0b1020, #070a14);color:#e5e7eb;\">" +
      '<div style="max-width:1100px;margin:0 auto;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<img src="' + esc(CFG.LOGO_URL) + '" alt="CGD" style="width:44px;height:44px;border-radius:14px;background:#fff;padding:6px;object-fit:contain">' +
      "<div>" +
      '<div style="font-weight:950;font-size:16px">Falha ao carregar o painel</div>' +
      '<div style="opacity:.85;font-weight:800;font-size:12px">' + esc(msg || "Erro JS") + "</div>" +
      "</div></div>" +
      '<pre style="margin-top:14px;white-space:pre-wrap;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px;overflow:auto">' +
      esc(pre) +
      "</pre>" +
      "</div></div>";
  }

  window.addEventListener("error", function (e) { showFatal("Erro JS", e.error || e.message || e); });
  window.addEventListener("unhandledrejection", function (e) { showFatal("Promise rejeitada", e.reason || e); });

  // ========= STATE =========
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
      stageId: "" // vazio => "exceto CONCLUÍDO"
    }
  };

  // ========= DOM helpers =========
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
    if (!isFinite(n)) return "";
    var fixed = n.toFixed(2);
    var parts = fixed.split(".");
    var a = parts[0];
    var b = parts[1] || "00";
    a = a.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return CFG.CURRENCY_PREFIX + a + "," + b;
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

  // ========= API =========
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
            return { json: j || {}, mode: (url.indexOf("?method=") > -1 ? "query" : "path") };
          });
        });
    }

    // auto: tenta /api/<method>, depois /api?method=<method>
    return req(API_BASE + "/" + method)
      .catch(function () { return req(API_BASE + "?method=" + encodeURIComponent(method)); })
      .then(function (res) {
        S.apiMode = res.mode;
        return res.json;
      });
  }

  // ========= ENUM HELPERS =========
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

  // ========= LOAD META =========
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

  // ========= DEALS =========
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
        var chunk = (res && res.result) ? res.result : [];
        for (var i = 0; i < chunk.length; i++) out.push(chunk[i]);
        if (res && res.next != null) {
          start = res.next;
          if (out.length > 50000) return out;
          return loop();
        }
        return out;
      });
    }

    return loop();
  }

  function updateDeal(id, fields) {
    return apiCall("crm.deal.update", { id: String(id), fields: fields || {} });
  }

  function createDeal(fields) {
    return apiCall("crm.deal.add", { fields: fields || {} }).then(function (r) {
      return r && r.result ? r.result : null;
    });
  }

  // ========= FILTERS =========
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
        // default: esconder CONCLUÍDO
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

  // ========= UI (Modal) =========
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

  function openEditModal(deal) {
    var isEdit = !!deal;

    function v(k) { return deal ? (deal[k] == null ? "" : deal[k]) : ""; }

    var m = modal(
      '<div class="fin-modal-head">' +
        '<div class="fin-modal-title">' + (isEdit ? "Editar lançamento" : "Novo lançamento") + "</div>" +
        '<button class="fin-x" data-close="1">×</button>' +
      "</div>" +
      '<div class="fin-modal-body">' +
        '<div class="fin-grid">' +

          '<div class="fin-field"><label>Tipo Financeiro</label>' +
            '<select id="m-tipo">' + buildOptions(S.enums[CFG.F.TIPO_FIN] || [], true, "Selecione...") + "</select>" +
          "</div>" +

          '<div class="fin-field"><label>Competência (mês)</label>' +
            '<select id="m-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || []) + "</select>" +
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

          '<div class="fin-field"><label>Centro de custo</label>' +
            '<select id="m-cc">' + buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—") + "</select>" +
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

    // set selected
    m.q("#m-tipo").value = String(v(CFG.F.TIPO_FIN) || "");
    m.q("#m-comp").value = String(v(CFG.F.COMPETENCIA) || "");
    m.q("#m-conta").value = String(v(CFG.F.CONTA) || "");
    m.q("#m-cc").value = String(v(CFG.F.CENTRO_CUSTO) || "");
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
        fields[CFG.F.CONTA] = m.q("#m-conta").value || "";
        fields[CFG.F.DATA_PREV] = toISODate(m.q("#m-dprev").value || "");
        fields[CFG.F.VALOR_PREV] = parseMoneyBR(m.q("#m-vprev").value || "");
        fields[CFG.F.FAVORECIDO] = String(m.q("#m-fav").value || "").trim();
        fields[CFG.F.CENTRO_CUSTO] = m.q("#m-cc").value || "";
        fields[CFG.F.CATEGORIA] = m.q("#m-cat").value || "";
        fields[CFG.F.STATUS_FIN] = m.q("#m-status").value || "";
        fields[CFG.F.FORMA_PGTO] = m.q("#m-forma").value || "";
        fields[CFG.F.OBS] = String(m.q("#m-obs").value || "").trim();

        if (isBadFav(fields[CFG.F.FAVORECIDO])) throw new Error("Favorecido inválido (parece FILA/QUEUE).");

        if (isEdit) {
          updateDeal(deal.ID, fields)
            .then(function () {
              toast("Atualizado ✅");
              m.close();
              return refresh();
            })
            .catch(function (e) { toast(e.message || String(e), "err"); })
            .finally(function () { setLoading(false); });
        } else {
          var tipoTxt = enumName(CFG.F.TIPO_FIN, tipo) || "FIN";
          var fav = fields[CFG.F.FAVORECIDO] || "";
          var st = initialStageForTipo(tipo);

          var addFields = {};
          // monta sem spread
          addFields.TITLE = "FIN • " + tipoTxt + (fav ? " • " + fav : "");
          addFields.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
          addFields.STAGE_ID = st;

          // merge fields
          for (var k in fields) if (fields.hasOwnProperty(k)) addFields[k] = fields[k];

          createDeal(addFields)
            .then(function (newId) {
              toast("Criado ✅ (ID " + newId + ")");
              m.close();
              return refresh();
            })
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
      '<div class="fin-modal-head">' +
        '<div class="fin-modal-title">Marcar como realizado</div>' +
        '<button class="fin-x" data-close="1">×</button>' +
      "</div>" +
      '<div class="fin-modal-body">' +
        '<div class="fin-grid">' +
          '<div class="fin-field"><label>Valor realizado</label>' +
            '<input id="r-val" placeholder="Ex.: 1500,00" value="' + esc(deal[CFG.F.VALOR_REAL] || deal[CFG.F.VALOR_PREV] || "") + '">' +
          "</div>" +
          '<div class="fin-field"><label>Data realizada</label>' +
            '<input id="r-date" placeholder="YYYY-MM-DD" value="' + esc(toISODate(deal[CFG.F.DATA_REAL] || "")) + '">' +
          "</div>" +
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
        .then(function () {
          toast("Realizado salvo ✅");
          m.close();
          return refresh();
        })
        .catch(function (e) { toast("Falha: " + (e.message || String(e)), "err"); })
        .finally(function () { setLoading(false); });
    });
  }

  function cancelDeal(deal) {
    var m = modal(
      '<div class="fin-modal-head">' +
        '<div class="fin-modal-title">Cancelar lançamento</div>' +
        '<button class="fin-x" data-close="1">×</button>' +
      "</div>" +
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
        .then(function () {
          toast("Cancelado ✅");
          m.close();
          return refresh();
        })
        .catch(function (e) { toast("Falha: " + (e.message || String(e)), "err"); })
        .finally(function () { setLoading(false); });
    });
  }

  // ========= CSV =========
  function exportCSV() {
    var list = S.filtered || [];
    if (!list.length) { toast("Nada para exportar.", "err"); return; }

    var rows = [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      rows.push({
        ID: d.ID,
        ETAPA: stageName(d.STAGE_ID),
        TIPO: enumName(CFG.F.TIPO_FIN, d[CFG.F.TIPO_FIN]),
        COMPETENCIA: enumName(CFG.F.COMPETENCIA, d[CFG.F.COMPETENCIA]),
        CONTA: enumName(CFG.F.CONTA, d[CFG.F.CONTA]),
        DATA_PREVISTA: toISODate(d[CFG.F.DATA_PREV] || ""),
        VALOR_PREVISTO: d[CFG.F.VALOR_PREV] != null ? d[CFG.F.VALOR_PREV] : "",
        VALOR_REALIZADO: d[CFG.F.VALOR_REAL] != null ? d[CFG.F.VALOR_REAL] : "",
        DATA_REALIZADA: toISODate(d[CFG.F.DATA_REAL] || ""),
        FAVORECIDO: d[CFG.F.FAVORECIDO] || "",
        CENTRO_CUSTO: enumName(CFG.F.CENTRO_CUSTO, d[CFG.F.CENTRO_CUSTO]),
        CATEGORIA: enumName(CFG.F.CATEGORIA, d[CFG.F.CATEGORIA]),
        STATUS_FINANCEIRO: enumName(CFG.F.STATUS_FIN, d[CFG.F.STATUS_FIN]),
        OBS: String(d[CFG.F.OBS] || "").replace(/\s+/g, " ").trim()
      });
    }

    var headers = [];
    for (var k in rows[0]) if (rows[0].hasOwnProperty(k)) headers.push(k);

    function q(s) {
      s = String(s == null ? "" : s);
      s = s.replace(/"/g, '""');
      return '"' + s + '"';
    }

    var csv = [];
    csv.push(headers.join(";"));
    for (var r = 0; r < rows.length; r++) {
      var line = [];
      for (var c = 0; c < headers.length; c++) line.push(q(rows[r][headers[c]]));
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

  // ========= AVATARS (user.get) =========
  function initialsFromName(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    var a = parts[0] ? parts[0].charAt(0) : "";
    var b = parts[1] ? parts[1].charAt(0) : "";
    var out = (a + b).toUpperCase();
    return out || "CG";
  }

  function resolveUserPhotoUrl(user) {
    // Bitrix às vezes retorna URL, às vezes ID numérico
    var raw = user && (user.PERSONAL_PHOTO_URL || user.PERSONAL_PHOTO || user.PHOTO || "");
    if (!raw) return "";
    if (typeof raw === "string" && raw.indexOf("http") === 0) return raw;
    // se vier número, não garantimos URL aqui (mantém fallback)
    return "";
  }

  function loadPartners() {
    return apiCall("user.get", { ID: CFG.FOOTER.partnersUserIds })
      .then(function (r) {
        S.partners = (r && r.result) ? r.result : [];
      })
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

      if (url) {
        html.push('<div class="fin-avatar" title="' + esc(name) + '"><img src="' + esc(url) + '" alt="' + esc(name) + '"></div>');
      } else {
        html.push('<div class="fin-avatar" title="' + esc(name) + '">' + esc(initialsFromName(name)) + "</div>");
      }
    }
    host.innerHTML = html.join("");
  }

  // ========= RENDER =========
  function renderSidebarAccounts() {
    var host = el("#fin-side-accounts");
    if (!host) return;

    var items = (S.enums && S.enums[CFG.F.CONTA]) ? S.enums[CFG.F.CONTA] : [];
    var sel = String(S.filters.conta || "");

    function btn(id, label, active) {
      return (
        '<button class="fin-side-item ' + (active ? "is-active" : "") + '" data-conta="' + esc(id) + '">' +
          '<span class="fin-dot"></span><span class="fin-side-label">' + esc(label) + "</span>" +
        "</button>"
      );
    }

    var html = btn("", "Todas as contas", !sel);
    for (var i = 0; i < items.length; i++) html += btn(String(items[i].ID), String(items[i].VALUE), sel === String(items[i].ID));

    host.innerHTML = html;

    var bs = host.querySelectorAll("[data-conta]");
    for (var k = 0; k < bs.length; k++) {
      bs[k].addEventListener("click", function () {
        S.filters.conta = this.getAttribute("data-conta") || "";
        renderSidebarAccounts();
        applyFilters();
      });
    }
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
            '<div class="fin-side-note">CONCLUÍDO fica oculto por padrão (mas aparece no filtro “Etapa”).</div>' +
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
              '<button class="fin-btn fin-btn--primary" id="btn-new" data-busylock="1">NOVO</button>' +
              '<button class="fin-btn" id="btn-refresh" data-busylock="1">ATUALIZAR</button>' +
              '<button class="fin-btn" id="btn-csv" data-busylock="1">EXPORTAR CSV</button>' +
            "</div>" +
          "</header>" +

          '<section class="fin-panel"><div class="fin-panel-inner">' +

            '<div class="fin-kpis">' +
              '<div class="fin-kpi"><div class="fin-kpi-k">Total Previsto</div><div class="fin-kpi-v" id="tot-prev">—</div></div>' +
              '<div class="fin-kpi"><div class="fin-kpi-k">Total Realizado</div><div class="fin-kpi-v" id="tot-real">—</div></div>' +
              '<div class="fin-kpi"><div class="fin-kpi-k">Qtd. Itens (filtrado)</div><div class="fin-kpi-v" id="tot-count">—</div></div>' +
            "</div>" +

            '<div class="fin-filters">' +
              '<div class="fin-field"><label>Competência</label><select id="f-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || []) + "</select></div>" +
              '<div class="fin-field"><label>Tipo</label><select id="f-tipo">' + buildOptions(S.enums[CFG.F.TIPO_FIN] || []) + "</select></div>" +
              '<div class="fin-field"><label>Centro de custo</label><select id="f-centro">' + buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—") + "</select></div>" +
              '<div class="fin-field"><label>Status financeiro</label><select id="f-status">' + buildOptions(S.enums[CFG.F.STATUS_FIN] || [], true, "—") + "</select></div>" +
              '<div class="fin-field"><label>Etapa</label>' +
                '<select id="f-stage">' +
                  '<option value="">— Todos (exceto CONCLUÍDO) —</option>' +
                  (S.stages || []).map(function (s) { return '<option value="' + esc(s.STATUS_ID) + '">' + esc(s.NAME) + "</option>"; }).join("") +
                "</select>" +
              "</div>" +
            "</div>" +

            '<div class="fin-table-wrap">' +
              '<table class="fin-table">' +
                "<thead><tr>" +
                  '<th style="width:76px">ID</th>' +
                  "<th>Favorecido</th>" +
                  '<th style="width:170px">Conta</th>' +
                  '<th style="width:140px">Tipo</th>' +
                  '<th style="width:130px">Competência</th>' +
                  '<th style="width:120px">Data Prev.</th>' +
                  '<th style="width:140px">Previsto</th>' +
                  '<th style="width:140px">Realizado</th>' +
                  '<th style="width:170px">Etapa</th>' +
                  '<th style="width:240px">Ações</th>' +
                "</tr></thead>" +
                '<tbody id="fin-tbody"><tr><td colspan="10" class="fin-muted">Carregando…</td></tr></tbody>' +
              "</table>" +
            "</div>" +

            '<div id="fin-toast-host" class="fin-toast-host"></div>' +
          "</div></section>" +

          '<footer class="fin-footerbar">' +
            '<div class="fin-footer-left">' +
              '<div class="k">' + esc(CFG.FOOTER.addressTitle) + "</div>" +
              '<div class="v">' + esc(CFG.FOOTER.addressText) + "</div>" +
            "</div>" +
            '<div class="fin-footer-center">' + esc(CFG.FOOTER.credits) + "</div>" +
            '<div class="fin-footer-right">' +
              CFG.FOOTER.companies.map(function (c) {
                return (
                  '<div class="fin-footer-box">' +
                    '<div class="t">' + esc(c.name) + "</div>" +
                    '<div class="s">' + esc(c.meta) + "</div>" +
                  "</div>"
                );
              }).join("") +
            "</div>" +
            '<div class="fin-footer-avatars" id="fin-avatars" aria-label="Sócios"></div>' +
          "</footer>" +

        "</main>" +
      "</div>";

    // events
    el("#btn-new").addEventListener("click", function () { openEditModal(null); });
    el("#btn-refresh").addEventListener("click", function () { refresh(); });
    el("#btn-csv").addEventListener("click", function () { exportCSV(); });

    el("#f-q").addEventListener("input", function (e) { S.filters.q = e.target.value || ""; applyFilters(); });
    el("#f-comp").addEventListener("change", function () { S.filters.competencia = el("#f-comp").value || ""; applyFilters(); });
    el("#f-tipo").addEventListener("change", function () { S.filters.tipo = el("#f-tipo").value || ""; applyFilters(); });
    el("#f-centro").addEventListener("change", function () { S.filters.centro = el("#f-centro").value || ""; applyFilters(); });
    el("#f-status").addEventListener("change", function () { S.filters.statusFin = el("#f-status").value || ""; applyFilters(); });
    el("#f-stage").addEventListener("change", function () { S.filters.stageId = el("#f-stage").value || ""; applyFilters(); });

    renderSidebarAccounts();
  }

  function renderTable() {
    var tb = el("#fin-tbody");
    if (!tb) return;

    var list = S.filtered || [];
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="10" class="fin-muted">Nenhum item encontrado com os filtros atuais.</td></tr>';
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
          "<td>" + esc(enumName(CFG.F.CONTA, d[CFG.F.CONTA]) || "") + "</td>" +
          "<td>" + esc(enumName(CFG.F.TIPO_FIN, d[CFG.F.TIPO_FIN]) || "") + "</td>" +
          "<td>" + esc(enumName(CFG.F.COMPETENCIA, d[CFG.F.COMPETENCIA]) || "") + "</td>" +
          '<td class="fin-mono">' + esc(toISODate(d[CFG.F.DATA_PREV] || "")) + "</td>" +
          '<td class="fin-mono">' + esc(moneyBR(d[CFG.F.VALOR_PREV])) + "</td>" +
          '<td class="fin-mono">' + esc(moneyBR(d[CFG.F.VALOR_REAL])) + "</td>" +
          "<td>" + esc(stageName(d.STAGE_ID)) + "</td>" +
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

  // ========= REFRESH =========
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

  // ========= PROMISE finally polyfill =========
  if (!Promise.prototype.finally) {
    Promise.prototype.finally = function (cb) {
      var P = this.constructor;
      return this.then(
        function (v) { return P.resolve(cb()).then(function () { return v; }); },
        function (e) { return P.resolve(cb()).then(function () { throw e; }); }
      );
    };
  }

  // ========= BOOT =========
  function boot() {
    // Marca "JS iniciou ✅" (se o sentinel existir)
    try {
      var s = document.getElementById("fin-sentinel");
      if (s) s.textContent = "JS iniciou ✅";
    } catch (_) {}

    root.innerHTML =
      '<div class="fin-boot"><div class="fin-boot-card">' +
        '<div class="fin-boot-title">Financeiro CGD</div>' +
        '<div class="fin-boot-sub">Carregando dados…</div>' +
      "</div></div>";

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
        showFatal("Erro ao iniciar", e);
      });
  }

  boot();
})();
