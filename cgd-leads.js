/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - Sem localStorage (contagens, histórico, fila e “puxados hoje” vêm do Bitrix)
   - Fila multi-PC via QUEUE_JSON (Pipeline 27 / Stage QUEUE_JSON)
   - Modais modernizados
   - Logo maior (+70%)
   - Rodapé do Bitrix forçado para baixo
   - Alarme: 3 bipes
   - “Carregando...” não pisca mais (mantém o conteúdo anterior em falhas de rede)
*/
(function(){
  "use strict";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    // Webhook REST (o mesmo que você já usa)
    WEBHOOK: "COLE_AQUI_O_SEU_WEBHOOK_COM_BARRA_NO_FINAL", // ex: https://b24-xxxx.bitrix24.com.br/rest/1/xxxxxx/

    // Painel (Leads) — Categoria/Pipeline
    LEADS_CATEGORY_ID: 17,

    // Campos UF usados no Follow-up
    UF_PRAZO: "UF_CRM_1768175087",

    // Fila multi-PC via PIPELINE 27 (controle)
    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",          // QUEUE_JSON → C27:UC_SVUYIO
      UF_QUEUE_JSON: "UF_CRM_1771293519", // QUEUE_JSON (campo)
      TITLE_KEY: "__QUEUE__CGD__"         // vamos achar o card pelo título contendo isso
    },

    // Logo (aumentado ~70%)
    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/c77325321d1ad38e8012b995a5f4e8dd/showFile/?&token=e6lxlp1bz9nz",

    // Refresh
    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 7000,
    REFRESH_QUEUE_MS: 2500,

    // Limites
    LIMIT_NEW: 30,
    LIMIT_USER_HISTORY: 25,

    // Usuárias (as do painel)
    USERS: [
      { name:"ALINE", id:15 },
      { name:"ADRIANA", id:19 },
      { name:"ANDREYNA", id:17 },
      { name:"MARIANA", id:23 },
      { name:"JOSIANE", id:811 },
      { name:"BRUNA LUISA", id:3081 },
      { name:"FERNANDA SILVA", id:3083 },
      { name:"LIVIA ALVES", id:3079 },
      { name:"NICOLLE BELMONTE", id:3085 },
      { name:"ANNA CLARA", id:3389 },
      { name:"GABRIEL", id:815 },
      { name:"BEATRIZ", id:3387 },
    ],

    // “Novo Lead” (como identificar no Bitrix):
    // Se você já tinha um filtro/stage específico no script antigo, ajuste aqui:
    NEW_LEADS_FILTER: {
      // Exemplo comum: filtrar por stage (em categoria 17) que representa “NOVO LEAD”.
      // Se você souber o STAGE_ID exato, coloque:
      // STAGE_ID: "C17:NEW"  // (exemplo)
      //
      // Se não souber, deixamos sem STAGE_ID e o painel mostra os mais recentes.
      STAGE_ID: null
    }
  };

  // =========================
  // Helpers DOM
  // =========================
  const $ = (q, el=document)=> el.querySelector(q);
  const $$ = (q, el=document)=> Array.from(el.querySelectorAll(q));
  const esc = (s)=> String(s??"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
  const clamp = (n,a,b)=> Math.max(a, Math.min(b,n));
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));

  function nowBRTime(){
    try{ return new Date().toLocaleTimeString("pt-BR"); }catch(_){ return ""; }
  }
  function todayISOStart(){
    const d = new Date();
    d.setHours(0,0,0,0);
    // Bitrix costuma aceitar "YYYY-MM-DDTHH:mm:ss" (sem Z) ou "YYYY-MM-DD"
    // vamos mandar "YYYY-MM-DDT00:00:00"
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da= String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}T00:00:00`;
  }
  function isoFromLocalInput(v){
    // input datetime-local retorna "YYYY-MM-DDTHH:MM"
    if(!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!m) return "";
    const y=+m[1], mo=+m[2]-1, d=+m[3], hh=+m[4], mi=+m[5];
    const dt = new Date(y, mo, d, hh, mi, 0, 0);
    if(Number.isNaN(dt.getTime())) return "";
    // enviar ISO “com Z” é ok também
    return dt.toISOString();
  }

  // =========================
  // Bitrix webhook client
  // =========================
  function toPairs(prefix, obj, out){
    out = out || [];
    if(obj === null || obj === undefined) return out;
    if(typeof obj === "object" && !Array.isArray(obj)){
      for(const k of Object.keys(obj)){
        const key = prefix ? `${prefix}[${k}]` : k;
        toPairs(key, obj[k], out);
      }
      return out;
    }
    if(Array.isArray(obj)){
      for(let i=0;i<obj.length;i++){
        const key = prefix ? `${prefix}[${i}]` : String(i);
        toPairs(key, obj[i], out);
      }
      return out;
    }
    out.push([prefix, String(obj)]);
    return out;
  }

  async function bx(method, params={}){
    const pairs = toPairs("", params, []);
    const body = new URLSearchParams();
    for(const [k,v] of pairs){ if(k) body.append(k, v); }

    const resp = await fetch(CONFIG.WEBHOOK + method, {
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},
      body
    });

    const data = await resp.json().catch(()=> ({}));
    if(!resp.ok) throw new Error(`HTTP ${resp.status} em ${method}`);
    if(data && data.error) throw new Error(data.error_description || data.error);
    return data.result;
  }

  async function bxListAll(method, params, max=120){
    // paginação start=
    let start = 0;
    let out = [];
    while(true){
      const r = await bx(method, { ...params, start });
      // alguns métodos retornam {items:[], next: ...}; outros retornam array direto
      if(Array.isArray(r)){
        out = out.concat(r);
        break;
      }
      if(r && Array.isArray(r.items)){
        out = out.concat(r.items);
        if(!r.next) break;
        start = r.next;
      }else{
        break;
      }
      if(out.length >= max) break;
    }
    return out.slice(0, max);
  }

  // =========================
  // Audio — 3 bipes
  // =========================
  function tripleBeep(){
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return;
      const ctx = new AC();
      const t0 = ctx.currentTime;
      const make = (t)=>{
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.20);
      };
      make(t0 + 0.00);
      make(t0 + 0.28);
      make(t0 + 0.56);
      setTimeout(()=>{ try{ ctx.close(); }catch(_){} }, 1200);
    }catch(_){}
  }

  // =========================
  // UI / CSS
  // =========================
  function injectCSS(){
    const css = `
