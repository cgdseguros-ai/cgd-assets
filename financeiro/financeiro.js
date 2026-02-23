/* Financeiro CGD — Pipeline 27 (Deals)
   - Loader Bitrix -> Worker -> GitHub assets
   - Sidebar por Conta (UF_CRM_1770770758)
   - Topbar com logo
   - Rodapé com fotos (user 1,27,15), endereço, créditos, CNPJ/SUSEP
   - Oculta CONCLUÍDO por padrão (acessível no filtro)
   - Remove __QUEUE__/FILA ATENDIMENTO de Favorecido
   - CRUD: Novo/Editar/Realizar/Cancelar
   - CSV
*/
(function () {
  "use strict";

  // ========= CONFIG =========
  const WORKER_BASE = "https://financeiro199702.cgdseguros.workers.dev";

  // Alguns Workers usam /api/<method>, outros /api?method=<method>.
  // Este JS testa automaticamente os dois.
  const API_PATH_MODE = "auto"; // "auto" | "path" | "query"
  const API_BASE = WORKER_BASE.replace(/\/$/, "") + "/api";

  const CFG = {
    DEAL_CATEGORY_ID: 27,

    LOGO_URL:
      "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=1285iby7j41w",

    FOOTER: {
      addressTitle: "Endereço",
      addressText: "Av Ayrton Senna, 2500, SS109, Barra da Tijuca",
      credits: "System created by GRUPO CGD",
      companies: [
        { name: "CGD CORRETORA", meta: "CNPJ 01.654.471/0001-86 • SUSEP 202031791" },
        { name: "CGD BARRA", meta: "CNPJ 53.013.848/0001-11 • SUSEP 242158650" },
      ],
      partnersUserIds: [1, 27, 15],
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
      CENTRO_CUSTO: "UF_CRM_1771801157",
    },

    // Etapas permitidas (Pipeline 27)
    STAGES: {
      DESP_A_PAGAR: "C27:NEW",
      DESP_PAGA: "C27:PREPARATION",
      REC_A_RECEBER: "C27:UC_EQAFD7",
      REC_RECEBIDA: "C27:PREPAYMENT_INVOIC",
      CANCELADO: "C27:EXECUTING",
      CONCLUIDO: "C27:UC_LP2NSK",
    },

    PAGE_SIZE: 120,
    DEFAULT_TITLE_PREFIX: "FIN",
    CURRENCY_PREFIX: "R$ ",
  };

  // ========= STATE =========
  const S = {
    enums: {},
    stages: [],
    deals: [],
    filtered: [],
    partners: [],
    lastSyncAt: null,
    loading: false,
    apiMode: null, // "path" | "query"

    filters: {
      q: "",
      conta: "",
      competencia: "",
      tipo: "",
      centro: "",
      statusFin: "",
      stageId: "", // se vazio, oculta concluído por padrão
    },
  };

  // ========= ROOT =========
  const root = document.getElementById("fin-root") || document.body;

  // ========= UI: Sentinel + Fatal =========
  function showFatal(err) {
    const msg = String(err?.stack || err?.message || err || "Erro desconhecido");
    root.innerHTML = `
      <div style="min-height:100vh;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
        background: radial-gradient(1200px 800px at 20% 20%, rgba(37,99,235,.35), transparent 60%),
                    radial-gradient(900px 650px at 75% 55%, rgba(22,163,74,.22), transparent 60%),
                    linear-gradient(180deg, #0b1020, #070a14);color:#e5e7eb;">
        <div style="max-width:1100px;margin:0 auto;">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${esc(CFG.LOGO_URL)}" alt="CGD" style="width:44px;height:44px;border-radius:14px;background:#fff;padding:6px;object-fit:contain">
            <div>
              <div style="font-weight:950;font-size:16px">Falha ao iniciar o Financeiro</div>
              <div style="opacity:.85;font-weight:800;font-size:12px">Verifique Worker/API e se existe &lt;div id="fin-root"&gt; no HTML.</div>
            </div>
          </div>
          <pre style="margin-top:14px;white-space:pre-wrap;background:rgba(255,255,255,.08);
            border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:12px;overflow:auto">${esc(msg)}</pre>
        </div>
      </div>`;
  }

  window.addEventListener("error", (e) => showFatal(e.error || e.message || e));
  window.addEventListener("unhandledrejection", (e) => showFatal(e.reason || e));

  // ========= HELPERS =========
  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function el(q) { return root.querySelector(q); }
  function els(q) { return Array.from(root.querySelectorAll(q)); }

  function moneyBR(v) {
    const n = Number(v);
    if (!isFinite(n)) return "";
    const fixed = n.toFixed(2);
    const [a, b] = fixed.split(".");
    const withDots = a.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${CFG.CURRENCY_PREFIX}${withDots},${b}`;
  }

  function parseMoneyBR(s) {
    const t = String(s ?? "")
      .trim()
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(t);
    return isFinite(n) ? n : 0;
  }

  function toISODate(d) {
    const s = String(d ?? "").trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return s;
  }

  function nowBR() {
    const dt = new Date();
    const dd = String(dt.getDate()).padStart(2, "0");
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const yy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `${dd}/${mo}/${yy} ${hh}:${mm}`;
  }

  function setLoading(v) {
    S.loading = !!v;
    const badge = el("#fin-loading");
    if (badge) badge.style.display = S.loading ? "inline-flex" : "none";
    els("[data-busylock='1']").forEach((b) => (b.disabled = S.loading));
  }

  function toast(msg, type = "ok") {
    const host = el("#fin-toast-host");
    if (!host) return alert(msg);
    const t = document.createElement("div");
    t.className = `fin-toast fin-toast--${type}`;
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.classList.add("fin-toast--show"), 10);
    setTimeout(() => {
      t.classList.remove("fin-toast--show");
      setTimeout(() => t.remove(), 200);
    }, 3200);
  }

  function modal(html) {
    const wrap = document.createElement("div");
    wrap.className = "fin-modal-wrap";
    wrap.innerHTML = `
      <div class="fin-modal-backdrop" data-close="1"></div>
      <div class="fin-modal">${html}</div>
    `;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-close") === "1") wrap.remove();
    });
    return { node: wrap, close: () => wrap.remove(), q: (s) => wrap.querySelector(s) };
  }

  function buildOptions(items, includeBlank = true, blankText = "— Todos —") {
    const arr = Array.isArray(items) ? items : [];
    const out = [];
    if (includeBlank) out.push(`<option value="">${esc(blankText)}</option>`);
    for (const it of arr) out.push(`<option value="${esc(it.ID)}">${esc(it.VALUE)}</option>`);
    return out.join("");
  }

  function enumName(fieldId, enumId) {
    if (!enumId) return "";
    const list = S.enums?.[fieldId] || [];
    const it = list.find((x) => String(x.ID) === String(enumId));
    return it?.VALUE || String(enumId);
  }

  function stageName(stageId) {
    const it = S.stages.find((x) => String(x.STATUS_ID) === String(stageId));
    return it?.NAME || String(stageId || "");
  }

  // ========= API (Worker Proxy) =========
  async function apiCall(method, payload) {
    const body = JSON.stringify(payload || {});
    const headers = { "content-type": "application/json" };

    async function tryPath() {
      const r = await fetch(`${API_BASE}/${method}`, { method: "POST", headers, body });
      return { r, mode: "path" };
    }
    async function tryQuery() {
      const r = await fetch(`${API_BASE}?method=${encodeURIComponent(method)}`, { method: "POST", headers, body });
      return { r, mode: "query" };
    }

    let attempt;
    if (API_PATH_MODE === "path") attempt = await tryPath();
    else if (API_PATH_MODE === "query") attempt = await tryQuery();
    else {
      // auto: tenta o modo já descoberto; senão tenta path, depois query
      if (S.apiMode === "path") attempt = await tryPath();
      else if (S.apiMode === "query") attempt = await tryQuery();
      else {
        attempt = await tryPath();
        if (!attempt.r.ok) attempt = await tryQuery();
      }
    }

    const txt = await attempt.r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch { /* ignore */ }

    if (!attempt.r.ok) {
      const msg = j?.error_description || j?.error || txt || `HTTP ${attempt.r.status}`;
      throw new Error(msg);
    }
    if (j && j.error) throw new Error(j.error_description || j.error);

    S.apiMode = attempt.mode;
    return j;
  }

  // ========= META =========
  async function loadMeta() {
    // enums
    const fieldsRes = await apiCall("crm.deal.fields", {});
    const fields = fieldsRes?.result || {};

    S.enums = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v && Array.isArray(v.items)) {
        S.enums[k] = v.items.map((it) => ({ ID: String(it.ID), VALUE: String(it.VALUE) }));
      }
    }

    // stages for category 27
    const st = await apiCall("crm.status.list", {
      filter: { ENTITY_ID: `DEAL_STAGE_${CFG.DEAL_CATEGORY_ID}` },
    });

    const allowed = new Set(Object.values(CFG.STAGES).map(String));
    const raw = st?.result || [];
    S.stages = raw
      .map((x) => ({
        STATUS_ID: String(x.STATUS_ID || x.ID || ""),
        NAME: String(x.NAME || ""),
        SORT: Number(x.SORT || 0),
      }))
      .filter((x) => allowed.has(String(x.STATUS_ID)))
      .sort((a, b) => a.SORT - b.SORT);
  }

  // ========= DEALS =========
  async function listDealsAll() {
    const out = [];
    let start = 0;

    const stageArr = [
      CFG.STAGES.DESP_A_PAGAR,
      CFG.STAGES.DESP_PAGA,
      CFG.STAGES.REC_A_RECEBER,
      CFG.STAGES.REC_RECEBIDA,
      CFG.STAGES.CANCELADO,
      CFG.STAGES.CONCLUIDO,
    ];

    while (true) {
      const res = await apiCall("crm.deal.list", {
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
        filter: {
          CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID),
          STAGE_ID: stageArr,
        },
        order: { ID: "DESC" },
        start,
      });

      const chunk = res?.result || [];
      out.push(...chunk);

      const next = res?.next;
      if (next == null) break;
      start = next;
      if (out.length > 20000) break;
    }

    return out;
  }

  async function updateDeal(id, fields) {
    await apiCall("crm.deal.update", { id: String(id), fields });
  }

  async function createDeal(fields) {
    const res = await apiCall("crm.deal.add", { fields });
    return res?.result;
  }

  // ========= FILTERING =========
  function isBadFav(fav) {
    const s = String(fav || "").trim().toUpperCase();
    if (!s) return false;
    if (s.startsWith("__QUEUE__")) return true;
    if (s.includes("FILA ATENDIMENTO")) return true;
    return false;
  }

  function applyFilters() {
    const q = String(S.filters.q || "").trim().toLowerCase();
    const allowedStages = new Set(Object.values(CFG.STAGES).map(String));

    S.filtered = (S.deals || []).filter((d) => {
      if (!allowedStages.has(String(d.STAGE_ID || ""))) return false;
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
        const hay = [
          d.ID, d.TITLE,
          d[CFG.F.FAVORECIDO],
          d[CFG.F.OBS],
          enumName(CFG.F.CONTA, d[CFG.F.CONTA]),
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

  // ========= MODALS =========
  function initialStageForTipo(tipoEnumId) {
    const txt = (enumName(CFG.F.TIPO_FIN, tipoEnumId) || "").toUpperCase();
    if (txt.includes("DESP")) return CFG.STAGES.DESP_A_PAGAR;
    if (txt.includes("REC")) return CFG.STAGES.REC_A_RECEBER;
    return CFG.STAGES.DESP_A_PAGAR;
  }

  function paidStageForTipo(tipoEnumId) {
    const txt = (enumName(CFG.F.TIPO_FIN, tipoEnumId) || "").toUpperCase();
    if (txt.includes("DESP")) return CFG.STAGES.DESP_PAGA;
    if (txt.includes("REC")) return CFG.STAGES.REC_RECEBIDA;
    return "";
  }

  function openEditModal(deal) {
    const isEdit = !!deal;
    const v = (k) => (deal ? (deal[k] ?? "") : "");

    const m = modal(`
      <div class="fin-modal-head">
        <div class="fin-modal-title">${isEdit ? "Editar lançamento" : "Novo lançamento"}</div>
        <button class="fin-x" data-close="1">×</button>
      </div>
      <div class="fin-modal-body">
        <div class="fin-grid">
          <div class="fin-field">
            <label>Tipo Financeiro</label>
            <select id="m-tipo">${buildOptions(S.enums[CFG.F.TIPO_FIN] || [], true, "Selecione...")}</select>
          </div>

          <div class="fin-field">
            <label>Competência (mês)</label>
            <select id="m-comp">${buildOptions(S.enums[CFG.F.COMPETENCIA] || [])}</select>
          </div>

          <div class="fin-field">
            <label>Conta / Origem</label>
            <select id="m-conta">${buildOptions(S.enums[CFG.F.CONTA] || [], true, "—")}</select>
          </div>

          <div class="fin-field">
            <label>Data Prevista</label>
            <input id="m-dprev" placeholder="YYYY-MM-DD" value="${esc(toISODate(v(CFG.F.DATA_PREV)))}">
          </div>

          <div class="fin-field">
            <label>Valor Previsto</label>
            <input id="m-vprev" placeholder="Ex.: 1500,00" value="${esc(v(CFG.F.VALOR_PREV))}">
          </div>

          <div class="fin-field">
            <label>Favorecido / Pagador</label>
            <input id="m-fav" placeholder="Ex.: Light, Vivo, Cliente..." value="${esc(v(CFG.F.FAVORECIDO))}">
          </div>

          <div class="fin-field">
            <label>Centro de custo</label>
            <select id="m-cc">${buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—")}</select>
          </div>

          <div class="fin-field">
            <label>Categoria</label>
            <select id="m-cat">${buildOptions(S.enums[CFG.F.CATEGORIA] || [], true, "—")}</select>
          </div>

          <div class="fin-field">
            <label>Status Financeiro</label>
            <select id="m-status">${buildOptions(S.enums[CFG.F.STATUS_FIN] || [], true, "—")}</select>
          </div>

          <div class="fin-field">
            <label>Forma de pagamento</label>
            <select id="m-forma">${buildOptions(S.enums[CFG.F.FORMA_PGTO] || [], true, "—")}</select>
          </div>
        </div>

        <div class="fin-field" style="margin-top:10px">
          <label>Observações</label>
          <textarea id="m-obs" rows="3">${esc(v(CFG.F.OBS))}</textarea>
        </div>

        <div class="fin-row fin-row--right" style="margin-top:12px">
          <button class="fin-btn" data-close="1">Cancelar</button>
          <button class="fin-btn fin-btn--primary" id="m-save" data-busylock="1">${isEdit ? "Salvar" : "Criar"}</button>
        </div>
      </div>
    `);

    // set values
    m.q("#m-tipo").value = String(v(CFG.F.TIPO_FIN));
    m.q("#m-comp").value = String(v(CFG.F.COMPETENCIA));
    m.q("#m-conta").value = String(v(CFG.F.CONTA));
    m.q("#m-cc").value = String(v(CFG.F.CENTRO_CUSTO));
    m.q("#m-cat").value = String(v(CFG.F.CATEGORIA));
    m.q("#m-status").value = String(v(CFG.F.STATUS_FIN));
    m.q("#m-forma").value = String(v(CFG.F.FORMA_PGTO));

    m.q("#m-save").addEventListener("click", async () => {
      try {
        setLoading(true);

        const tipo = m.q("#m-tipo").value;
        if (!tipo) throw new Error("Selecione o Tipo Financeiro.");

        const fields = {};
        fields[CFG.F.TIPO_FIN] = tipo;
        fields[CFG.F.COMPETENCIA] = m.q("#m-comp").value || "";
        fields[CFG.F.CONTA] = m.q("#m-conta").value || "";
        fields[CFG.F.DATA_PREV] = toISODate(m.q("#m-dprev").value || "");
        fields[CFG.F.VALOR_PREV] = parseMoneyBR(m.q("#m-vprev").value || "");
        fields[CFG.F.FAVORECIDO] = (m.q("#m-fav").value || "").trim();
        fields[CFG.F.CENTRO_CUSTO] = m.q("#m-cc").value || "";
        fields[CFG.F.CATEGORIA] = m.q("#m-cat").value || "";
        fields[CFG.F.STATUS_FIN] = m.q("#m-status").value || "";
        fields[CFG.F.FORMA_PGTO] = m.q("#m-forma").value || "";
        fields[CFG.F.OBS] = (m.q("#m-obs").value || "").trim();

        if (isBadFav(fields[CFG.F.FAVORECIDO])) {
          throw new Error("Favorecido inválido (parece FILA/QUEUE).");
        }

        if (isEdit) {
          await updateDeal(deal.ID, fields);
          toast("Atualizado ✅");
        } else {
          const fav = fields[CFG.F.FAVORECIDO] || "";
          const tipoTxt = enumName(CFG.F.TIPO_FIN, tipo) || "FIN";
          const stage = initialStageForTipo(tipo);

          const newId = await createDeal({
            TITLE: `${CFG.DEFAULT_TITLE_PREFIX} • ${tipoTxt}${fav ? " • " + fav : ""}`,
            CATEGORY_ID: String(CFG.DEAL_CATEGORY_ID),
            STAGE_ID: stage,
            ...fields,
          });

          toast("Criado ✅ (ID " + newId + ")");
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
            <input id="r-val" placeholder="Ex.: 1500,00" value="${esc(deal[CFG.F.VALOR_REAL] || deal[CFG.F.VALOR_PREV] || "")}">
          </div>
          <div class="fin-field">
            <label>Data realizada</label>
            <input id="r-date" placeholder="YYYY-MM-DD" value="${esc(toISODate(deal[CFG.F.DATA_REAL] || ""))}">
          </div>
        </div>

        <div class="fin-row fin-row--right" style="margin-top:12px">
          <button class="fin-btn" data-close="1">Cancelar</button>
          <button class="fin-btn fin-btn--primary" id="r-save" data-busylock="1">Salvar</button>
        </div>
      </div>
    `);

    m.q("#r-save").addEventListener("click", async () => {
      try {
        setLoading(true);
        const v = parseMoneyBR(m.q("#r-val").value || "");
        const dt = toISODate(m.q("#r-date").value || "");
        const stagePaid = paidStageForTipo(deal[CFG.F.TIPO_FIN]);

        const fields = {};
        fields[CFG.F.VALOR_REAL] = v;
        fields[CFG.F.DATA_REAL] = dt;
        if (stagePaid) fields.STAGE_ID = stagePaid;

        await updateDeal(deal.ID, fields);
        toast("Realizado salvo ✅");
        m.close();
        await refresh();
      } catch (e) {
        toast("Falha ao salvar: " + (e?.message || e), "err");
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
        <div class="fin-row fin-row--right" style="margin-top:12px">
          <button class="fin-btn" data-close="1">Voltar</button>
          <button class="fin-btn fin-btn--danger" id="c-save" data-busylock="1">Cancelar</button>
        </div>
      </div>
    `);

    m.q("#c-save").addEventListener("click", async () => {
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

  // ========= CSV =========
  function exportCSV() {
    const rows = (S.filtered || []).map((d) => ({
      ID: d.ID,
      TITULO: d.TITLE,
      ETAPA: stageName(d.STAGE_ID),
      TIPO: enumName(CFG.F.TIPO_FIN, d[CFG.F.TIPO_FIN]),
      COMPETENCIA: enumName(CFG.F.COMPETENCIA, d[CFG.F.COMPETENCIA]),
      CONTA: enumName(CFG.F.CONTA, d[CFG.F.CONTA]),
      DATA_PREVISTA: toISODate(d[CFG.F.DATA_PREV] || ""),
      VALOR_PREVISTO: d[CFG.F.VALOR_PREV] ?? "",
      VALOR_REALIZADO: d[CFG.F.VALOR_REAL] ?? "",
      DATA_REALIZADA: toISODate(d[CFG.F.DATA_REAL] || ""),
      FAVORECIDO: d[CFG.F.FAVORECIDO] || "",
      CENTRO_CUSTO: enumName(CFG.F.CENTRO_CUSTO, d[CFG.F.CENTRO_CUSTO]),
      CATEGORIA: enumName(CFG.F.CATEGORIA, d[CFG.F.CATEGORIA]),
      STATUS_FINANCEIRO: enumName(CFG.F.STATUS_FIN, d[CFG.F.STATUS_FIN]),
      OBS: String(d[CFG.F.OBS] || "").replace(/\s+/g, " ").trim(),
    }));

    const headers = Object.keys(rows[0] || { ID: "" });
    const csv = [
      headers.join(";"),
      ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replaceAll('"', '""')}"`).join(";")),
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

  // ========= AVATARS =========
  function initialsFromName(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "";
    const b = parts[1]?.[0] || "";
    return (a + b).toUpperCase() || "CG";
  }

  async function resolveUserPhotoUrl(user) {
    const raw = user?.PERSONAL_PHOTO || user?.PERSONAL_PHOTO_URL || user?.PHOTO || "";
    if (!raw) return "";
    if (typeof raw === "string" && raw.startsWith("http")) return raw;

    // Se for ID numérico, tenta disk.file.get (precisa scope disk)
    const fileId = Number(raw);
    if (!Number.isFinite(fileId) || fileId <= 0) return "";

    try {
      const r = await apiCall("disk.file.get", { id: fileId });
      const dl = r?.result?.DOWNLOAD_URL || "";
      return dl || "";
    } catch {
      return "";
    }
  }

  async function loadPartners() {
    try {
      const r = await apiCall("user.get", { ID: CFG.FOOTER.partnersUserIds });
      S.partners = r?.result || [];
    } catch {
      S.partners = [];
    }
  }

  async function renderPartnersAvatars() {
    const host = el("#fin-avatars");
    if (!host) return;

    const byId = new Map((S.partners || []).map((u) => [String(u.ID), u]));
    const html = [];

    for (const id of CFG.FOOTER.partnersUserIds) {
      const u = byId.get(String(id)) || {};
      const name = `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() || `User ${id}`;
      const url = await resolveUserPhotoUrl(u);

      if (url) {
        html.push(`<div class="fin-avatar" title="${esc(name)}"><img src="${esc(url)}" alt="${esc(name)}"></div>`);
      } else {
        html.push(`<div class="fin-avatar" title="${esc(name)}">${esc(initialsFromName(name))}</div>`);
      }
    }
    host.innerHTML = html.join("");
  }

  // ========= RENDER =========
  function renderSidebarAccounts() {
    const host = el("#fin-side-accounts");
    if (!host) return;

    const items = S.enums?.[CFG.F.CONTA] || [];
    const sel = String(S.filters.conta || "");

    const btn = (id, label, active) => `
      <button class="fin-side-item ${active ? "is-active" : ""}" data-conta="${esc(id)}">
        <span class="fin-dot"></span><span class="fin-side-label">${esc(label)}</span>
      </button>`;

    let html = btn("", "Todas as contas", !sel);
    for (const it of items) html += btn(String(it.ID), String(it.VALUE), sel === String(it.ID));

    host.innerHTML = html;

    host.querySelectorAll("[data-conta]").forEach((b) => {
      b.addEventListener("click", () => {
        S.filters.conta = b.getAttribute("data-conta") || "";
        renderSidebarAccounts();
        applyFilters();
      });
    });
  }

  function render() {
    root.innerHTML = `
      <div class="fin-shell">
        <aside class="fin-side">
          <div class="fin-side-brand">
            <img class="fin-brand-logo" src="${esc(CFG.LOGO_URL)}" alt="CGD">
            <div class="fin-brand-txt">
              <div class="fin-brand-title">Financeiro CGD</div>
              <div class="fin-brand-sub">Deals • Pipeline 27</div>
            </div>
          </div>

          <div class="fin-side-block">
            <div class="fin-side-h">Conta / Origem</div>
            <div id="fin-side-accounts" class="fin-side-list"></div>
          </div>

          <div class="fin-side-block fin-side-muted">
            <div class="fin-side-h">Padrão</div>
            <div class="fin-side-note">CONCLUÍDO fica oculto (mas aparece no filtro “Etapa”).</div>
          </div>
        </aside>

        <main class="fin-main">
          <header class="fin-topbar">
            <div class="fin-top-left">
              <img class="fin-top-logo" src="${esc(CFG.LOGO_URL)}" alt="CGD">
              <div class="fin-top-txt">
                <div class="fin-top-title">Financeiro CGD</div>
                <div class="fin-top-sub">
                  <span id="fin-lastsync">—</span>
                  <span id="fin-loading" class="fin-loading" style="display:none">Carregando…</span>
                </div>
              </div>
            </div>

            <div class="fin-top-actions">
              <div class="fin-search">
                <span aria-hidden="true">🔎</span>
                <input id="f-q" placeholder="Buscar por favorecido, categoria, obs..." />
              </div>
              <button class="fin-btn fin-btn--primary" id="btn-new" data-busylock="1">NOVO</button>
              <button class="fin-btn" id="btn-refresh" data-busylock="1">ATUALIZAR</button>
              <button class="fin-btn" id="btn-csv" data-busylock="1">CSV</button>
            </div>
          </header>

          <section class="fin-panel">
            <div class="fin-panel-inner">
              <div class="fin-kpis">
                <div class="fin-kpi"><div class="fin-kpi-k">Total Previsto</div><div class="fin-kpi-v" id="tot-prev">—</div></div>
                <div class="fin-kpi"><div class="fin-kpi-k">Total Realizado</div><div class="fin-kpi-v" id="tot-real">—</div></div>
                <div class="fin-kpi"><div class="fin-kpi-k">Qtd. Itens</div><div class="fin-kpi-v" id="tot-count">—</div></div>
              </div>

              <div class="fin-filters">
                <div class="fin-field"><label>Competência</label>
                  <select id="f-comp">${buildOptions(S.enums[CFG.F.COMPETENCIA] || [])}</select>
                </div>
                <div class="fin-field"><label>Tipo</label>
                  <select id="f-tipo">${buildOptions(S.enums[CFG.F.TIPO_FIN] || [])}</select>
                </div>
                <div class="fin-field"><label>Centro de custo</label>
                  <select id="f-centro">${buildOptions(S.enums[CFG.F.CENTRO_CUSTO] || [], true, "—")}</select>
                </div>
                <div class="fin-field"><label>Status financeiro</label>
                  <select id="f-status">${buildOptions(S.enums[CFG.F.STATUS_FIN] || [], true, "—")}</select>
                </div>
                <div class="fin-field"><label>Etapa</label>
                  <select id="f-stage">
                    <option value="">— Todos (exceto CONCLUÍDO) —</option>
                    ${S.stages.map((s) => `<option value="${esc(s.STATUS_ID)}">${esc(s.NAME)}</option>`).join("")}
                  </select>
                </div>
              </div>

              <div class="fin-table-wrap">
                <table class="fin-table">
                  <thead>
                    <tr>
                      <th style="width:76px">ID</th>
                      <th>Favorecido</th>
                      <th style="width:180px">Conta</th>
                      <th style="width:130px">Tipo</th>
                      <th style="width:130px">Competência</th>
                      <th style="width:130px">Data Prev.</th>
                      <th style="width:140px">Previsto</th>
                      <th style="width:140px">Realizado</th>
                      <th style="width:170px">Etapa</th>
                      <th style="width:200px">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="fin-tbody">
                    <tr><td colspan="10" class="fin-muted">Carregando…</td></tr>
                  </tbody>
                </table>
              </div>

              <div id="fin-toast-host" class="fin-toast-host"></div>
            </div>
          </section>

          <footer class="fin-footerbar">
            <div class="fin-footer-left">
              <div class="k">${esc(CFG.FOOTER.addressTitle)}</div>
              <div class="v">${esc(CFG.FOOTER.addressText)}</div>
            </div>
            <div class="fin-footer-center">${esc(CFG.FOOTER.credits)}</div>
            <div class="fin-footer-right">
              ${CFG.FOOTER.companies.map(c => `
                <div class="fin-footer-box">
                  <div class="t">${esc(c.name)}</div>
                  <div class="s">${esc(c.meta)}</div>
                </div>`).join("")}
            </div>
            <div class="fin-footer-avatars" id="fin-avatars" aria-label="Sócios"></div>
          </footer>
        </main>
      </div>
    `;

    // events
    el("#btn-new").addEventListener("click", () => openEditModal(null));
    el("#btn-refresh").addEventListener("click", refresh);
    el("#btn-csv").addEventListener("click", exportCSV);

    el("#f-q").addEventListener("input", (e) => { S.filters.q = e.target.value || ""; applyFilters(); });

    const bindSel = (id, key) => {
      el(id).addEventListener("change", () => { S.filters[key] = el(id).value || ""; applyFilters(); });
    };
    bindSel("#f-comp", "competencia");
    bindSel("#f-tipo", "tipo");
    bindSel("#f-centro", "centro");
    bindSel("#f-status", "statusFin");
    bindSel("#f-stage", "stageId");

    renderSidebarAccounts();
  }

  function renderTable() {
    const tb = el("#fin-tbody");
    if (!tb) return;

    const list = S.filtered || [];
    if (!list.length) {
      tb.innerHTML = `<tr><td colspan="10" class="fin-muted">Nenhum item encontrado com os filtros atuais.</td></tr>`;
      return;
    }

    const rows = list.slice(0, CFG.PAGE_SIZE).map((d) => {
      const fav = d[CFG.F.FAVORECIDO] || d.TITLE || "";
      return `
        <tr>
          <td class="fin-mono">#${esc(d.ID)}</td>
          <td>
            <div class="fin-strong">${esc(fav)}</div>
            <div class="fin-small fin-muted">${esc(enumName(CFG.F.CATEGORIA, d[CFG.F.CATEGORIA]) || "")}</div>
          </td>
          <td>${esc(enumName(CFG.F.CONTA, d[CFG.F.CONTA]) || "")}</td>
          <td>${esc(enumName(CFG.F.TIPO_FIN, d[CFG.F.TIPO_FIN]) || "")}</td>
          <td>${esc(enumName(CFG.F.COMPETENCIA, d[CFG.F.COMPETENCIA]) || "")}</td>
          <td class="fin-mono">${esc(toISODate(d[CFG.F.DATA_PREV] || ""))}</td>
          <td class="fin-mono">${esc(moneyBR(d[CFG.F.VALOR_PREV]))}</td>
          <td class="fin-mono">${esc(moneyBR(d[CFG.F.VALOR_REAL]))}</td>
          <td>${esc(stageName(d.STAGE_ID))}</td>
          <td>
            <div class="fin-actions-row">
              <button class="fin-mini" data-act="edit" data-id="${esc(d.ID)}">Editar</button>
              <button class="fin-mini fin-mini--ok" data-act="real" data-id="${esc(d.ID)}">Realizar</button>
              <button class="fin-mini fin-mini--danger" data-act="cancel" data-id="${esc(d.ID)}">Cancelar</button>
            </div>
          </td>
        </tr>`;
    });

    tb.innerHTML = rows.join("");

    tb.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const deal = (S.deals || []).find((x) => String(x.ID) === String(id));
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
    el("#tot-prev").textContent = moneyBR(prev);
    el("#tot-real").textContent = moneyBR(real);
    el("#tot-count").textContent = String(list.length);

    if (S.lastSyncAt) el("#fin-lastsync").textContent = `Atualizado em ${S.lastSyncAt} • API: ${S.apiMode || "?"}`;
  }

  async function refresh() {
    try {
      setLoading(true);
      S.deals = await listDealsAll();
      S.lastSyncAt = nowBR();
      applyFilters();
    } catch (e) {
      toast("Falha ao carregar deals: " + (e?.message || e), "err");
      const tb = el("#fin-tbody");
      if (tb) tb.innerHTML = `<tr><td colspan="10" class="fin-muted">Erro: ${esc(e?.message || e)}</td></tr>`;
    } finally {
      setLoading(false);
    }
  }

  // ========= BOOT =========
  async function boot() {
    // Sentinel
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:14px;
      background: radial-gradient(1200px 800px at 20% 20%, rgba(37,99,235,.35), transparent 60%),
                  radial-gradient(900px 650px at 75% 55%, rgba(22,163,74,.22), transparent 60%),
                  linear-gradient(180deg, #0b1020, #070a14);">
        <div style="border-radius:18px;background:rgba(255,255,255,.10);
        border:1px solid rgba(255,255,255,.12);color:#e5e7eb;padding:14px 16px;
        box-shadow:0 10px 30px rgba(0,0,0,.20);max-width:860px">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${esc(CFG.LOGO_URL)}" alt="CGD" style="width:44px;height:44px;border-radius:14px;background:#fff;padding:6px;object-fit:contain">
            <div>
              <div style="font-weight:950">Financeiro CGD</div>
              <div style="opacity:.85;font-weight:800;font-size:12px">JS iniciou ✅ (bootstrap)</div>
            </div>
          </div>
          <div style="margin-top:10px;opacity:.85;font-weight:800;font-size:12px">Conectando ao Worker/API…</div>
        </div>
      </div>
    `;

    await loadMeta();       // enums + stages
    render();               // monta UI
    await loadPartners();   // users 1,27,15
    await renderPartnersAvatars();
    await refresh();        // lista deals
  }

  boot().catch(showFatal);
})();
