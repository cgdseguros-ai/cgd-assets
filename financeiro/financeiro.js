/* Financeiro CGD — Deals / Pipeline (CATEGORY) 27
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

    // ✅ IDs reais das etapas (Pipeline 27)
    STAGES: {
      DESP_A_PAGAR: "C27:NEW",
      DESP_PAGA: "C27:PREPARATION",
      REC_A_RECEBER: "C27:UC_EQAFD7",
      REC_RECEBIDA: "C27:PREPAYMENT_INVOIC",
      CANCELADO: "C27:EXECUTING",
      CONCLUIDO: "C27:UC_LP2NSK",
    },

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

  function nowISODate() {
    const dt = new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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

    // stages pipeline 27: ENTITY_ID correto
    const st = await api("crm.status.list", {
      filter: { ENTITY_ID: `DEAL_STAGE_${CFG.DEAL_CATEGORY_ID}` }
    });
    const rawStages = st?.result || [];
    if (!Array.isArray(rawStages)) throw new Error("Não consegui carregar as etapas da Pipeline 27.");

    // ✅ whitelist por IDs (somente as 6 que você autorizou)
    const allowedStageIds = new Set(Object.values(CFG.STAGES).map(String));

    S.stages = rawStages.map(x => ({
      STATUS_ID: x.STATUS_ID || x.ID || x.id,
      NAME: x.NAME || x.name,
      SORT: Number(x.SORT || x.sort || 0),
    })).filter(stg => allowedStageIds.has(String(stg.STATUS_ID)));

    S.stages.sort((a, b) => (a.SORT - b.SORT));
  }

  // ========= STAGE CHOOSERS (por ID fixo) =========
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
          // ✅ só traz registros financeiros (elimina __QUEUE__ e afins)
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
      if (all.length > 10000) break;
    }
    return all;
  }

  // ✅ Ocultar CONCLUÍDO por padrão + remover lixo de fila (backup)
  function applyFilters() {
    const q = (S.filters.q || "").trim().toLowerCase();

    S.filtered = S.deals.filter(d => {
      const favRaw = String(d[CFG.F.FAVORECIDO] || "");
      const favUp = favRaw.toUpperCase();
      if (favRaw.startsWith("__QUEUE__")) return false;
      if (favUp.includes("FILA ATENDIMENTO")) return false;

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

  async function createDealFromForm(values) {
    const tipoId = values[CFG.F.TIPO_FIN] || "";
    const stage = initialStageForTipo(tipoId);

    const fav = values[CFG.F.FAVORECIDO] || "";
    const tipoTxt = enumName(CFG.F.TIPO_FIN, tipoId) || "FIN";
    const title = `${CFG.DEFAULT_TITLE_PREFIX} • ${tipoTxt}${fav ? " • " + fav : ""}`;

    const fields = {
      TITLE: title,
      CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID),
      STAGE_ID: stage || undefined,
      ...values,
    };

    const res = await api("crm.deal.add", { fields });
    return res?.result;
  }

  async function updateDeal(id, values) {
    await api("crm.deal.update", { id: String(id), fields: values });
  }

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
            <input id="mr-date" placeholder="YYYY-MM-DD" value="${esc(toISODate(deal[CFG.F.DATA_REAL] || nowISODate()))}" />
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

        if (!isEdit) {
          const st = initialStageForTipo(tipo);
          if (st) payload.STAGE_ID = st;
        }

        if (isEdit) {
          await updateDeal(deal.ID, payload);
          toast("Atualizado ✅");
        } else {
          const id = await createDealFromForm(payload);
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