#cgdApp{
  --radius:18px;
  --border: rgba(30,40,70,.12);
  --text: rgba(18,26,40,.92);
  --muted: rgba(18,26,40,.62);
  --card: rgba(255,255,255,.82);
  --card2: rgba(255,255,255,.92);
  --shadow: 0 10px 30px rgba(20,30,60,.10);

  min-height: calc(100vh - 60px);
  padding: 10px 12px 90px;
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
  color: var(--text);
  background:
    radial-gradient(900px 600px at 15% 20%, rgba(176,140,255,.18), transparent 55%),
    radial-gradient(900px 600px at 85% 20%, rgba(120,210,255,.14), transparent 55%),
    radial-gradient(900px 650px at 55% 95%, rgba(255,150,200,.12), transparent 60%),
    linear-gradient(135deg, #f7f3ff, #f3fbff 50%, #fff7fb);
}

.cgdTop{
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,.72);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  box-shadow: var(--shadow);
}
.cgdTopLeft{ display:flex; align-items:center; gap:10px; min-width: 280px; }
.cgdLogo{
  width: 41px; height: 41px; /* ~70% maior que 24 */
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.10);
  object-fit: cover;
  background: #fff;
}
.cgdTitle{ font-weight: 950; letter-spacing:.2px; font-size: 13px; white-space: nowrap; }
.cgdTopRight{ display:flex; gap:8px; align-items:center; flex-wrap: wrap; justify-content: flex-end; }
.cgdPill{
  border: 1px solid var(--border);
  background: rgba(255,255,255,.78);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 900;
}
.cgdBtn{
  cursor:pointer;
  border: 1px solid rgba(30,40,70,.14);
  background: rgba(255,255,255,.86);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 950;
}
.cgdBtn:active{ transform: translateY(1px); }

.cgdGrid{
  margin-top: 12px;
  display:grid;
  grid-template-columns: 1.05fr 1.95fr;
  gap: 12px;
}
.cgdCol{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255,255,255,.62);
  box-shadow: var(--shadow);
  overflow: hidden;
  min-height: 68vh;
  display:flex;
  flex-direction: column;
}
.cgdColHead{
  padding: 10px 12px;
  background: rgba(255,255,255,.78);
  border-bottom: 1px solid var(--border);
  display:flex;
  align-items:flex-start;
  justify-content: space-between;
  gap: 10px;
}
.cgdColHead .hTitle{
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.3px;
  text-transform: uppercase;
  line-height: 1.25;
  width: 100%;
}
.cgdColHead .hSub{
  font-size: 11px;
  color: var(--muted);
  font-weight: 800;
  margin-top: 2px;
  width: 100%;
}
.cgdColHead .hActions{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }

