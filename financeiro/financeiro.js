/* Financeiro CGD — Deals / Pipeline (CATEGORY) 27
   + Módulo Cartões/Faturas (1 compra + parcelas calculadas)
   Cloudflare Worker:
   - Assets: /asset/financeiro.js e /asset/financeiro.css
   - API Proxy: /api/<metodo_bitrix>
*/
(function () {
  "use strict";

  // ========= CONFIG =========
  const WORKER_BASE = "https://financeiro199702.cgdseguros.workers.dev";
  const API_BASE = WORKER_BASE + "/api";

  const CFG = {
    DEAL_CATEGORY_ID: 27,

    // Campos UF
    F: {
      TIPO_FIN: "UF_CRM_1771208061",            // lista (RECEITA/DESPESA)
      COMPETENCIA: "UF_CRM_1771163661",         // lista (mês)
      VALOR_PREV: "UF_CRM_1770769991",          // número/moeda
      VALOR_REAL: "UF_CRM_1770770017",          // número/moeda
      DATA_REAL: "UF_CRM_1770771170",           // data
      FAVORECIDO: "UF_CRM_1770775760",          // string
      FORMA_PGTO: "UF_CRM_1769351652",          // lista
      OBS: "UF_CRM_691385BE7D33D",              // string
      CATEGORIA: "UF_CRM_1770770570",           // lista
      DATA_PREV: "UF_CRM_1770769767",           // data
      STATUS_FIN: "UF_CRM_1770770088",          // lista
      CONTA: "UF_CRM_1770770758",               // lista
      CENTRO_CUSTO: "UF_CRM_1771801157",        // lista
    },

    // ✅ IDs reais das etapas (Pipeline 27) — USAREMOS SÓ ESSAS 6
    STAGES: {
      DESP_A_PAGAR: "C27:NEW",
      DESP_PAGA: "C27:PREPARATION",
      REC_A_RECEBER: "C27:UC_EQAFD7",
      REC_RECEBIDA: "C27:PREPAYMENT_INVOIC",
      CANCELADO: "C27:EXECUTING",
      CONCLUIDO: "C27:UC_LP2NSK",
    },

    // ✅ Cartões
    CARDS: [
      { name: "CT ITAÚ PJ", venc: 2, melhor: 21 },
      { name: "CT PORTO PF", venc: 10, melhor: 4 },
      { name: "CT C6 PJ", venc: 15, melhor: 9 },
      { name: "CT XP PF", venc: 15, melhor: 11 },
      { name: "CT ITAÚ PF", venc: 21, melhor: 13 },
      { name: "CT CORA CGD BARRA", venc: 23, melhor: 17 },
      { name: "CT PORTO PJ", venc: 30, melhor: 25 },
    ],

    // UX
    PAGE_SIZE: 50,
    CURRENCY_PREFIX: "R$ ",
    DEFAULT_TITLE_PREFIX: "FIN",
  };

  // ========= STATE =========
  const S = {
    enums: null,         // crm.deal.fields (items de listas)
    stages: null,        // stages filtradas (somente 6)
    loading: false,
    lastSyncAt: null,

    deals: [],
    filtered: [],

    filters: {
      q: "",
      competencia: "",     // enum id
      tipo: "",            // enum id
      centro: "",          // enum id
      statusFin: "",       // enum id
      stageId: "",         // stage_id
    }
  };

  // ========= DOM =========
  const root = document.getElementById("fin-root") || document.body;

  // ========= HELPERS =========
  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function moneyBR(v) {
    const n = Number(v);
    if (!isFinite(n)) return "";
    const fixed = n.toFixed(2);
    const [a, b] = fixed.split(".");
    const withDots = a.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${CFG.CURRENCY_PREFIX}${withDots},${b}`;
  }

  function parseMoneyBR(s) {
    if (s == null) return 0;
    const t = String(s).trim()
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(t);
    return isFinite(n) ? n : 0;
  }

  function toISODate(d) {
    if (!d) return "";
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return s;
  }

  function isoToParts(iso) {
    const s = toISODate(iso);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function ymKey(y, mo) { return `${y}-${pad2(mo)}`; }
  function ymLabel(y, mo) { return `${pad2(mo)}/${y}`; }

  function addMonths(y, mo, add) {
    // mo: 1..12
    let yy = y;
    let mm = mo + add;
    while (mm > 12) { mm -= 12; yy += 1; }
    while (mm < 1) { mm += 12; yy -= 1; }
    return { y: yy, mo: mm };
  }

  function clampDay(y, mo, day) {
    // ajusta dia para último dia do mês se necessário
    const last = new Date(y, mo, 0).getDate(); // mo é 1..12, então new Date(y, mo, 0) dá último dia do mês
    return Math.min(day, last);
  }

  function makeISODate(y, mo, day) {
    const dd = clampDay(y, mo, day);
    return `${y}-${pad2(mo)}-${pad2(dd)}`;
  }

  async function api(method, payload) {
    const r = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch { /* ignore */ }

    if (!r.ok) {
      const msg = j?.error_description || j?.error || txt || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    if (j && j.error) {
      throw new Error(j.error_description || j.error);
    }
    return j;
  }

  function el(q) { return root.querySelector(q); }
  function els(q) { return Array.from(root.querySelectorAll(q)); }

  function setLoading(v) {
    S.loading = !!v;
    const badge = el("#fin-loading");
    if (badge) badge.style.display = S.loading ? "inline-flex" : "none";
    const btns = els("[data-busylock='1']");
    btns.forEach(b => b.disabled = S.loading);
  }

  function toast(msg, type = "ok") {
    const host = el("#fin-toast-host");
    if (!host) return alert(msg);

    const t = document.createElement("div");
    t.className = `fin-toast fin-toast--${type}`;
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => { t.classList.add("fin-toast--show"); }, 10);
    setTimeout(() => {
      t.classList.remove("fin-toast--show");
      setTimeout(() => t.remove(), 250);
    }, 3200);
  }

  function modal(html) {
    const wrap = document.createElement("div");
    wrap.className = "fin-modal-wrap";
    wrap.innerHTML = `
      <div class="fin-modal-backdrop" data-close="1"></div>
      <div class="fin-modal">
        ${html}
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-close") === "1") {
        wrap.remove();
      }
    });

    return {
      node: wrap,
      close: () => wrap.remove(),
      q: (sel) => wrap.querySelector(sel),
      qs: (sel) => Array.from(wrap.querySelectorAll(sel)),
    };
  }

  function buildOptions(items, { includeBlank = true, blankText = "— Todos —" } = {}) {
    const arr = Array.isArray(items) ? items : [];
    const opts = [];
    if (includeBlank) opts.push(`<option value="">${esc(blankText)}</option>`);
    for (const it of arr) {
      opts.push(`<option value="${esc(it.ID)}">${esc(it.VALUE ?? it.NAME ?? it.ID)}</option>`);
    }
    return opts.join("");
  }

  function enumName(fieldId, enumId) {
    if (!enumId) return "";
    const list = S.enums?.[fieldId]?.items;
    const it = list?.find(x => String(x.ID) === String(enumId));
    return it?.VALUE || it?.NAME || String(enumId);
  }

  function stageName(stageId) {
    if (!stageId) return "";
    const it = S.stages?.find(x => String(x.STATUS_ID) === String(stageId));
    return it?.NAME || String(stageId);
  }

  function enumIdByValue(fieldId, valueText) {
    if (!valueText) return "";
    const list = S.enums?.[fieldId]?.items || [];
    const target = String(valueText).trim().toUpperCase();
    const it = list.find(x => String(x.VALUE || "").trim().toUpperCase() === target);
    return it ? String(it.ID) : "";
  }

  function findCompetenciaEnumId(y, mo) {
    const list = S.enums?.[CFG.F.COMPETENCIA]?.items || [];
    const label = ymLabel(y, mo); // "MM/YYYY"
    const yStr = String(y);
    const moStr = pad2(mo);

    // tenta achar "MM/YYYY" dentro do texto
    let it = list.find(x => String(x.VALUE || "").includes(label));
    if (it) return String(it.ID);

    // tenta achar padrão "YYYY-MM" ou algo parecido
    it = list.find(x => {
      const v = String(x.VALUE || "").toUpperCase();
      return v.includes(yStr) && (v.includes(moStr) || v.includes(String(mo)));
    });
    return it ? String(it.ID) : "";
  }

  // ========= META =========
  async function loadMeta() {
    // fields/enums
    const fieldsRes = await api("crm.deal.fields", {});
    const fields = fieldsRes?.result || {};
    S.enums = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v && Array.isArray(v.items)) {
        S.enums[k] = { items: v.items.map(it => ({ ID: it.ID, VALUE: it.VALUE })) };
      }
    }

    // stages pipeline 27
    const st = await api("crm.status.list", {
      filter: { ENTITY_ID: `DEAL_STAGE_${CFG.DEAL_CATEGORY_ID}` }
    });
    const rawStages = st?.result || [];
    if (!Array.isArray(rawStages)) throw new Error("Não consegui carregar as etapas da Pipeline 27.");

    const allowedStageIds = new Set(Object.values(CFG.STAGES).map(String));
    S.stages = rawStages.map(x => ({
      STATUS_ID: x.STATUS_ID || x.ID || x.id,
      NAME: x.NAME || x.name,
      SORT: Number(x.SORT || x.sort || 0),
    })).filter(stg => allowedStageIds.has(String(stg.STATUS_ID)));

    S.stages.sort((a, b) => (a.SORT - b.SORT));
  }

  // ========= STAGE CHOOSERS =========
  function initialStageForTipo(tipoEnumId) {
    const tipoTxt = (enumName(CFG.F.TIPO_FIN, tipoEnumId) || "").toUpperCase();
    if (tipoTxt.includes("DESP")) return CFG.STAGES.DESP_A_PAGAR;
    if (tipoTxt.includes("REC")) return CFG.STAGES.REC_A_RECEBER;
    return "";
  }

  function paidStageForTipo(tipoEnumId) {
    const tipoTxt = (enumName(CFG.F.TIPO_FIN, tipoEnumId) || "").toUpperCase();
    if (tipoTxt.includes("DESP")) return CFG.STAGES.DESP_PAGA;
    if (tipoTxt.includes("REC")) return CFG.STAGES.REC_RECEBIDA;
    return "";
  }

  // ========= AUTH (opcional) =========
  async function ensureAuthIfNeeded() {
    try {
      await api("crm.deal.fields", {});
      return;
    } catch (e) {
      const msg = String(e?.message || e);
      if (!msg.includes("401") && !msg.toLowerCase().includes("autentica")) throw e;
    }

    const m = modal(`
      <div class="fin-modal-head">
        <div class="fin-modal-title">Acesso ao Financeiro</div>
        <button class="fin-x" data-close="1" title="Fechar">×</button>
      </div>
      <div class="fin-modal-body">
        <div class="fin-field">
          <label>Senha</label>
          <input id="fin-pass" type="password" placeholder="Digite a senha" autocomplete="current-password" />
        </div>
        <div class="fin-row fin-row--right">
          <button class="fin-btn" data-close="1">Cancelar</button>
          <button class="fin-btn fin-btn--primary" id="fin-auth-btn">Entrar</button>
        </div>
        <div class="fin-hint">Se der erro, confirme se o Worker tem a variável <b>PANEL_PASSWORD</b> configurada.</div>
      </div>
    `);

    const btn = m.q("#fin-auth-btn");
    const inp = m.q("#fin-pass");
    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        const pass = inp.value || "";
        const r = await fetch(WORKER_BASE + "/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: pass })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
        m.close();
        toast("Autenticado ✅");
      } catch (_e) {
        toast("Senha inválida ou auth não configurada.", "err");
      } finally {
        btn.disabled = false;
      }
    });

    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btn.click();
    });
  }

  // ========= TAGS (OBS) =========
  function tagGet(obs, key) {
    const s = String(obs || "");
    const re = new RegExp("\\[" + key + "=([^\\]]*)\\]", "i");
    const m = s.match(re);
    return m ? m[1] : "";
  }
  function tagHas(obs, key) {
    const s = String(obs || "");
    const re = new RegExp("\\[" + key + "\\]", "i");
    return re.test(s);
  }
  function tagSet(obs, key, val) {
    let s = String(obs || "");
    const re = new RegExp("\\[" + key + "=([^\\]]*)\\]", "ig");
    if (re.test(s)) s = s.replace(re, "");
    s = s.trim();
    if (s) s += " ";
    s += `[${key}=${String(val)}]`;
    return s.trim();
  }

  // ========= CARTÕES: regra de fatura =========
  function calcInvoiceYM(card, purchaseISO) {
    const p = isoToParts(purchaseISO);
    if (!p) return null;

    // Regra:
    // dia <= melhor_dia => fatura do mês "corrente" (vencimento mais próximo)
    // dia >  melhor_dia => próxima fatura (mês seguinte)
    const shift = (p.d > Number(card.melhor)) ? 1 : 0;
    const ym = addMonths(p.y, p.mo, shift);
    return ym; // {y, mo}
  }

  function invoiceTitle(cardName, y, mo) {
    return `FATURA • ${cardName} • ${ymLabel(y, mo)}`;
  }

  function purchaseTitle(cardName, desc) {
    const d = (desc || "").trim();
    return `COMPRA • ${cardName}${d ? " • " + d : ""}`;
  }

  function tipoDespesaId() {
    // tenta achar enum "DESPESA"
    return enumIdByValue(CFG.F.TIPO_FIN, "DESPESA") || enumIdByValue(CFG.F.TIPO_FIN, "DESP") || "";
  }

  // ========= DEALS =========
  async function listDealsAll() {
    const all = [];
    let start = 0;

    while (true) {
      const res = await api("crm.deal.list", {
        select: [
          "ID", "TITLE", "STAGE_ID", "CATEGORY_ID", "DATE_CREATE", "DATE_MODIFY",
          CFG.F.TIPO_FIN,
          CFG.F.COMPETENCIA,
          CFG.F.VALOR_PREV,
          CFG.F.VALOR_REAL,
          CFG.F.DATA_REAL,
          CFG.F.FAVORECIDO,
          CFG.F.FORMA_PGTO,
          CFG.F.OBS,
          CFG.F.CATEGORIA,
          CFG.F.DATA_PREV,
          CFG.F.STATUS_FIN,
          CFG.F.CONTA,
          CFG.F.CENTRO_CUSTO,
        ],
        filter: {
          "CATEGORY_ID": String(CFG.DEAL_CATEGORY_ID),

          // Só as 6 etapas do Financeiro
          "STAGE_ID": [
            CFG.STAGES.DESP_A_PAGAR,
            CFG.STAGES.DESP_PAGA,
            CFG.STAGES.REC_A_RECEBER,
            CFG.STAGES.REC_RECEBIDA,
            CFG.STAGES.CANCELADO,
            CFG.STAGES.CONCLUIDO
          ],

          // Tipo financeiro preenchido
          ["!" + CFG.F.TIPO_FIN]: ""
        },
        order: { "ID": "DESC" },
        start
      });

      const chunk = res?.result || [];
      all.push(...chunk);
      const next = res?.next;
      if (next == null) break;
      start = next;
      if (all.length > 15000) break;
    }
    return all;
  }

  async function updateDeal(id, values) {
    await api("crm.deal.update", { id: String(id), fields: values });
  }

  async function createDeal(values) {
    const res = await api("crm.deal.add", { fields: values });
    return res?.result;
  }

  // ========= FATURAS: encontrar/criar e recalcular =========
  function findInvoiceDeal(cardName, y, mo) {
    const title = invoiceTitle(cardName, y, mo);
    return S.deals.find(d => String(d.TITLE || "") === title) || null;
  }

  async function ensureInvoiceDeal(cardName, y, mo, vencDay) {
    let inv = findInvoiceDeal(cardName, y, mo);
    if (inv) return inv;

    const tipoId = tipoDespesaId();
    const dueISO = makeISODate(y, mo, vencDay);
    const compId = findCompetenciaEnumId(y, mo);

    let obs = "";
    obs = tagSet(obs, "INVOICE", "1");
    obs = tagSet(obs, "CARD", cardName);
    obs = tagSet(obs, "INV", ymKey(y, mo));

    const fields = {
      TITLE: invoiceTitle(cardName, y, mo),
      CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID),
      STAGE_ID: CFG.STAGES.DESP_A_PAGAR,
      [CFG.F.TIPO_FIN]: tipoId || "",
      [CFG.F.FAVORECIDO]: cardName,
      [CFG.F.DATA_PREV]: dueISO,
      [CFG.F.COMPETENCIA]: compId || "",
      [CFG.F.VALOR_PREV]: 0,
      [CFG.F.OBS]: obs,
    };

    const newId = await createDeal(fields);

    // cria um "stub" local pra não precisar refresh imediato
    inv = {
      ID: String(newId),
      TITLE: fields.TITLE,
      STAGE_ID: fields.STAGE_ID,
      CATEGORY_ID: fields.CATEGORY_ID,
      [CFG.F.TIPO_FIN]: fields[CFG.F.TIPO_FIN],
      [CFG.F.FAVORECIDO]: fields[CFG.F.FAVORECIDO],
      [CFG.F.DATA_PREV]: fields[CFG.F.DATA_PREV],
      [CFG.F.COMPETENCIA]: fields[CFG.F.COMPETENCIA],
      [CFG.F.VALOR_PREV]: fields[CFG.F.VALOR_PREV],
      [CFG.F.OBS]: fields[CFG.F.OBS],
    };
    S.deals.unshift(inv);

    return inv;
  }

  function listCardPurchases() {
    // compras são deals com [PURCHASE=1]
    return S.deals.filter(d => tagHas(d[CFG.F.OBS], "PURCHASE"));
  }

  function computeInvoiceTotalsFromPurchases() {
    // retorna Map invKey -> {cardName, y, mo, total, vencDay}
    const totals = new Map();

    for (const d of listCardPurchases()) {
      const obs = d[CFG.F.OBS] || "";
      const cardName = tagGet(obs, "CARD");
      const pdate = tagGet(obs, "PDATE");
      const total = Number(tagGet(obs, "TOTAL") || 0) || 0;
      const n = Number(tagGet(obs, "N") || 1) || 1;

      if (!cardName || !pdate || !total || n < 1) continue;

      const card = CFG.CARDS.find(c => c.name === cardName);
      if (!card) continue;

      const baseYM = calcInvoiceYM(card, pdate);
      if (!baseYM) continue;

      const per = total / n;

      for (let i = 0; i < n; i++) {
        const ym = addMonths(baseYM.y, baseYM.mo, i);
        const key = `${cardName}::${ymKey(ym.y, ym.mo)}`;

        const cur = totals.get(key) || {
          cardName,
          y: ym.y,
          mo: ym.mo,
          total: 0,
          vencDay: card.venc
        };
        cur.total += per;
        totals.set(key, cur);
      }
    }

    return totals;
  }

  async function syncInvoiceTotals() {
    // 1) computa
    const totals = computeInvoiceTotalsFromPurchases();

    // 2) garante faturas existentes (cria se faltar)
    for (const it of totals.values()) {
      await ensureInvoiceDeal(it.cardName, it.y, it.mo, it.vencDay);
    }

    // 3) atualiza valor previsto das faturas
    // (somente se diferente o suficiente)
    const eps = 0.009;

    for (const it of totals.values()) {
      const inv = findInvoiceDeal(it.cardName, it.y, it.mo);
      if (!inv) continue;

      const current = Number(inv[CFG.F.VALOR_PREV] || 0) || 0;
      const next = Number(it.total.toFixed(2));

      if (Math.abs(current - next) > eps) {
        inv[CFG.F.VALOR_PREV] = next;
        await updateDeal(inv.ID, { [CFG.F.VALOR_PREV]: next });
      }
    }
  }

  // ========= FILTROS =========
  function applyFilters() {
    const q = (S.filters.q || "").trim().toLowerCase();
    const allowedDealStages = new Set(Object.values(CFG.STAGES).map(String));

    S.filtered = S.deals.filter(d => {
      // backup: lixo de fila
      const favRaw = String(d[CFG.F.FAVORECIDO] || "");
      const favNorm = favRaw.trim().toUpperCase();
      if (favNorm.startsWith("__QUEUE__")) return false;
      if (favNorm.includes("FILA ATENDIMENTO")) return false;

      if (!allowedDealStages.has(String(d.STAGE_ID || ""))) return false;

      if (S.filters.competencia && String(d[CFG.F.COMPETENCIA] || "") !== String(S.filters.competencia)) return false;
      if (S.filters.tipo && String(d[CFG.F.TIPO_FIN] || "") !== String(S.filters.tipo)) return false;
      if (S.filters.centro && String(d[CFG.F.CENTRO_CUSTO] || "") !== String(S.filters.centro)) return false;
      if (S.filters.statusFin && String(d[CFG.F.STATUS_FIN] || "") !== String(S.filters.statusFin)) return false;

      if (S.filters.stageId) {
        if (String(d.STAGE_ID || "") !== String(S.filters.stageId)) return false;
      } else {
        // oculta CONCLUÍDO por padrão
        if (String(d.STAGE_ID || "") === String(CFG.STAGES.CONCLUIDO)) return false;
      }

      if (q) {
        const hay = [
          d.ID, d.TITLE,
          d[CFG.F.FAVORECIDO],
          d[CFG.F.OBS],
          enumName(CFG.F.CENTRO_CUSTO, d[CFG.F.CENTRO_CUSTO]),
          enumName(CFG.F.CATEGORIA, d[CFG.F.CATEGORIA]),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    renderTable();
    renderTotals();
  }

  // ========= AÇÕES =========
  async function markRealizado(deal) {
    const m = modal(`
      <div class="fin-modal-head">
        <div class="fin-modal-title">Marcar como realizado</div>
        <button class="fin-x" data-close="1">×</button>
      </div>
      <div class="fin-modal-body">
        <div class="fin-grid">
          <div class="fin-field">
            <label>Valor realizado</label>
            <input id="mr-val" placeholder="Ex.: 1500,00" value="${esc(deal[CFG.F.VALOR_REAL] || deal[CFG.F.VALOR_PREV] || "")}" />
          </div>
          <div class="fin-field">
            <label>Data realizada</label>
            <input id="mr-date" placeholder="YYYY-MM-DD" value="${esc(toISODate(deal[CFG.F.DATA_REAL] || makeISODate(new Date().getFullYear(), new Date().getMonth()+1, new Date().getDate())))}" />
          </div>
        </div>

        <div class="fin-hint">Isso move a etapa para “PAGA/RECEBIDA” conforme o tipo.</div>

        <div class="fin-row fin-row--right">
          <button class="fin-btn" data-close="1">Cancelar</button>
          <button class="fin-btn fin-btn--primary" id="mr-ok" data-busylock="1">Salvar</button>
        </div>
      </div>
    `);

    m.q("#mr-ok").addEventListener("click", async () => {
      try {
        setLoading(true);

        const v = parseMoneyBR(m.q("#mr-val").value);
        const dt = toISODate(m.q("#mr-date").value);

        const tipo = deal[CFG.F.TIPO_FIN];
        const stagePaid = paidStageForTipo(tipo);

        const patch = {
          [CFG.F.VALOR_REAL]: v,
          [CFG.F.DATA_REAL]: dt,
        };

        const tipoTxt = (enumName(CFG.F.TIPO_FIN, tipo) || "").toUpperCase();
        if (tipoTxt.includes("DESP")) {
          const idPago = enumIdByValue(CFG.F.STATUS_FIN, "PAGO") || enumIdByValue(CFG.F.STATUS_FIN, "PAGA");
          if (idPago) patch[CFG.F.STATUS_FIN] = idPago;
        } else if (tipoTxt.includes("REC")) {
          const idRec = enumIdByValue(CFG.F.STATUS_FIN, "RECEBIDO") || enumIdByValue(CFG.F.STATUS_FIN, "RECEBIDA");
          if (idRec) patch[CFG.F.STATUS_FIN] = idRec;
        }

        if (stagePaid) patch.STAGE_ID = stagePaid;

        await updateDeal(deal.ID, patch);

        toast("Realizado salvo ✅");
        m.close();
        await refresh();
      } catch (e) {
        toast("Falha ao salvar realizado: " + (e?.message || e), "err");
      } finally {
        setLoading(false);
      }
    });
  }

  async function cancelDeal(deal) {
    const m = modal(`
      <div class="fin-modal-head">
        <div class="fin-modal-title">Cancelar lançamento</div>
        <button class="fin-x" data-close="1">×</button>
      </div>
      <div class="fin-modal-body">
        <div class="fin-hint">Isso move o negócio para a etapa <b>CANCELADO</b>.</div>
        <div class="fin-row fin-row--right">
          <button class="fin-btn" data-close="1">Voltar</button>
          <button class="fin-btn fin-btn--danger" id="c-ok" data-busylock="1">Cancelar</button>
        </div>
      </div>
    `);

    m.q("#c-ok").addEventListener("click", async () => {
      try {
        setLoading(true);
        await updateDeal(deal.ID, { STAGE_ID: CFG.STAGES.CANCELADO });
        toast("Cancelado ✅");
        m.close();
        await refresh();
      } catch (e) {
        toast("Falha ao cancelar: " + (e?.message || e), "err");
      } finally {
        setLoading(false);
      }
    });
  }

  // ========= MODAL: NOVO LANÇAMENTO (avulso) =========
  function openEditModal(deal) {
    const isEdit = !!deal;
    const v = (k) => (deal ? (deal[k] ?? "") : "");

    const html = `
      <div class="fin-modal-head">
        <div class="fin-modal-title">${isEdit ? "Editar lançamento" : "Novo lançamento"}</div>
        <button class="fin-x" data-close="1">×</button>
      </div>

      <div class="fin-modal-body">
        <div class="fin-grid">
          <div class="fin-field">
            <label>Tipo financeiro</label>
            <select id="f-tipo">${buildOptions(S.enums?.[CFG.F.TIPO_FIN]?.items || [], { includeBlank: true, blankText: "Selecione..." })}</select>
          </div>

          <div class="fin-field">
            <label>Competência (mês)</label>
            <select id="f-comp">${buildOptions(S.enums?.[CFG.F.COMPETENCIA]?.items || [], { includeBlank: true, blankText: "Selecione..." })}</select>
          </div>

          <div class="fin-field">
            <label>Data prevista</label>
            <input id="f-dprev" placeholder="YYYY-MM-DD" value="${esc(toISODate(v(CFG.F.DATA_PREV)))}" />
          </div>

          <div class="fin-field">
            <label>Valor previsto</label>
            <input id="f-vprev" placeholder="Ex.: 1500,00" value="${esc(v(CFG.F.VALOR_PREV))}" />
          </div>

          <div class="fin-field">
            <label>Favorecido / Pagador</label>
            <input id="f-fav" placeholder="Ex.: Light, Vivo, Cliente X..." value="${esc(v(CFG.F.FAVORECIDO))}" />
          </div>

          <div class="fin-field">
            <label>Centro de custo</label>
            <select id="f-cc">${buildOptions(S.enums?.[CFG.F.CENTRO_CUSTO]?.items || [], { includeBlank: true, blankText: "—" })}</select>
          </div>

          <div class="fin-field">
            <label>Categoria</label>
            <select id="f-cat">${buildOptions(S.enums?.[CFG.F.CATEGORIA]?.items || [], { includeBlank: true, blankText: "—" })}</select>
          </div>

          <div class="fin-field">
            <label>Forma de pagamento</label>
            <select id="f-forma">${buildOptions(S.enums?.[CFG.F.FORMA_PGTO]?.items || [], { includeBlank: true, blankText: "—" })}</select>
          </div>

          <div class="fin-field">
            <label>Conta bancária / Origem</label>
            <select id="f-conta">${buildOptions(S.enums?.[CFG.F.CONTA]?.items || [], { includeBlank: true, blankText: "—" })}</select>
          </div>

          <div class="fin-field">
            <label>Status financeiro</label>
            <select id="f-status">${buildOptions(S.enums?.[CFG.F.STATUS_FIN]?.items || [], { includeBlank: true, blankText: "—" })}</select>
          </div>
        </div>

        <div class="fin-field" style="margin-top:10px">
          <label>Observações</label>
          <textarea id="f-obs" rows="3" placeholder="Observações...">${esc(v(CFG.F.OBS))}</textarea>
        </div>

        <div class="fin-row fin-row--right" style="margin-top:12px">
          <button class="fin-btn" data-close="1">Cancelar</button>
          <button class="fin-btn fin-btn--primary" id="f-save" data-busylock="1">${isEdit ? "Salvar" : "Criar"}</button>
        </div>

        <div class="fin-hint">
          A etapa inicial será definida automaticamente: despesa → “A PAGAR” / receita → “A RECEBER”.
        </div>
      </div>
    `;

    const m = modal(html);

    m.q("#f-tipo").value = String(v(CFG.F.TIPO_FIN));
    m.q("#f-comp").value = String(v(CFG.F.COMPETENCIA));
    m.q("#f-cc").value = String(v(CFG.F.CENTRO_CUSTO));
    m.q("#f-cat").value = String(v(CFG.F.CATEGORIA));
    m.q("#f-forma").value = String(v(CFG.F.FORMA_PGTO));
    m.q("#f-conta").value = String(v(CFG.F.CONTA));
    m.q("#f-status").value = String(v(CFG.F.STATUS_FIN));

    m.q("#f-save").addEventListener("click", async () => {
      try {
        setLoading(true);

        const tipo = m.q("#f-tipo").value;
        if (!tipo) throw new Error("Selecione o Tipo Financeiro.");

        const payload = {};
        payload[CFG.F.TIPO_FIN] = tipo;
        payload[CFG.F.COMPETENCIA] = m.q("#f-comp").value || "";
        payload[CFG.F.DATA_PREV] = toISODate(m.q("#f-dprev").value || "");
        payload[CFG.F.VALOR_PREV] = parseMoneyBR(m.q("#f-vprev").value || "");
        payload[CFG.F.FAVORECIDO] = (m.q("#f-fav").value || "").trim();
        payload[CFG.F.CENTRO_CUSTO] = m.q("#f-cc").value || "";
        payload[CFG.F.CATEGORIA] = m.q("#f-cat").value || "";
        payload[CFG.F.FORMA_PGTO] = m.q("#f-forma").value || "";
        payload[CFG.F.CONTA] = m.q("#f-conta").value || "";
        payload[CFG.F.STATUS_FIN] = m.q("#f-status").value || "";
        payload[CFG.F.OBS] = (m.q("#f-obs").value || "").trim();

        if (isEdit) {
          await updateDeal(deal.ID, payload);
          toast("Atualizado ✅");
        } else {
          // cria avulso com título padrão
          const fav = payload[CFG.F.FAVORECIDO] || "";
          const tipoTxt = enumName(CFG.F.TIPO_FIN, tipo) || "FIN";
          const fields = {
            TITLE: `${CFG.DEFAULT_TITLE_PREFIX} • ${tipoTxt}${fav ? " • " + fav : ""}`,
            CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID),
            STAGE_ID: initialStageForTipo(tipo) || undefined,
            ...payload
          };
          const id = await createDeal(fields);
          toast("Criado ✅ (ID " + id + ")");
        }

        m.close();
        await refresh();
      } catch (e) {
        toast(e?.message || String(e), "err");
      } finally {
        setLoading(false);
      }
    });
  }

  // ========= MODAL: COMPRA NO CARTÃO =========
  function openCardPurchaseModal() {
    const cardOpts = CFG.CARDS.map(c => `<option value="${esc(c.name)}">${esc(c.name)} (venc ${pad2(c.venc)} • melhor dia ${pad2(c.melhor)})</option>`).join("");

    const html = `
      <div class="fin-modal-head">
        <div class="fin-modal-title">Compra no cartão</div>
        <button class="fin-x" data-close="1">×</button>
      </div>

      <div class="fin-modal-body">
        <div class="fin-grid">
          <div class="fin-field">
            <label>Cartão</label>
            <select id="cp-card">${cardOpts}</select>
          </div>

          <div class="fin-field">
            <label>Data da compra</label>
            <input id="cp-date" placeholder="YYYY-MM-DD" value="${esc(makeISODate(new Date().getFullYear(), new Date().getMonth()+1, new Date().getDate()))}" />
          </div>

          <div class="fin-field">
            <label>Valor total</label>
            <input id="cp-total" placeholder="Ex.: 1200,00" />
          </div>

          <div class="fin-field">
            <label>Parcelas</label>
            <input id="cp-n" type="number" min="1" max="36" value="1" />
          </div>

          <div class="fin-field">
            <label>Descrição (loja/compra)</label>
            <input id="cp-desc" placeholder="Ex.: Google Ads, Suprimentos..." />
          </div>

          <div class="fin-field">
            <label>Centro de custo</label>
            <select id="cp-cc">${buildOptions(S.enums?.[CFG.F.CENTRO_CUSTO]?.items || [], { includeBlank: true, blankText: "—" })}</select>
          </div>

          <div class="fin-field">
            <label>Categoria</label>
            <select id="cp-cat">${buildOptions(S.enums?.[CFG.F.CATEGORIA]?.items || [], { includeBlank: true, blankText: "—" })}</select>
          </div>
        </div>

        <div class="fin-field" style="margin-top:10px">
          <label>Observações</label>
          <textarea id="cp-obs" rows="3" placeholder="Opcional..."></textarea>
        </div>

        <div class="fin-hint">
          Regra: se o dia da compra for maior que o “melhor dia”, entra na próxima fatura.
          A compra ficará em <b>CONCLUÍDO</b> (oculta por padrão) e as faturas recebem o total previsto por mês.
        </div>

        <div class="fin-row fin-row--right" style="margin-top:12px">
          <button class="fin-btn" data-close="1">Cancelar</button>
          <button class="fin-btn fin-btn--primary" id="cp-save" data-busylock="1">Criar compra</button>
        </div>
      </div>
    `;

    const m = modal(html);

    m.q("#cp-save").addEventListener("click", async () => {
      try {
        setLoading(true);

        const cardName = m.q("#cp-card").value;
        const card = CFG.CARDS.find(c => c.name === cardName);
        if (!card) throw new Error("Cartão inválido.");

        const pdate = toISODate(m.q("#cp-date").value);
        if (!isoToParts(pdate)) throw new Error("Data da compra inválida.");

        const total = parseMoneyBR(m.q("#cp-total").value);
        if (!(total > 0)) throw new Error("Informe um valor total válido.");

        const n = Math.max(1, Math.min(36, Number(m.q("#cp-n").value || 1) || 1));

        const desc = (m.q("#cp-desc").value || "").trim();
        const cc = m.q("#cp-cc").value || "";
        const cat = m.q("#cp-cat").value || "";
        const obsUser = (m.q("#cp-obs").value || "").trim();

        const tipoId = tipoDespesaId();
        if (!tipoId) throw new Error("Não achei o enum 'DESPESA' no campo Tipo Financeiro.");

        // compra vai ficar CONCLUÍDO e registrada via tags
        let obs = obsUser ? obsUser : "";
        obs = tagSet(obs, "PURCHASE", "1");
        obs = tagSet(obs, "CARD", cardName);
        obs = tagSet(obs, "PDATE", pdate);
        obs = tagSet(obs, "TOTAL", total.toFixed(2));
        obs = tagSet(obs, "N", String(n));

        const fields = {
          TITLE: purchaseTitle(cardName, desc),
          CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID),
          STAGE_ID: CFG.STAGES.CONCLUIDO, // oculta por padrão
          [CFG.F.TIPO_FIN]: tipoId,
          [CFG.F.FAVORECIDO]: desc ? desc : cardName,
          [CFG.F.VALOR_PREV]: total,
          [CFG.F.CENTRO_CUSTO]: cc,
          [CFG.F.CATEGORIA]: cat,
          [CFG.F.OBS]: obs,
        };

        const newId = await createDeal(fields);
        toast(`Compra criada ✅ (ID ${newId})`);

        // atualiza lista local para já recalcular faturas sem depender do refresh
        S.deals.unshift({
          ID: String(newId),
          TITLE: fields.TITLE,
          STAGE_ID: fields.STAGE_ID,
          CATEGORY_ID: fields.CATEGORY_ID,
          [CFG.F.TIPO_FIN]: fields[CFG.F.TIPO_FIN],
          [CFG.F.FAVORECIDO]: fields[CFG.F.FAVORECIDO],
          [CFG.F.VALOR_PREV]: fields[CFG.F.VALOR_PREV],
          [CFG.F.CENTRO_CUSTO]: fields[CFG.F.CENTRO_CUSTO],
          [CFG.F.CATEGORIA]: fields[CFG.F.CATEGORIA],
          [CFG.F.OBS]: fields[CFG.F.OBS],
        });

        // Recalcula faturas: garante criação e atualiza totais
        await syncInvoiceTotals();

        m.close();
        await refresh();
      } catch (e) {
        toast(e?.message || String(e), "err");
      } finally {
        setLoading(false);
      }
    });
  }

  // ========= CSV =========
  function exportCSV() {
    const rows = S.filtered.map(d => ({
      ID: d.ID,
      TITULO: d.TITLE,
      ETAPA: stageName(d.STAGE_ID),
      TIPO: enumName(CFG.F.TIPO_FIN, d[CFG.F.TIPO_FIN]),
      COMPETENCIA: enumName(CFG.F.COMPETENCIA, d[CFG.F.COMPETENCIA]),
      DATA_PREVISTA: d[CFG.F.DATA_PREV] || "",
      VALOR_PREVISTO: d[CFG.F.VALOR_PREV] || "",
      VALOR_REALIZADO: d[CFG.F.VALOR_REAL] || "",
      DATA_REALIZADA: d[CFG.F.DATA_REAL] || "",
      FAVORECIDO: d[CFG.F.FAVORECIDO] || "",
      CENTRO_CUSTO: enumName(CFG.F.CENTRO_CUSTO, d[CFG.F.CENTRO_CUSTO]),
      CATEGORIA: enumName(CFG.F.CATEGORIA, d[CFG.F.CATEGORIA]),
      FORMA_PAGAMENTO: enumName(CFG.F.FORMA_PGTO, d[CFG.F.FORMA_PGTO]),
      CONTA: enumName(CFG.F.CONTA, d[CFG.F.CONTA]),
      STATUS_FINANCEIRO: enumName(CFG.F.STATUS_FIN, d[CFG.F.STATUS_FIN]),
      OBS: (d[CFG.F.OBS] || "").replace(/\s+/g, " ").trim(),
    }));

    const headers = Object.keys(rows[0] || { ID: "" });
    const csv = [
      headers.join(";"),
      ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replaceAll('"', '""')}"`).join(";"))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `financeiro_pipeline27_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1200);
  }

  // ========= RENDER =========
  function render() {
    root.innerHTML = `
      <div class="fin-app" id="fin-app">
        <div class="fin-top">
          <div class="fin-brand">
            <div class="fin-title">Financeiro CGD</div>
            <div class="fin-sub">
              Pipeline 27 • Deals • <span id="fin-lastsync">—</span>
              <span id="fin-loading" class="fin-loading" style="display:none">Carregando…</span>
              <span class="fin-loading" style="margin-left:8px">CONCLUÍDO fica oculto por padrão</span>
            </div>
          </div>

          <div class="fin-actions">
            <button class="fin-btn fin-btn--primary" id="btn-new" data-busylock="1">NOVO</button>
            <button class="fin-btn" id="btn-card" data-busylock="1">CARTÃO</button>
            <button class="fin-btn" id="btn-refresh" data-busylock="1">ATUALIZAR</button>
            <button class="fin-btn" id="btn-csv" data-busylock="1">EXPORTAR CSV</button>
          </div>
        </div>

        <div class="fin-cards">
          <div class="fin-card">
            <div class="fin-card-k">Total Previsto</div>
            <div class="fin-card-v" id="tot-prev">—</div>
          </div>
          <div class="fin-card">
            <div class="fin-card-k">Total Realizado</div>
            <div class="fin-card-v" id="tot-real">—</div>
          </div>
          <div class="fin-card">
            <div class="fin-card-k">Qtd. Itens (filtrado)</div>
            <div class="fin-card-v" id="tot-count">—</div>
          </div>
        </div>

        <div class="fin-filters">
          <div class="fin-field">
            <label>Busca</label>
            <input id="f-q" placeholder="Favorecido, obs, centro..." />
          </div>

          <div class="fin-field">
            <label>Competência</label>
            <select id="f-comp">${buildOptions(S.enums?.[CFG.F.COMPETENCIA]?.items || [])}</select>
          </div>

          <div class="fin-field">
            <label>Tipo</label>
            <select id="f-tipo">${buildOptions(S.enums?.[CFG.F.TIPO_FIN]?.items || [])}</select>
          </div>

          <div class="fin-field">
            <label>Centro de custo</label>
            <select id="f-centro">${buildOptions(S.enums?.[CFG.F.CENTRO_CUSTO]?.items || [])}</select>
          </div>

          <div class="fin-field">
            <label>Status financeiro</label>
            <select id="f-status">${buildOptions(S.enums?.[CFG.F.STATUS_FIN]?.items || [])}</select>
          </div>

          <div class="fin-field">
            <label>Etapa</label>
            <select id="f-stage">
              <option value="">— Todos (exceto CONCLUÍDO) —</option>
              ${S.stages.map(s => `<option value="${esc(s.STATUS_ID)}">${esc(s.NAME)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead>
              <tr>
                <th style="width:72px">ID</th>
                <th>Favorecido</th>
                <th style="width:130px">Tipo</th>
                <th style="width:130px">Competência</th>
                <th style="width:130px">Data prevista</th>
                <th style="width:140px">Previsto</th>
                <th style="width:140px">Realizado</th>
                <th style="width:180px">Etapa</th>
                <th style="width:170px">Ações</th>
              </tr>
            </thead>
            <tbody id="fin-tbody">
              <tr><td colspan="9" class="fin-muted">Carregando…</td></tr>
            </tbody>
          </table>
        </div>

        <div id="fin-toast-host" class="fin-toast-host"></div>
      </div>
    `;

    el("#btn-new").addEventListener("click", () => openEditModal(null));
    el("#btn-card").addEventListener("click", () => openCardPurchaseModal());
    el("#btn-refresh").addEventListener("click", refresh);
    el("#btn-csv").addEventListener("click", exportCSV);

    const fq = el("#f-q");
    fq.addEventListener("input", () => {
      S.filters.q = fq.value || "";
      applyFilters();
    });

    const bindSel = (id, key) => {
      const s = el(id);
      s.addEventListener("change", () => {
        S.filters[key] = s.value || "";
        applyFilters();
      });
    };
    bindSel("#f-comp", "competencia");
    bindSel("#f-tipo", "tipo");
    bindSel("#f-centro", "centro");
    bindSel("#f-status", "statusFin");
    bindSel("#f-stage", "stageId");
  }

  function renderTable() {
    const tb = el("#fin-tbody");
    if (!tb) return;

    const list = S.filtered || [];
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="9" class="fin-muted">Nenhum item encontrado com os filtros atuais.</td></tr>`;
      return;
    }

    tb.innerHTML = list.slice(0, CFG.PAGE_SIZE).map(d => {
      const fav = d[CFG.F.FAVORECIDO] || "";
      const tipo = enumName(CFG.F.TIPO_FIN, d[CFG.F.TIPO_FIN]);
      const comp = enumName(CFG.F.COMPETENCIA, d[CFG.F.COMPETENCIA]);
      const dtPrev = d[CFG.F.DATA_PREV] ? toISODate(d[CFG.F.DATA_PREV]) : "";
      const vPrev = moneyBR(d[CFG.F.VALOR_PREV]);
      const vReal = moneyBR(d[CFG.F.VALOR_REAL]);
      const st = stageName(d.STAGE_ID);

      return `
        <tr>
          <td class="fin-mono">#${esc(d.ID)}</td>
          <td>
            <div class="fin-strong">${esc(fav || d.TITLE || "")}</div>
            <div class="fin-small fin-muted">${esc(enumName(CFG.F.CENTRO_CUSTO, d[CFG.F.CENTRO_CUSTO]) || "")}</div>
          </td>
          <td>${esc(tipo)}</td>
          <td>${esc(comp)}</td>
          <td class="fin-mono">${esc(dtPrev)}</td>
          <td class="fin-mono">${esc(vPrev)}</td>
          <td class="fin-mono">${esc(vReal)}</td>
          <td>${esc(st)}</td>
          <td>
            <div class="fin-actions-row">
              <button class="fin-mini" data-act="edit" data-id="${esc(d.ID)}">Editar</button>
              <button class="fin-mini fin-mini--ok" data-act="real" data-id="${esc(d.ID)}">Realizar</button>
              <button class="fin-mini fin-mini--danger" data-act="cancel" data-id="${esc(d.ID)}">Cancelar</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tb.querySelectorAll("button[data-act]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const deal = S.deals.find(x => String(x.ID) === String(id));
        if (!deal) return;

        if (act === "edit") openEditModal(deal);
        if (act === "real") await markRealizado(deal);
        if (act === "cancel") await cancelDeal(deal);
      });
    });
  }

  function renderTotals() {
    const list = S.filtered || [];
    let prev = 0, real = 0;

    for (const d of list) {
      prev += Number(d[CFG.F.VALOR_PREV] || 0) || 0;
      real += Number(d[CFG.F.VALOR_REAL] || 0) || 0;
    }

    const a = el("#tot-prev");
    const b = el("#tot-real");
    const c = el("#tot-count");
    if (a) a.textContent = moneyBR(prev);
    if (b) b.textContent = moneyBR(real);
    if (c) c.textContent = String(list.length);

    const ls = el("#fin-lastsync");
    if (ls && S.lastSyncAt) ls.textContent = `Atualizado em ${S.lastSyncAt}`;
  }

  async function refresh() {
    try {
      setLoading(true);

      const all = await listDealsAll();
      S.deals = all || [];

      // recalcula faturas a partir das compras (garante coerência)
      await syncInvoiceTotals();

      const dt = new Date();
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      const mo = String(dt.getMonth() + 1).padStart(2, "0");
      const yy = dt.getFullYear();
      S.lastSyncAt = `${dd}/${mo}/${yy} ${hh}:${mm}`;

      applyFilters();
    } catch (e) {
      toast("Falha ao carregar deals: " + (e?.message || e), "err");
      const tb = el("#fin-tbody");
      if (tb) tb.innerHTML = `<tr><td colspan="9" class="fin-muted">Erro: ${esc(e?.message || e)}</td></tr>`;
    } finally {
      setLoading(false);
    }
  }

  async function boot() {
    root.innerHTML = `
      <div class="fin-app fin-app--boot">
        <div class="fin-card fin-card--boot">
          <div class="fin-title">Financeiro CGD</div>
          <div class="fin-sub">Inicializando…</div>
        </div>
      </div>
    `;

    await ensureAuthIfNeeded();
    await loadMeta();
    render();
    await refresh();
  }

  boot().catch(err => {
    root.innerHTML = `
      <div class="fin-app">
        <div class="fin-card">
          <div class="fin-title">Falha ao iniciar</div>
          <div class="fin-sub">${esc(err?.message || err)}</div>
        </div>
      </div>
    `;
  });

})();
