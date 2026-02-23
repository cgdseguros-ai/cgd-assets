(function () {
  "use strict";

  var WORKER_BASE = "https://financeiro199702.cgdseguros.workers.dev";
  var API_BASE = WORKER_BASE.replace(/\/$/, "") + "/api";

  var CFG = {
    DEAL_CATEGORY_ID: 27,        // Financeiro
    REMINDER_CATEGORY_ID: 17,    // Pipeline 17 (assumido)
    REMINDER_ASSIGNED_ID: 813,   // User 813

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

    PAGE_SIZE: 300,

    // vínculo dos lembretes da pipeline 17 gravado na OBS do financeiro:
    // ex: "... | REL_P17:123,124,130"
    REL_PREFIX: "REL_P17:"
  };

  var root = document.getElementById("fin-root") || document.body;

  function esc(s) {
    s = String(s == null ? "" : s);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function parseJson(t) { try { return JSON.parse(t); } catch (_) { return null; } }

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
    return s;
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

  function addMonthsISO(iso, months) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setMonth(d.getMonth() + months);
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1); if (mo.length < 2) mo = "0" + mo;
    var da = String(d.getDate()); if (da.length < 2) da = "0" + da;
    return y + "-" + mo + "-" + da;
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

  function setLoading(v) {
    S.loading = !!v;
    var badge = el("#fin-loading");
    if (badge) badge.style.display = S.loading ? "inline-flex" : "none";
    var btns = root.querySelectorAll("[data-busylock='1']");
    for (var i = 0; i < btns.length; i++) btns[i].disabled = S.loading;
  }

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

  function loadReserve() {
    try {
      var raw = localStorage.getItem("FIN_RESERVE_BALANCE");
      S.reserve.balance = raw ? Number(raw) : 0;
      if (!isFinite(S.reserve.balance)) S.reserve.balance = 0;
    } catch (_) { S.reserve.balance = 0; }
  }
  function saveReserve() { try { localStorage.setItem("FIN_RESERVE_BALANCE", String(S.reserve.balance || 0)); } catch (_) {} }

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

  /* ======== Pipeline 17 Lembretes (6) ========
     - cria negócio na Pipeline 17 para ASSIGNED_BY_ID=813
     - grava IDs criados na OBS do financeiro: " ... | REL_P17:123,124"
     - ao excluir o financeiro recorrente, deleta também esses IDs.
     Campos específicos do seu lembrete na pipeline 17 não foram informados,
     então usamos: TITLE, CATEGORY_ID, ASSIGNED_BY_ID e (se existir) BEGINDATE/UF... depois ajustamos.
  */
  function parseRelP17Ids(obs) {
    var s = String(obs || "");
    var idx = s.indexOf(CFG.REL_PREFIX);
    if (idx === -1) return [];
    var tail = s.slice(idx + CFG.REL_PREFIX.length);
    var m = tail.match(/^\s*([0-9,\s]+)/);
    if (!m) return [];
    return m[1].split(",").map(function (x) { return String(x).trim(); }).filter(Boolean);
  }

  function upsertRelP17InObs(obs, ids) {
    obs = String(obs || "").trim();
    ids = (ids || []).map(String).filter(Boolean);
    // remove existente
    var p = obs.indexOf(CFG.REL_PREFIX);
    if (p !== -1) obs = obs.slice(0, p).trim().replace(/\|\s*$/, "").trim();
    if (!ids.length) return obs;
    var add = CFG.REL_PREFIX + ids.join(",");
    return obs ? (obs + " | " + add) : add;
  }

  function createReminderP17(finDeal, dueISO) {
    var fav = (finDeal && finDeal[CFG.F.FAVORECIDO]) ? finDeal[CFG.F.FAVORECIDO] : (finDeal.TITLE || "Lembrete");
    var title = "LEMBRETE • Venc " + dueISO + " • " + fav;

    var fields = {
      TITLE: title,
      CATEGORY_ID: String(CFG.REMINDER_CATEGORY_ID),
      ASSIGNED_BY_ID: String(CFG.REMINDER_ASSIGNED_ID)
    };

    // Se você tiver um campo de data no Pipeline 17 (ex.: UF_CRM_xxx), me passe e eu coloco aqui.
    // Por enquanto, o vencimento fica no título + pode ficar na OBS do próprio P17 se quiser.
    return createDeal(fields);
  }

  function deleteReminderP17Ids(ids) {
    ids = (ids || []).map(String).filter(Boolean);
    var p = Promise.resolve();
    for (var i = 0; i < ids.length; i++) (function (id) {
      p = p.then(function () { return deleteDeal(id).catch(function () { /* ignora se já apagou */ }); });
    })(ids[i]);
    return p;
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

      // checkbox globais (visibilidade)
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
  }

  /* (9) mover etapa sem depender do “Tipo” */
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
        '<div class="fin-grid">' +
          '<div class="fin-field"><label>Valor pago/recebido</label><input id="pr-val" value="' + esc(String(deal[CFG.F.VALOR_REAL] || deal[CFG.F.VALOR_PREV] || "")) + '" placeholder="Ex.: 1500,00"></div>' +
          '<div class="fin-field"><label>Data pagamento/recebimento</label><input id="pr-date" value="' + esc(toISODate(deal[CFG.F.DATA_REAL] || "")) + '" placeholder="YYYY-MM-DD"></div>' +
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
    var ids = parseRelP17Ids(deal[CFG.F.OBS] || "");
    var extra = ids.length ? ("<br><br><b>ATENÇÃO:</b> este lançamento tem " + ids.length + " lembretes vinculados na Pipeline 17 (User 813). Eles também serão apagados.") : "";

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Excluir lançamento</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +
        '<div class="fin-hint">Tem certeza que deseja <b>EXCLUIR</b> o card <span class="fin-mono">#' + esc(deal.ID) + '</span>?<br>Isso remove o negócio do Bitrix.' + extra + '</div>' +
        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
          '<button class="fin-btn fin-btn--danger" id="del-ok" data-busylock="1">Excluir</button>' +
        '</div>' +
      '</div>'
    );

    m.q("#del-ok").addEventListener("click", function () {
      setLoading(true);

      // (6) se tiver REL_P17, apaga os lembretes também
      deleteReminderP17Ids(ids)
        .then(function () { return deleteDeal(deal.ID); })
        .then(function () { toast("Excluído ✅"); m.close(); return refresh(); })
        .catch(function (e) { toast("Falha: " + (e.message || String(e)), "err"); })
        .finally(function () { setLoading(false); });
    });
  }

  /* (7) NOVO LANÇAMENTO: avulsa / recorr semanal / recorr mensal
     - para recorrência mensal de DESPESA: cria também lembretes na pipeline 17 (6)
  */
  function openNewModal() {
    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Novo lançamento</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +

        '<div class="fin-grid">' +
          '<div class="fin-field"><label>Tipo Financeiro</label><select id="n-tipo">' + buildOptions(S.enums[CFG.F.TIPO_FIN] || [], true, "Selecione...") + '</select></div>' +
          '<div class="fin-field"><label>Competência</label><select id="n-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || []) + '</select></div>' +

          '<div class="fin-field"><label>Centro de custo</label><select id="n-cc">' + buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—") + '</select></div>' +
          '<div class="fin-field"><label>Conta / Origem</label><select id="n-conta">' + buildOptions(S.enums[CFG.F.CONTA] || [], true, "—") + '</select></div>' +

          '<div class="fin-field"><label>Data Prevista (1ª)</label><input id="n-date" placeholder="YYYY-MM-DD"></div>' +
          '<div class="fin-field"><label>Valor Previsto</label><input id="n-val" placeholder="Ex.: 1500,00"></div>' +

          '<div class="fin-field"><label>Favorecido / Pagador</label><input id="n-fav" placeholder="Ex.: Light, Vivo, Cliente..."></div>' +
          '<div class="fin-field"><label>Categoria</label><select id="n-cat">' + buildOptions(S.enums[CFG.F.CATEGORIA] || [], true, "—") + '</select></div>' +

          '<div class="fin-field"><label>Recorrência</label>' +
            '<select id="n-rec">' +
              '<option value="once">Avulsa (1x)</option>' +
              '<option value="weekly">Semanal</option>' +
              '<option value="monthly">Mensal</option>' +
            '</select>' +
          '</div>' +

          '<div class="fin-field"><label>Qtd. ocorrências</label><input id="n-qtd" value="1" placeholder="Ex.: 12"></div>' +
        '</div>' +

        '<div class="fin-field" style="margin-top:10px"><label>Observações</label><textarea id="n-obs" rows="2"></textarea></div>' +

        '<div class="fin-row fin-row--right" style="margin-top:12px">' +
          '<button class="fin-btn" data-close="1">Cancelar</button>' +
          '<button class="fin-btn fin-btn--primary" id="n-go" data-busylock="1">Criar</button>' +
        '</div>' +

      '</div>'
    );

    m.q("#n-go").addEventListener("click", function () {
      setLoading(true);
      try {
        var tipo = m.q("#n-tipo").value;
        if (!tipo) throw new Error("Selecione o Tipo Financeiro.");

        var comp = m.q("#n-comp").value || "";
        var cc = m.q("#n-cc").value || "";
        var conta = m.q("#n-conta").value || "";
        var date0 = toISODate(m.q("#n-date").value || "");
        if (!date0) throw new Error("Informe a Data Prevista (YYYY-MM-DD).");

        var vprev = parseMoneyBR(m.q("#n-val").value || "");
        var fav = String(m.q("#n-fav").value || "").trim();
        var cat = m.q("#n-cat").value || "";
        var obs = String(m.q("#n-obs").value || "").trim();

        if (isBadFav(fav)) throw new Error("Favorecido inválido (parece FILA/QUEUE).");

        var rec = m.q("#n-rec").value;
        var qtd = Math.max(1, parseInt(m.q("#n-qtd").value || "1", 10) || 1);

        // define etapa inicial por texto do tipo (melhor: se no seu enum tiver "DESPESA"/"RECEITA")
        var tipoTxt = (enumName(CFG.F.TIPO_FIN, tipo) || "").toUpperCase();
        var isDesp = (tipoTxt.indexOf("DESP") > -1);
        var isRec = (tipoTxt.indexOf("REC") > -1);

        var stage = isRec ? CFG.STAGES.REC_A_RECEBER : CFG.STAGES.DESP_A_PAGAR;

        function calcDate(idx) {
          if (rec === "weekly") return addDaysISO(date0, idx * 7);
          if (rec === "monthly") return addMonthsISO(date0, idx);
          return date0;
        }

        var ops = Promise.resolve();
        var created = 0;
        var reminderIds = [];

        for (var i = 0; i < qtd; i++) (function (idx) {
          ops = ops.then(function () {
            var dt = calcDate(idx);

            var fields = {};
            fields.TITLE = "FIN • " + (enumName(CFG.F.TIPO_FIN, tipo) || "FIN") + (fav ? " • " + fav : "");
            fields.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
            fields.STAGE_ID = stage;

            fields[CFG.F.TIPO_FIN] = tipo;
            fields[CFG.F.COMPETENCIA] = comp;
            fields[CFG.F.CENTRO_CUSTO] = cc;
            fields[CFG.F.CONTA] = conta;
            fields[CFG.F.DATA_PREV] = dt;
            fields[CFG.F.VALOR_PREV] = vprev;
            fields[CFG.F.FAVORECIDO] = fav;
            fields[CFG.F.CATEGORIA] = cat;
            fields[CFG.F.OBS] = obs;

            return createDeal(fields).then(function (newId) {
              created++;

              // (6) somente “recorrência mensal de DESPESA” cria lembretes na pipeline 17
              if (rec === "monthly" && isDesp) {
                return createReminderP17({ TITLE: fields.TITLE, UF: fields }, dt).then(function (rid) {
                  if (rid) reminderIds.push(String(rid));
                  // grava o vínculo no próprio deal financeiro recém criado
                  if (rid) {
                    var newObs = upsertRelP17InObs(obs, [rid]);
                    var upd = {}; upd[CFG.F.OBS] = newObs;
                    return updateDeal(newId, upd);
                  }
                });
              }
            });
          });
        })(i);

        ops.then(function () {
          toast("Criado ✅ (" + created + " item(ns))");
          m.close();
          return refresh();
        }).catch(function (e) {
          toast("Falha: " + (e.message || String(e)), "err");
        }).finally(function () {
          setLoading(false);
        });

      } catch (err) {
        toast(err.message || String(err), "err");
        setLoading(false);
      }
    });
  }

  /* (8) LOTE: modal em lista (várias linhas)
     - com botões “Criar DESPESAS” e “Criar RECEITAS”
     - cada linha pode ser avulsa/semanal/mensal
  */
  function openBatchListModal() {
    var rows = [{ fav:"", val:"", date:"", rec:"once", qtd:"1" }];

    function renderRows(host) {
      var html = "";
      for (var i = 0; i < rows.length; i++) {
        html +=
          '<div class="fin-grid" style="margin-bottom:10px;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--off)">' +
            '<div class="fin-field"><label>Favorecido/Pagador</label><input data-k="fav" data-i="'+i+'" value="'+esc(rows[i].fav)+'" placeholder="Ex.: Light, Cliente..."></div>' +
            '<div class="fin-field"><label>Valor</label><input data-k="val" data-i="'+i+'" value="'+esc(rows[i].val)+'" placeholder="Ex.: 1500,00"></div>' +
            '<div class="fin-field"><label>Data 1ª</label><input data-k="date" data-i="'+i+'" value="'+esc(rows[i].date)+'" placeholder="YYYY-MM-DD"></div>' +
            '<div class="fin-field"><label>Recorrência</label>' +
              '<select data-k="rec" data-i="'+i+'">' +
                '<option value="once" '+(rows[i].rec==="once"?"selected":"")+'>Avulsa</option>' +
                '<option value="weekly" '+(rows[i].rec==="weekly"?"selected":"")+'>Semanal</option>' +
                '<option value="monthly" '+(rows[i].rec==="monthly"?"selected":"")+'>Mensal</option>' +
              '</select>' +
            '</div>' +
            '<div class="fin-field"><label>Qtd</label><input data-k="qtd" data-i="'+i+'" value="'+esc(rows[i].qtd)+'" placeholder="Ex.: 12"></div>' +
            '<div class="fin-field"><label>Ações</label><button class="fin-btn fin-btn--danger" data-del="'+i+'">Remover</button></div>' +
          '</div>';
      }
      host.innerHTML = html;

      var inputs = host.querySelectorAll("input[data-k],select[data-k]");
      for (var j = 0; j < inputs.length; j++) {
        inputs[j].addEventListener("input", function () {
          var k = this.getAttribute("data-k");
          var idx = parseInt(this.getAttribute("data-i") || "0", 10);
          rows[idx][k] = this.value;
        });
        inputs[j].addEventListener("change", function () {
          var k = this.getAttribute("data-k");
          var idx = parseInt(this.getAttribute("data-i") || "0", 10);
          rows[idx][k] = this.value;
        });
      }

      var dels = host.querySelectorAll("[data-del]");
      for (var d = 0; d < dels.length; d++) {
        dels[d].addEventListener("click", function () {
          var idx = parseInt(this.getAttribute("data-del") || "0", 10);
          rows.splice(idx, 1);
          if (!rows.length) rows.push({ fav:"", val:"", date:"", rec:"once", qtd:"1" });
          renderRows(host);
        });
      }
    }

    var m = modal(
      '<div class="fin-modal-head"><div class="fin-modal-title">Lote (preencher várias linhas)</div><button class="fin-x" data-close="1">×</button></div>' +
      '<div class="fin-modal-body">' +

        '<div class="fin-grid">' +
          '<div class="fin-field"><label>Centro de custo</label><select id="b-cc">' + buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—") + '</select></div>' +
          '<div class="fin-field"><label>Conta / Origem</label><select id="b-conta">' + buildOptions(S.enums[CFG.F.CONTA] || [], true, "—") + '</select></div>' +
          '<div class="fin-field"><label>Competência</label><select id="b-comp">' + buildOptions(S.enums[CFG.F.COMPETENCIA] || []) + '</select></div>' +
          '<div class="fin-field"><label>Categoria</label><select id="b-cat">' + buildOptions(S.enums[CFG.F.CATEGORIA] || [], true, "—") + '</select></div>' +
        '</div>' +

        '<div class="fin-field" style="margin-top:10px"><label>Observações (aplica a todas)</label><textarea id="b-obs" rows="2"></textarea></div>' +

        '<div style="margin-top:10px" id="b-rows"></div>' +

        '<div class="fin-row" style="margin-top:10px;justify-content:space-between">' +
          '<button class="fin-btn" id="b-add">+ Adicionar linha</button>' +
          '<div class="fin-row fin-row--right" style="gap:8px">' +
            '<button class="fin-btn fin-btn--primary" id="b-exp" data-busylock="1">Criar DESPESAS</button>' +
            '<button class="fin-btn fin-btn--primary" id="b-rec" data-busylock="1">Criar RECEITAS</button>' +
          '</div>' +
        '</div>' +

      '</div>'
    );

    var host = m.q("#b-rows");
    renderRows(host);

    m.q("#b-add").addEventListener("click", function () {
      rows.push({ fav:"", val:"", date:"", rec:"once", qtd:"1" });
      renderRows(host);
    });

    function createBatch(kind) {
      setLoading(true);
      try {
        var cc = m.q("#b-cc").value || "";
        var conta = m.q("#b-conta").value || "";
        var comp = m.q("#b-comp").value || "";
        var cat = m.q("#b-cat").value || "";
        var obsAll = String(m.q("#b-obs").value || "").trim();

        // achar tipo enum por texto (despesa/receita). Se você preferir fixar ID, me diga o ID do enum.
        var tipoEnum = "";
        var items = S.enums[CFG.F.TIPO_FIN] || [];
        for (var i = 0; i < items.length; i++) {
          var t = String(items[i].VALUE || "").toUpperCase();
          if (kind === "EXP" && t.indexOf("DESP") > -1) { tipoEnum = String(items[i].ID); break; }
          if (kind === "REC" && t.indexOf("REC") > -1) { tipoEnum = String(items[i].ID); break; }
        }
        if (!tipoEnum) throw new Error("Não achei um 'Tipo Financeiro' com texto de " + (kind==="EXP"?"DESPESA":"RECEITA") + ". Me diga qual enum usar.");

        var stage = (kind === "REC") ? CFG.STAGES.REC_A_RECEBER : CFG.STAGES.DESP_A_PAGAR;

        function calcDate(base, rec, idx) {
          if (rec === "weekly") return addDaysISO(base, idx * 7);
          if (rec === "monthly") return addMonthsISO(base, idx);
          return base;
        }

        var ops = Promise.resolve();
        var created = 0;

        for (var r = 0; r < rows.length; r++) (function (row) {
          ops = ops.then(function () {
            var fav = String(row.fav || "").trim();
            if (!fav) throw new Error("Tem linha sem Favorecido.");
            if (isBadFav(fav)) throw new Error("Favorecido inválido (FILA/QUEUE): " + fav);

            var vprev = parseMoneyBR(row.val || "");
            var d0 = toISODate(row.date || "");
            if (!d0) throw new Error("Linha sem Data 1ª (YYYY-MM-DD).");

            var rec = row.rec || "once";
            var qtd = Math.max(1, parseInt(row.qtd || "1", 10) || 1);

            var p = Promise.resolve();

            for (var j = 0; j < qtd; j++) (function (idx) {
              p = p.then(function () {
                var dt = calcDate(d0, rec, idx);

                var fields = {};
                fields.TITLE = "FIN • " + (kind === "REC" ? "RECEITA" : "DESPESA") + " • " + fav;
                fields.CATEGORY_ID = String(CFG.DEAL_CATEGORY_ID);
                fields.STAGE_ID = stage;

                fields[CFG.F.TIPO_FIN] = tipoEnum;
                fields[CFG.F.COMPETENCIA] = comp;
                fields[CFG.F.CENTRO_CUSTO] = cc;
                fields[CFG.F.CONTA] = conta;
                fields[CFG.F.DATA_PREV] = dt;
                fields[CFG.F.VALOR_PREV] = vprev;
                fields[CFG.F.FAVORECIDO] = fav;
                fields[CFG.F.CATEGORIA] = cat;
                fields[CFG.F.OBS] = obsAll;

                return createDeal(fields).then(function () { created++; });
              });
            })(j);

            return p;
          });
        })(rows[r]);

        ops.then(function () {
          toast("Lote criado ✅ (" + created + " itens)");
          m.close();
          return refresh();
        }).catch(function (e) {
          toast("Falha no lote: " + (e.message || String(e)), "err");
        }).finally(function () {
          setLoading(false);
        });

      } catch (err) {
        toast(err.message || String(err), "err");
        setLoading(false);
      }
    }

    m.q("#b-exp").addEventListener("click", function () { createBatch("EXP"); });
    m.q("#b-rec").addEventListener("click", function () { createBatch("REC"); });
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
              '<button class="fin-mini" data-act="edit" data-id="' + esc(d.ID) + '">Editar</button>' +
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

        if (act === "edit") return toast("Editar (próximo passo: edição completa)"); // você pediu foco em recorrência/fluxo; deixo o edit completo no próximo ajuste
        if (act === "del") return confirmDelete(deal);
        if (act === "chk") {
          try { this.checked = false; } catch(_) {}
          return openPayReceiveModal(deal);
        }
      });
    }
  }

  function exportCSV() {
    var list = S.filtered || [];
    if (!list.length) { toast("Nada para exportar.", "err"); return; }

    var headers = ["ID","CENTRO_CUSTO","CONTA","TIPO","COMPETENCIA","DATA_PREVISTA","VALOR_PREVISTO","VALOR_REALIZADO","ETAPA","FAVORECIDO","CATEGORIA","OBS"];
    var csv = [];
    csv.push(headers.join(";"));

    function q(s) { s = String(s == null ? "" : s).replace(/"/g, '""'); return '"' + s + '"'; }

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
            '<button class="fin-btn fin-btn--primary" id="btn-new" data-busylock="1">NOVO</button>' +
            '<button class="fin-btn fin-btn--primary" id="btn-batch" data-busylock="1">LOTE</button>' +
            '<button class="fin-btn" id="btn-refresh" data-busylock="1">ATUALIZAR</button>' +
            '<button class="fin-btn" id="btn-csv" data-busylock="1">EXPORTAR CSV</button>' +
          '</div>' +
        '</header>' +

        '<div class="fin-shell">' +
          '<div class="fin-body">' +
            '<aside class="fin-side">' +
              '<div class="fin-side-brand">' +
                '<img class="fin-brand-logo" src="' + esc(CFG.LOGO_URL) + '" alt="CGD">' +
                '<div><div class="fin-brand-title">Financeiro CGD</div><div class="fin-brand-sub">Deals • Pipeline 27</div></div>' +
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
                  '<div class="fin-field"><label>Tipo</label><select id="f-tipo">' + buildOptions(S.enums[CFG.F.TIPO_FIN] || []) + '</select></div>' +
                  '<div class="fin-field"><label>Conta</label><select id="f-conta">' + buildOptions(S.enums[CFG.F.CONTA] || [], true, "—") + '</select></div>' +
                  '<div class="fin-field"><label>Status</label><select id="f-status">' + buildOptions(S.enums[CFG.F.STATUS_FIN] || [], true, "—") + '</select></div>' +
                  '<div class="fin-field"><label>Etapa</label><select id="f-stage"><option value="">— Todos (exceto CONCLUÍDO) —</option>' +
                    (S.stages || []).map(function (s) { return '<option value="' + esc(s.STATUS_ID) + '">' + esc(s.NAME) + '</option>'; }).join("") +
                  '</select></div>' +

                  '<div style="flex-basis:100%; height:0"></div>' +

                  '<div class="fin-toggles">' +
                    '<label class="fin-check"><input type="checkbox" id="tog-exp" checked> <span>Mostrar Despesas (A PAGAR + PAGAS)</span></label>' +
                    '<label class="fin-check"><input type="checkbox" id="tog-rec" checked> <span>Mostrar Receitas (A RECEBER + RECEBIDAS)</span></label>' +
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

        '<footer class="fin-footerbar">' +
          '<div class="fin-footer-left"><div class="k">' + esc(CFG.FOOTER.addressTitle) + '</div><div class="v">' + esc(CFG.FOOTER.addressText) + '</div></div>' +
          '<div class="fin-footer-center">' + esc(CFG.FOOTER.credits) + '</div>' +
          '<div class="fin-footer-right">' +
            CFG.FOOTER.companies.map(function (c) {
              return '<div class="fin-footer-box"><div class="t">' + esc(c.name) + '</div><div class="s">' + esc(c.meta) + '</div></div>';
            }).join("") +
          '</div>' +
          '<div class="fin-footer-avatars" id="fin-avatars"></div>' +
        '</footer>' +

      '</div>';

    el("#btn-new").addEventListener("click", function () { openNewModal(); });
    el("#btn-batch").addEventListener("click", function () { openBatchListModal(); });
    el("#btn-refresh").addEventListener("click", function () { refresh(); });
    el("#btn-csv").addEventListener("click", function () { exportCSV(); });
    el("#btn-reserve").addEventListener("click", function () { openReserveModal(); });

    el("#f-q").addEventListener("input", function (e) { S.filters.q = e.target.value || ""; applyFilters(); });
    el("#f-comp").addEventListener("change", function () { S.filters.competencia = el("#f-comp").value || ""; applyFilters(); });
    el("#f-tipo").addEventListener("change", function () { S.filters.tipo = el("#f-tipo").value || ""; applyFilters(); });
    el("#f-conta").addEventListener("change", function () { S.filters.conta = el("#f-conta").value || ""; applyFilters(); });
    el("#f-status").addEventListener("change", function () { S.filters.statusFin = el("#f-status").value || ""; applyFilters(); });
    el("#f-stage").addEventListener("change", function () { S.filters.stageId = el("#f-stage").value || ""; applyFilters(); });

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
    // (3) não mexe no sentinel, não exibe “JS iniciou ✅”
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

  window.addEventListener("error", function () {});
  window.addEventListener("unhandledrejection", function () {});

  boot();
})();