.cgdList{
  padding: 10px;
  display:flex;
  flex-direction: column;
  gap: 10px;
  overflow:auto;
  min-height: 0;
}
.cgdCard{
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card2);
  box-shadow: 0 8px 20px rgba(20,30,60,.08);
  padding: 10px 10px 10px;
}
.cgdCardRow{
  display:flex;
  align-items:flex-start;
  justify-content: space-between;
  gap:10px;
}
.cgdLeadName{
  font-weight: 950;
  font-size: 14px;
  line-height: 1.2;
  word-break: break-word;
  flex: 1 1 auto;
}
.cgdBadges{
  display:flex;
  gap:6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.cgdBadge{
  font-size: 10px;
  font-weight: 950;
  border: 1px solid rgba(30,40,70,.12);
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,.9);
}
.cgdActions{
  margin-top: 10px;
  display:flex;
  gap:8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.cgdMiniBtn{
  cursor:pointer;
  border: 1px solid rgba(30,40,70,.14);
  background: rgba(255,255,255,.92);
  border-radius: 12px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 950;
}
.cgdMiniBtn.primary{ background: rgba(120,210,255,.25); }
.cgdMiniBtn.danger{ background: rgba(255,80,120,.16); border-color: rgba(255,80,120,.30); }

.cgdAlertBox{
  border: 1px solid rgba(255,80,140,.35);
  border-radius: 16px;
  padding: 12px;
  background: linear-gradient(135deg, rgba(255,210,230,.75), rgba(220,240,255,.70));
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}
.cgdAlertBox .txt{
  font-weight: 950;
  font-size: 12px;
  line-height: 1.25;
  width: 100%;
}
.cgdAlertBox .txt small{
  display:block;
  margin-top: 4px;
  font-size: 11px;
  color: rgba(18,26,40,.70);
  font-weight: 900;
}

.cgdBottom{
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 80;
  background: rgba(255,255,255,.76);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(30,40,70,.14);
  padding: 10px 12px;
  display:flex;
  flex-direction: column;
  gap: 10px;
}
.cgdQueueRow{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.cgdQueueChip{
  border: 1px solid rgba(30,40,70,.14);
  background: rgba(255,255,255,.9);
  border-radius: 999px;
  padding: 7px 10px;
  font-weight: 950;
  font-size: 12px;
}

.cgdStatusLine{
  font-size: 11px;
  color: rgba(18,26,40,.60);
  font-weight: 900;
}

.cgdOffline{
  display:none;
  margin-top: 6px;
  font-size: 11px;
  font-weight: 950;
  color: rgba(160,0,40,.82);
}

/* ===== Modals modernos ===== */
.cgdModalOverlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.28);
  backdrop-filter: blur(4px);
  z-index: 200;
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 16px;
}
.cgdModal{
  width: min(980px, 96vw);
  max-height: min(88vh, 900px);
  background: rgba(255,255,255,.94);
  border: 1px solid rgba(30,40,70,.16);
  border-radius: 20px;
  box-shadow: 0 24px 70px rgba(20,30,60,.22);
  overflow:hidden;
  display:flex;
  flex-direction: column;
}
.cgdModalHead{
  padding: 12px 14px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgba(30,40,70,.12);
  background: rgba(255,255,255,.75);
}
.cgdModalTitle{ font-weight: 950; font-size: 13px; }
.cgdModalBody{
  padding: 12px 14px;
  overflow: auto;
  min-height: 0;
}
.cgdModalFoot{
  padding: 12px 14px;
  border-top: 1px solid rgba(30,40,70,.12);
  display:flex;
  gap: 10px;
  justify-content:flex-end;
  flex-wrap: wrap;
  background: rgba(255,255,255,.75);
}
.cgdInput, .cgdSelect{
  border: 1px solid rgba(30,40,70,.18);
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 900;
  font-size: 12px;
  background: rgba(255,255,255,.95);
}
.cgdRow{
  display:flex; gap:10px; align-items:center; flex-wrap:wrap;
}
.cgdTable{
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(30,40,70,.12);
}
.cgdTable th, .cgdTable td{
  padding: 10px 10px;
  border-bottom: 1px solid rgba(30,40,70,.10);
  font-size: 12px;
}
.cgdTable th{ text-align:left; font-weight: 950; background: rgba(245,248,255,.8); }
.cgdTable tr:last-child td{ border-bottom: 0; }

/* ===== Forçar rodapé do Bitrix no final ===== */
.bitrix-footer{
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  top: auto !important;
  z-index: 5 !important;
}
body{ padding-bottom: 90px !important; }

/* Responsivo */
@media (max-width: 1100px){
  .cgdGrid{ grid-template-columns: 1fr; }
  .cgdTopLeft{ min-width: unset; }
}
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  // =========================
  // Modal system
  // =========================
  function openModal(title, bodyHTML, footHTML){
    closeModal();
    const ov = document.createElement("div");
    ov.className = "cgdModalOverlay";
    ov.innerHTML = `
      <div class="cgdModal" role="dialog" aria-modal="true">
        <div class="cgdModalHead">
          <div class="cgdModalTitle">${esc(title)}</div>
          <button class="cgdBtn" data-close-modal>Fechar</button>
        </div>
        <div class="cgdModalBody">${bodyHTML||""}</div>
        <div class="cgdModalFoot">${footHTML||`<button class="cgdBtn" data-close-modal>Fechar</button>`}</div>
      </div>
    `;
    ov.addEventListener("click", (e)=>{
      if(e.target === ov) closeModal();
      const c = e.target.closest("[data-close-modal]");
      if(c) closeModal();
    });
    document.body.appendChild(ov);
    document.addEventListener("keydown", escClose, {capture:true});
  }
  function escClose(e){
    if(e.key === "Escape"){ closeModal(); }
  }
  function closeModal(){
    const ov = $(".cgdModalOverlay");
    if(ov) ov.remove();
    document.removeEventListener("keydown", escClose, {capture:true});
  }

  // =========================
  // State (somente RAM)
  // =========================
  const state = {
    soundOn: true,
    lastNewLeadId: null,
    newLeads: [],
    stats: { day:0, month:0 },
    userStats: {}, // id -> {pulledToday, last:[...]}
    queue: { order:[], updatedAt:0 },
    netOk: true
  };

  // =========================
  // Mount
  // =========================
  function mount(){
    let root = document.getElementById("cgd-leads-root");
    if(!root){
      root = document.createElement("div");
      root.id = "cgd-leads-root";
      document.body.prepend(root);
    }
    root.innerHTML = `
      <div id="cgdApp">
        <div class="cgdTop">
          <div class="cgdTopLeft">
            <img class="cgdLogo" src="${esc(CONFIG.LOGO_URL)}" alt="CGD" />
            <div class="cgdTitle">PAINEL DE LEADS • CGD CORRETORA</div>
          </div>
          <div class="cgdTopRight">
            <div class="cgdPill" id="pillDay">Leads do dia: 0</div>
            <div class="cgdPill" id="pillMonth">Leads do mês: 0</div>
            <button class="cgdBtn" id="btnGet">GET (Equipes)</button>
            <button class="cgdBtn" id="btnManage">Gerenciar Usuária</button>
            <button class="cgdBtn" id="btnQueue">Fila</button>
            <button class="cgdBtn" id="btnRefresh">Atualizar</button>
            <button class="cgdBtn" id="btnSound">Som: ON</button>
          </div>
        </div>

        <div class="cgdGrid">
          <section class="cgdCol" id="colNew">
            <div class="cgdColHead">
              <div style="width:100%">
                <div class="hTitle">NOVOS LEADS • PENDENTES</div>
                <div class="hSub">Somente status: <b>NOVO LEAD</b></div>
              </div>
              <div class="hActions">
                <button class="cgdBtn" id="btnBatch">Transferir em lote</button>
                <button class="cgdBtn" id="btnRefreshNew">Atualizar</button>
              </div>
            </div>
            <div class="cgdList" id="listNew">
              <div class="cgdAlertBox" id="alertNew" style="display:none">
                <div class="txt">
                  🚨 <b>NOVO LEAD</b>
                  <small>Alarme sonoro (3 bipes) enquanto existir lead em “NOVO LEAD”.</small>
                </div>
                <button class="cgdBtn" id="btnSilence">Silenciar</button>
              </div>
              <div class="cgdOffline" id="offlineNew">Sem conexão agora. Mantendo os dados atuais.</div>
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>

          <section class="cgdCol" id="colWho">
            <div class="cgdColHead">
              <div style="width:100%">
                <div class="hTitle">QUEM PEGOU HOJE</div>
                <div class="hSub">Cards por usuária (ordem: última que puxou → fila → fora da fila)</div>
              </div>
              <div class="hActions">
                <button class="cgdBtn" id="btnHideUsers">Ocultar usuárias</button>
                <button class="cgdBtn" id="btnRefreshWho">Atualizar</button>
              </div>
            </div>
            <div class="cgdList" id="listWho">
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>
        </div>

        <div class="cgdBottom">
          <div class="cgdQueueRow" id="queueRow">
            <div class="cgdQueueChip"><b>Fila de atendimento</b></div>
            <div class="cgdQueueChip" id="queueHint">Fila vazia. Clique em Fila e depois em Montar fila.</div>
          </div>
          <div class="cgdQueueRow">
            <button class="cgdBtn" id="btnQueueReset">Resetar</button>
            <button class="cgdBtn" id="btnNext">Próxima disponível</button>
            <div class="cgdStatusLine" id="statusLine">Atualizado: —</div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================
  // Data: NEW LEADS
  // =========================
  async function fetchNewLeads(){
    // Busca deals da categoria 17 (idealmente no stage NOVO LEAD)
    const filter = { CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID };
    if(CONFIG.NEW_LEADS_FILTER.STAGE_ID){
      filter.STAGE_ID = CONFIG.NEW_LEADS_FILTER.STAGE_ID;
    }
    // ordena por ID desc para pegar os mais recentes
    const items = await bxListAll("crm.deal.list", {
      filter,
      order: { ID: "DESC" },
      select: ["ID","TITLE","DATE_CREATE","DATE_MODIFY","ASSIGNED_BY_ID","STAGE_ID","UF_*"]
    }, CONFIG.LIMIT_NEW);

    return items || [];
  }

  // =========================
  // Data: STATS (day/month) — por movimentação (aproximação via DATE_MODIFY)
  // =========================
  async function fetchStats(){
    const startToday = todayISOStart();
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,"0");
    const monthStart = `${y}-${m}-01T00:00:00`;

    const dayItems = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        ">DATE_MODIFY": startToday
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID"]
    }, 200);

    const monthItems = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        ">DATE_MODIFY": monthStart
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID"]
    }, 500);

    return { day: (dayItems||[]).length, month: (monthItems||[]).length };
  }

  // =========================
  // Data: User history (puxados hoje + últimos)
  // =========================
  async function fetchUserHistory(userId){
    const startToday = todayISOStart();
    // “puxados hoje” aproximado por DATE_MODIFY + ASSIGNED_BY_ID
    const today = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        "ASSIGNED_BY_ID": String(userId),
        ">DATE_MODIFY": startToday
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","DATE_MODIFY","STAGE_ID","ASSIGNED_BY_ID"]
    }, 80);

    const last = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
        "ASSIGNED_BY_ID": String(userId)
      },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","DATE_MODIFY","STAGE_ID","ASSIGNED_BY_ID"]
    }, CONFIG.LIMIT_USER_HISTORY);

    return {
      pulledToday: (today||[]).length,
      last: (last||[])
    };
  }

  // =========================
  // Data: Queue JSON via Pipeline 27
  // =========================
  async function ensureQueueDeal(){
    // acha um deal “controle” no pipeline 27 / stage QUEUE_JSON
    const items = await bxListAll("crm.deal.list", {
      filter: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        "%TITLE": CONFIG.QUEUE.TITLE_KEY
      },
      order: { ID:"DESC" },
      select: ["ID","TITLE", CONFIG.QUEUE.UF_QUEUE_JSON, "DATE_MODIFY"]
    }, 5);

    if(items && items[0]) return items[0];

    // cria
    const id = await bx("crm.deal.add", {
      fields: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        TITLE: `${CONFIG.QUEUE.TITLE_KEY} FILA ATENDIMENTO`,
        [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify({ v:1, order:[], updatedAt: Date.now() })
      }
    });
    const created = await bx("crm.deal.get", { id: String(id) });
    return created;
  }

  function parseQueue(json){
    try{
      const o = JSON.parse(json || "{}");
      const order = Array.isArray(o.order) ? o.order : [];
      const updatedAt = +o.updatedAt || 0;
      return { order, updatedAt };
    }catch(_){
      return { order:[], updatedAt:0 };
    }
  }

  async function fetchQueue(){
    const deal = await ensureQueueDeal();
    const raw = deal && deal[CONFIG.QUEUE.UF_QUEUE_JSON];
    return { dealId: String(deal.ID), ...parseQueue(raw) };
  }

  async function saveQueue(dealId, order){
    const payload = { v:1, order: order || [], updatedAt: Date.now() };
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify(payload) }
    });
  }

  // =========================
  // Render
  // =========================
  function renderNewLeads(items){
    const list = $("#listNew");
    if(!list) return;

    // mantém alertBox + offline
    const alert = $("#alertNew");
    const offline = $("#offlineNew");

    // remove cards antigos (mas preserva os dois primeiros nós se existirem)
    // estratégia: recriar tudo após o alertBox
    const nodesToKeep = [];
    if(alert) nodesToKeep.push(alert);
    if(offline) nodesToKeep.push(offline);

    list.innerHTML = "";
    nodesToKeep.forEach(n => list.appendChild(n));

    // alerta se houver leads
    const has = (items||[]).length > 0;
    if(alert) alert.style.display = has ? "flex" : "none";

    if(!has){
      const empty = document.createElement("div");
      empty.style.opacity = ".75";
      empty.style.fontWeight = "900";
      empty.textContent = "Nenhum lead para mostrar.";
      list.appendChild(empty);
      return;
    }

    (items||[]).forEach(it=>{
      const id = String(it.ID||"");
      const title = String(it.TITLE||"").trim() || `Lead #${id}`;
      // deixa o nome sempre na 1ª linha e sem cortar
      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div class="cgdLeadName">${esc(title)}</div>
          <div style="font-weight:950; font-size:12px; opacity:.7">ID: ${esc(id)}</div>
        </div>
        <div class="cgdBadges">
          <span class="cgdBadge">STAGE: ${esc(it.STAGE_ID||"—")}</span>
          <span class="cgdBadge">MOD: ${esc((it.DATE_MODIFY||"").replace("T"," ").slice(0,19) || "—")}</span>
        </div>
        <div class="cgdActions">
          <button class="cgdMiniBtn danger" data-discard="${esc(id)}">DESCARTAR</button>
          <button class="cgdMiniBtn primary" data-grab="${esc(id)}">PEGAR</button>
        </div>
      `;
      list.appendChild(card);
    });
  }

  function renderStats(stats){
    $("#pillDay").textContent = `Leads do dia: ${stats.day||0}`;
    $("#pillMonth").textContent = `Leads do mês: ${stats.month||0}`;
  }

  function renderWho(users){
    const list = $("#listWho");
    if(!list) return;
    list.innerHTML = "";

    users.forEach(u=>{
      const us = state.userStats[u.id] || { pulledToday:0, last:[] };
      const last1 = us.last && us.last[0] ? `Último: ${us.last[0].TITLE || ("#"+us.last[0].ID)}` : "Último: —";
      const last2 = us.last && us.last[1] ? `Anterior: ${us.last[1].TITLE || ("#"+us.last[1].ID)}` : "Anterior: —";

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div style="font-weight:950">${esc(u.name)} <span style="opacity:.65;font-weight:900">(${esc(u.id)})</span></div>
          <div style="display:flex; gap:8px; align-items:center">
            <span class="cgdBadge">puxados hoje: ${esc(us.pulledToday||0)}</span>
            <button class="cgdMiniBtn" data-open-user="${esc(u.id)}">Abrir</button>
          </div>
        </div>
        <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">${esc(last1)}</div>
        <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">${esc(last2)}</div>
      `;
      list.appendChild(card);
    });
  }

  function renderQueue(){
    const row = $("#queueRow");
    const hint = $("#queueHint");
    if(!row || !hint) return;

    // limpa chips antigos (mantém o primeiro chip “Fila de atendimento”)
    const keep = row.firstElementChild;
    row.innerHTML = "";
    if(keep) row.appendChild(keep);

    const order = state.queue.order || [];
    if(order.length === 0){
      hint.textContent = "Fila vazia. Clique em Fila e depois em Montar fila.";
      row.appendChild(hint);
      return;
    }

    hint.textContent = "";
    row.appendChild(hint);

    order.forEach((id, idx)=>{
      const u = CONFIG.USERS.find(x=> String(x.id)===String(id));
      const chip = document.createElement("div");
      chip.className = "cgdQueueChip";
      chip.innerHTML = `<b>${esc(u ? u.name : ("USER "+id))}</b> <span style="opacity:.65">#${idx+1}</span>`;
      row.appendChild(chip);
    });
  }

  function setStatus(txt){
    const el = $("#statusLine");
    if(el) el.textContent = txt;
  }

  function setOffline(flag){
    state.netOk = !flag;
    const off = $("#offlineNew");
    if(off) off.style.display = flag ? "block" : "none";
  }

  // =========================
  // Actions: PEGAR / DESCARTAR / TRANSFERIR
  // =========================
  async function actionAssign(dealId, userId){
    // Aqui é o ponto que você já tinha no script antigo (mudar responsável e, se necessário, STAGE).
    // Mantive simples: só muda o responsável.
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { ASSIGNED_BY_ID: String(userId) }
    });
  }

  async function actionSetPrazo(dealId, iso){
    await bx("crm.deal.update", {
      id: String(dealId),
      fields: { [CONFIG.UF_PRAZO]: iso }
    });
  }

  // =========================
  // Modals
  // =========================
  function modalGetEquipes(){
    const body = `
      <div style="font-weight:900; opacity:.8; margin-bottom:10px">
        Este modal é “GET (Equipes)” — aqui você pode colocar atalhos, regras e ações rápidas.
      </div>
      <div class="cgdRow">
        <button class="cgdBtn" data-close-modal>Ok</button>
      </div>
    `;
    openModal("GET (Equipes)", body);
  }

  async function modalQueue(){
    const q = await fetchQueue().catch(()=>null);
    if(!q) return openModal("Fila", `<div style="font-weight:900;color:#a00">Falha ao carregar fila agora.</div>`);

    const current = q.order || [];
    const options = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    const body = `
      <div style="font-weight:950; margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Adicionar:</label>
        <select class="cgdSelect" id="qAddSel">${options}</select>
        <button class="cgdBtn" id="qAddBtn">Adicionar na fila</button>
        <button class="cgdBtn" id="qBuildBtn">Montar fila (todas)</button>
      </div>

      <table class="cgdTable">
        <thead><tr><th>#</th><th>Usuária</th><th>Ações</th></tr></thead>
        <tbody id="qTbody">
          ${
            current.length
              ? current.map((id, i)=>{
                  const u = CONFIG.USERS.find(x=>String(x.id)===String(id));
                  return `<tr>
                    <td>${i+1}</td>
                    <td><b>${esc(u?u.name:("USER "+id))}</b> <span style="opacity:.65">(${esc(id)})</span></td>
                    <td>
                      <button class="cgdBtn" data-q-up="${esc(i)}">↑</button>
                      <button class="cgdBtn" data-q-down="${esc(i)}">↓</button>
                      <button class="cgdBtn" data-q-del="${esc(i)}">Remover</button>
                    </td>
                  </tr>`;
                }).join("")
              : `<tr><td colspan="3" style="opacity:.75;font-weight:900">Fila vazia</td></tr>`
          }
        </tbody>
      </table>

      <div style="margin-top:10px;font-size:11px;font-weight:900;opacity:.7">
        Atualizado: ${q.updatedAt ? new Date(q.updatedAt).toLocaleString("pt-BR") : "—"}
      </div>
    `;

    openModal("FILA", body, `
      <button class="cgdBtn" data-close-modal>Fechar</button>
    `);

    const addBtn = $("#qAddBtn");
    const buildBtn = $("#qBuildBtn");
    const sel = $("#qAddSel");

    addBtn && addBtn.addEventListener("click", async ()=>{
      const id = sel.value;
      const next = (q.order||[]).slice();
      if(!next.includes(id)) next.push(id);
      await saveQueue(q.dealId, next);
      closeModal();
      await hardRefreshAll();
    });

    buildBtn && buildBtn.addEventListener("click", async ()=>{
      const next = CONFIG.USERS.map(u=> String(u.id));
      await saveQueue(q.dealId, next);
      closeModal();
      await hardRefreshAll();
    });

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const up = e.target.closest("[data-q-up]");
      const down = e.target.closest("[data-q-down]");
      const del = e.target.closest("[data-q-del]");
      if(!up && !down && !del) return;

      const idx = +((up||down||del).getAttribute("data-q-up") || (up||down||del).getAttribute("data-q-down") || (up||down||del).getAttribute("data-q-del"));
      const next = (q.order||[]).slice();
      if(del){
        next.splice(idx,1);
      }else if(up){
        if(idx>0){ const t=next[idx-1]; next[idx-1]=next[idx]; next[idx]=t; }
      }else if(down){
        if(idx<next.length-1){ const t=next[idx+1]; next[idx+1]=next[idx]; next[idx]=t; }
      }
      await saveQueue(q.dealId, next);
      closeModal();
      await hardRefreshAll();
    });
  }

  async function modalManageUser(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    // puxa histórico real do Bitrix (sem storage)
    let hist;
    try{
      hist = await fetchUserHistory(u.id);
    }catch(err){
      return openModal(`GERENCIAR USUÁRIA • ${u.name}`, `<div style="font-weight:900;color:#a00">Falha ao carregar agora. Mantendo painel.</div>`);
    }

    const rows = (hist.last||[]).map(it=>{
      const id = String(it.ID);
      const title = it.TITLE || ("Lead #"+id);
      const dm = (it.DATE_MODIFY||"").replace("T"," ").slice(0,19);
      const optUsers = CONFIG.USERS.map(x=>{
        const sel = String(x.id)===String(u.id) ? "" : "";
        return `<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.id)})</option>`;
      }).join("");

      return `<tr>
        <td><b>${esc(title)}</b><div style="opacity:.7;font-weight:900;font-size:11px">ID: ${esc(id)} • ${esc(dm||"—")}</div></td>
        <td>
          <div class="cgdRow">
            <input class="cgdInput" type="datetime-local" data-prazo="${esc(id)}" />
            <button class="cgdBtn" data-save-prazo="${esc(id)}">Salvar prazo</button>
          </div>
        </td>
        <td>
          <div class="cgdRow">
            <select class="cgdSelect" data-move-to="${esc(id)}">${optUsers}</select>
            <button class="cgdBtn" data-do-move="${esc(id)}">Transferir</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    const body = `
      <div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:950">Aqui você controla os leads da usuária e cria FOLLOW-UP (prazo em ${esc(CONFIG.UF_PRAZO)}).</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Puxados hoje: <b>${esc(hist.pulledToday||0)}</b></div>
        <div class="cgdBadge">Últimos encontrados: <b>${esc((hist.last||[]).length)}</b></div>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th>Lead</th>
            <th>FOLLOW-UP (prazo)</th>
            <th>Transferir lead</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows || `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`
          }
        </tbody>
      </table>
    `;

    openModal(`GERENCIAR USUÁRIA • ${u.name} (${u.id})`, body);

    $("#muRefresh")?.addEventListener("click", async ()=>{
      closeModal();
      await modalManageUser(userId);
    });

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const sp = e.target.closest("[data-save-prazo]");
      const mv = e.target.closest("[data-do-move]");
      try{
        if(sp){
          const dealId = sp.getAttribute("data-save-prazo");
          const inp = $(`input[data-prazo="${CSS.escape(dealId)}"]`, $(".cgdModalBody"));
          const iso = isoFromLocalInput(inp?.value || "");
          if(!iso) return alert("Preencha a data/hora corretamente (ex.: 2026-02-18 14:30).");
          sp.disabled = true;
          await actionSetPrazo(dealId, iso);
          await hardRefreshAll();
          alert("Prazo salvo ✅");
        }
        if(mv){
          const dealId = mv.getAttribute("data-do-move");
          const sel = $(`select[data-move-to="${CSS.escape(dealId)}"]`, $(".cgdModalBody"));
          const toId = sel?.value;
          if(!toId) return;
          mv.disabled = true;
          await actionAssign(dealId, toId);
          await hardRefreshAll();
          alert("Transferido ✅");
        }
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantendo o painel; tente novamente.");
      }finally{
        if(sp) sp.disabled = false;
        if(mv) mv.disabled = false;
      }
    });
  }

  async function modalBatchTransfer(){
    // Carrega lista atual de “novos leads”
    const items = state.newLeads || [];
    const ops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Filtrar por operadora:</label>
        <input class="cgdInput" id="btOper" placeholder="Ex.: MEDSENIOR" />
        <label style="font-weight:950">Transferir para:</label>
        <select class="cgdSelect" id="btUser">${ops}</select>
        <button class="cgdBtn" id="btApply">Aplicar filtro</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Leads listados: <b id="btCount">${esc(items.length)}</b></div>
      </div>

      <table class="cgdTable">
        <thead><tr><th>Selecionar</th><th>Lead</th></tr></thead>
        <tbody id="btTbody">
          ${
            items.length ? items.map(it=>`
              <tr>
                <td><input type="checkbox" data-bt-id="${esc(it.ID)}" checked /></td>
                <td><b>${esc(it.TITLE||("Lead #"+it.ID))}</b> <span style="opacity:.65;font-weight:900">ID: ${esc(it.ID)}</span></td>
              </tr>
            `).join("") : `<tr><td colspan="2" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`
          }
        </tbody>
      </table>
    `;

    openModal("TRANSFERIR EM LOTE", body, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
      <button class="cgdBtn" id="btDo">Transferir selecionados</button>
    `);

    const tbody = $("#btTbody");
    const countEl = $("#btCount");

    function applyFilter(){
      const q = ($("#btOper").value||"").trim().toUpperCase();
      let filtered = items;
      if(q){
        filtered = items.filter(it=>{
          // tenta achar “OPERADORA” em TITLE como aproximação
          return String(it.TITLE||"").toUpperCase().includes(q);
        });
      }
      countEl.textContent = String(filtered.length);

      tbody.innerHTML = filtered.length ? filtered.map(it=>`
        <tr>
          <td><input type="checkbox" data-bt-id="${esc(it.ID)}" checked /></td>
          <td><b>${esc(it.TITLE||("Lead #"+it.ID))}</b> <span style="opacity:.65;font-weight:900">ID: ${esc(it.ID)}</span></td>
        </tr>
      `).join("") : `<tr><td colspan="2" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    $("#btApply")?.addEventListener("click", applyFilter);

    $("#btDo")?.addEventListener("click", async ()=>{
      const toId = $("#btUser").value;
      const ids = $$("input[type=checkbox][data-bt-id]", tbody)
        .filter(x=>x.checked)
        .map(x=> x.getAttribute("data-bt-id"));

      if(ids.length === 0) return alert("Selecione pelo menos 1 lead.");
      try{
        $("#btDo").disabled = true;
        for(const id of ids){
          await actionAssign(id, toId);
          await sleep(120);
        }
        closeModal();
        await hardRefreshAll();
        alert("Transferência concluída ✅");
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel; tente novamente.");
      }finally{
        $("#btDo").disabled = false;
      }
    });
  }

  async function modalPickLead(dealId){
    const uops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");
    const body = `
      <div style="font-weight:950;margin-bottom:10px">Escolha quem vai pegar este lead</div>
      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Usuária:</label>
        <select class="cgdSelect" id="pickUser">${uops}</select>
      </div>
      <div style="font-size:11px;font-weight:900;opacity:.75">
        Ao confirmar, o lead muda o responsável (e a contagem/histórico virá do Bitrix).
      </div>
    `;
    openModal("PEGAR LEAD", body, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
      <button class="cgdBtn" id="pickGo">Confirmar</button>
    `);

    $("#pickGo")?.addEventListener("click", async ()=>{
      try{
        const uid = $("#pickUser").value;
        $("#pickGo").disabled = true;
        await actionAssign(dealId, uid);
        closeModal();
        await hardRefreshAll();
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel; tente novamente.");
      }finally{
        $("#pickGo").disabled = false;
      }
    });
  }

  // =========================
  // Refresh orchestration
  // =========================
  async function refreshNewLeads(){
    try{
      const items = await fetchNewLeads();
      setOffline(false);

      // alerta sonoro somente quando entra novo (ID mudou)
      const newest = items && items[0] ? String(items[0].ID) : null;
      if(newest && newest !== state.lastNewLeadId){
        state.lastNewLeadId = newest;
        if(state.soundOn) tripleBeep();
      }
      state.newLeads = items || [];
      renderNewLeads(state.newLeads);

    }catch(err){
      // não derruba UI — mantém o que já estava
      console.warn("new leads fetch failed", err);
      setOffline(true);
    }
  }

  async function refreshStats(){
    try{
      const s = await fetchStats();
      state.stats = s;
      renderStats(s);
    }catch(err){
      console.warn("stats failed", err);
      // mantém
    }
  }

  async function refreshUsers(){
    try{
      const jobs = CONFIG.USERS.map(async u=>{
        const h = await fetchUserHistory(u.id);
        state.userStats[u.id] = h;
      });
      await Promise.all(jobs);
      renderWho(CONFIG.USERS);
    }catch(err){
      console.warn("user stats failed", err);
      // mantém
    }
  }

  async function refreshQueue(){
    try{
      const q = await fetchQueue();
      state.queue = { order: q.order||[], updatedAt: q.updatedAt||0, dealId: q.dealId };
      renderQueue();
    }catch(err){
      console.warn("queue failed", err);
      // mantém
    }
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()})`);
    await Promise.allSettled([refreshNewLeads(), refreshStats(), refreshUsers(), refreshQueue()]);
    setStatus(`Atualizado: ${nowBRTime()}`);
  }

  // =========================
  // Events
  // =========================
  function wire(){
    $("#btnSound")?.addEventListener("click", ()=>{
      state.soundOn = !state.soundOn;
      $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;
    });

    $("#btnSilence")?.addEventListener("click", ()=>{
      state.soundOn = false;
      $("#btnSound").textContent = "Som: OFF";
    });

    $("#btnRefresh")?.addEventListener("click", hardRefreshAll);
    $("#btnRefreshNew")?.addEventListener("click", refreshNewLeads);
    $("#btnRefreshWho")?.addEventListener("click", refreshUsers);

    $("#btnGet")?.addEventListener("click", modalGetEquipes);
    $("#btnManage")?.addEventListener("click", ()=>{
      // abre seletor
      const opts = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})</option>`).join("");
      openModal("GERENCIAR USUÁRIA", `
        <div class="cgdRow">
          <label style="font-weight:950">Selecione:</label>
          <select class="cgdSelect" id="muSel">${opts}</select>
          <button class="cgdBtn" id="muOpen">Abrir</button>
        </div>
      `);
      $("#muOpen")?.addEventListener("click", ()=>{
        const id = $("#muSel").value;
        closeModal();
        modalManageUser(id);
      });
    });

    $("#btnQueue")?.addEventListener("click", modalQueue);

    $("#btnBatch")?.addEventListener("click", modalBatchTransfer);

    $("#btnNext")?.addEventListener("click", async ()=>{
      try{
        const q = await fetchQueue();
        const order = (q.order||[]).slice();
        if(order.length===0) return alert("Fila vazia.");
        const nextId = order.shift();
        await saveQueue(q.dealId, order);
        await hardRefreshAll();
        const u = CONFIG.USERS.find(x=>String(x.id)===String(nextId));
        alert(`Próxima: ${u?u.name:("USER "+nextId)}`);
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel; tente novamente.");
      }
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      try{
        const q = await fetchQueue();
        await saveQueue(q.dealId, []);
        await hardRefreshAll();
      }catch(err){
        console.error(err);
        alert("Falha agora. Mantive o painel; tente novamente.");
      }
    });

    // Delegação para botões dos cards
    document.addEventListener("click", (e)=>{
      const g = e.target.closest("[data-grab]");
      const d = e.target.closest("[data-discard]");
      const ou = e.target.closest("[data-open-user]");

      if(g){
        const id = g.getAttribute("data-grab");
        modalPickLead(id);
      }
      if(d){
        alert("DESCARTAR: me diga qual regra você usa no Bitrix (mudar stage para PERDIDO?) que eu implemento 100%.");
      }
      if(ou){
        const uid = ou.getAttribute("data-open-user");
        modalManageUser(uid);
      }
    });

    // Ocultar usuárias (modal moderno)
    $("#btnHideUsers")?.addEventListener("click", ()=>{
      const body = `
        <div style="font-weight:950;margin-bottom:10px">Ocultar/mostrar cards de usuárias</div>
        <div style="font-weight:900;opacity:.75">(Se quiser, eu adiciono a persistência disso no Bitrix também, em vez de storage.)</div>
      `;
      openModal("OCULTAR USUÁRIAS", body);
    });
  }

  // =========================
  // Start
  // =========================
  async function start(){
    if(!CONFIG.WEBHOOK || CONFIG.WEBHOOK.includes("COLE_AQUI")){
      const sentinel = document.getElementById("cgd-sentinel");
      if(sentinel) sentinel.textContent = "⚠️ Configure CONFIG.WEBHOOK no arquivo cgd-leads.v3.js";
      return;
    }

    injectCSS();
    mount();
    wire();

    $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;

    await hardRefreshAll();

    // loops (sem piscar “Carregando…”)
    setInterval(refreshNewLeads, CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }

})();
