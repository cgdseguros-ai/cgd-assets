/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - Sem localStorage (contagens, histórico, fila e “puxados hoje” vêm do Bitrix)
   - Fila multi-PC via QUEUE_JSON (Pipeline 27 / Stage QUEUE_JSON)
   - Modais modernizados
   - Logo maior (+70%)
   - Rodapé fixo (barra inferior do painel)
   - Alarme: 3 bipes
   - Em falha de rede: mantém dados já renderizados (não “pisca carregando”)
*/
(function(){
  "use strict";

  // ====== FATAL UI (anti tela branca) ======
  function showFatal(err){
    try{
      var root = document.getElementById("cgd-leads-root") || document.body;
      var pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.style.background = "#fff";
      pre.style.border = "1px solid rgba(0,0,0,.12)";
      pre.style.borderRadius = "12px";
      pre.style.padding = "12px";
      pre.style.maxWidth = "1100px";
      pre.style.overflow = "auto";
      pre.textContent = String(err && (err.stack || err.message || err) || err);

      root.innerHTML = "";
      var box = document.createElement("div");
      box.style.padding = "14px";
      box.style.fontFamily = "system-ui,-apple-system,Segoe UI,Roboto,Arial";
      box.innerHTML = '<div style="font-weight:950;font-size:14px;margin-bottom:8px">Falha ao iniciar o painel</div>' +
                      '<div style="font-size:12px;opacity:.75;margin-bottom:10px">O erro abaixo foi capturado e exibido aqui (sem depender do Console).</div>';
      box.appendChild(pre);
      root.appendChild(box);

      var s = document.getElementById("cgd-sentinel");
      if(s) s.textContent = "JS iniciou ❌ (erro exibido na tela)";
    }catch(_){}
  }

  window.addEventListener("error", function(e){ showFatal(e.error || e.message || e); });
  window.addEventListener("unhandledrejection", function(e){ showFatal(e.reason || e); });

  try{

    // =========================
    // CONFIG — AJUSTE AQUI
    // =========================
    var CONFIG = {
      WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

      // Painel (Leads) — Categoria/Pipeline
      LEADS_CATEGORY_ID: 17,

      // Campos UF usados no Follow-up
      UF_PRAZO: "UF_CRM_1768175087",

      // Fila multi-PC via PIPELINE 27 (controle)
      QUEUE: {
        CATEGORY_ID: 27,
        STAGE_ID: "C27:UC_SVUYIO",          // QUEUE_JSON → C27:UC_SVUYIO
        UF_QUEUE_JSON: "UF_CRM_1771293519", // QUEUE_JSON (campo)
        TITLE_KEY: "__QUEUE__CGD__"
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
        { name:"BEATRIZ", id:3387 }
      ],

      // “Novo Lead”
      NEW_LEADS_FILTER: {
        STAGE_ID: null
      }
    };

    // Sinaliza “JS iniciou ✅”
    (function(){
      var s = document.getElementById("cgd-sentinel");
      if(s) s.textContent = "JS iniciou ✅";
    })();

    // =========================
    // Helpers DOM
    // =========================
    function $(q, el){ return (el||document).querySelector(q); }
    function $$(q, el){ return Array.prototype.slice.call((el||document).querySelectorAll(q)); }
    function esc(s){
      s = String(s == null ? "" : s);
      return s.replace(/[&<>"']/g, function(m){
        return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]);
      });
    }
    function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

    function nowBRTime(){
      try{ return new Date().toLocaleTimeString("pt-BR"); }catch(_){ return ""; }
    }

    function todayISOStart(){
      var d = new Date();
      d.setHours(0,0,0,0);
      var y = d.getFullYear();
      var m = String(d.getMonth()+1).padStart(2,"0");
      var da = String(d.getDate()).padStart(2,"0");
      return y + "-" + m + "-" + da + "T00:00:00";
    }

    function isoFromLocalInput(v){
      if(!v) return "";
      var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
      if(!m) return "";
      var dt = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], 0, 0);
      if(Number.isNaN(dt.getTime())) return "";
      return dt.toISOString();
    }

    // =========================
    // Bitrix webhook client
    // =========================
    function toPairs(prefix, obj, out){
      out = out || [];
      if(obj === null || obj === undefined) return out;

      if(typeof obj === "object" && !Array.isArray(obj)){
        Object.keys(obj).forEach(function(k){
          var key = prefix ? (prefix + "[" + k + "]") : k;
          toPairs(key, obj[k], out);
        });
        return out;
      }

      if(Array.isArray(obj)){
        for(var i=0;i<obj.length;i++){
          var key2 = prefix ? (prefix + "[" + i + "]") : String(i);
          toPairs(key2, obj[i], out);
        }
        return out;
      }

      out.push([prefix, String(obj)]);
      return out;
    }

    async function bx(method, params){
      params = params || {};
      var pairs = toPairs("", params, []);
      var body = new URLSearchParams();
      pairs.forEach(function(kv){
        if(kv[0]) body.append(kv[0], kv[1]);
      });

      var resp = await fetch(CONFIG.WEBHOOK + method, {
        method: "POST",
        headers: {"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},
        body: body
      });

      var data = await resp.json().catch(function(){ return {}; });
      if(!resp.ok) throw new Error("HTTP " + resp.status + " em " + method);
      if(data && data.error) throw new Error(data.error_description || data.error);
      return data.result;
    }

    async function bxListAll(method, params, max){
      max = max || 120;
      var start = 0;
      var out = [];

      while(true){
        var r = await bx(method, Object.assign({}, params, { start: start }));

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
    // Audio — 3 bipes (curtos)
    // =========================
    function tripleBeep(){
      try{
        var AC = window.AudioContext || window.webkitAudioContext;
        if(!AC) return;
        var ctx = new AC();
        var t0 = ctx.currentTime;

        function make(t){
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
          o.connect(g); g.connect(ctx.destination);
          o.start(t);
          o.stop(t + 0.16);
        }

        make(t0 + 0.00);
        make(t0 + 0.22);
        make(t0 + 0.44);

        setTimeout(function(){ try{ ctx.close(); }catch(_){} }, 900);
      }catch(_){}
    }

    // =========================
    // UI / CSS
    // =========================
    function injectCSS(){
      var css =
`#cgdApp{
  --radius:18px;
  --border: rgba(30,40,70,.12);
  --text: rgba(18,26,40,.92);
  --muted: rgba(18,26,40,.62);
  --card2: rgba(255,255,255,.92);
  --shadow: 0 10px 30px rgba(20,30,60,.10);

  min-height: 100vh;
  padding: 10px 12px 110px;
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
  width: 41px; height: 41px;
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
  padding: 10px;
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
  min-width: 0;
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
  z-index: 9999;
  background: rgba(255,255,255,.78);
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

/* Modais */
.cgdModalOverlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.28);
  backdrop-filter: blur(4px);
  z-index: 20000;
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
.cgdRow{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
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

/* Responsivo */
@media (max-width: 1100px){
  .cgdGrid{ grid-template-columns: 1fr; }
  .cgdTopLeft{ min-width: unset; }
}`;

      var st = document.createElement("style");
      st.textContent = css;
      document.head.appendChild(st);
    }

    // =========================
    // Modal system
    // =========================
    function openModal(title, bodyHTML, footHTML){
      closeModal();
      var ov = document.createElement("div");
      ov.className = "cgdModalOverlay";
      ov.innerHTML =
        '<div class="cgdModal" role="dialog" aria-modal="true">' +
          '<div class="cgdModalHead">' +
            '<div class="cgdModalTitle">' + esc(title) + '</div>' +
            '<button class="cgdBtn" data-close-modal>Fechar</button>' +
          '</div>' +
          '<div class="cgdModalBody">' + (bodyHTML||"") + '</div>' +
          '<div class="cgdModalFoot">' + (footHTML||'<button class="cgdBtn" data-close-modal>Fechar</button>') + '</div>' +
        '</div>';

      ov.addEventListener("click", function(e){
        if(e.target === ov) closeModal();
        var c = e.target.closest && e.target.closest("[data-close-modal]");
        if(c) closeModal();
      });

      document.body.appendChild(ov);

      function escClose(e){
        if(e.key === "Escape") closeModal();
      }
      ov.__escClose = escClose;
      document.addEventListener("keydown", escClose, {capture:true});
    }

    function closeModal(){
      var ov = $(".cgdModalOverlay");
      if(ov){
        if(ov.__escClose) document.removeEventListener("keydown", ov.__escClose, {capture:true});
        ov.remove();
      }
    }

    // =========================
    // State (RAM apenas)
    // =========================
    var state = {
      soundOn: true,
      lastNewLeadId: null,
      newLeads: [],
      stats: { day:0, month:0 },
      userStats: {},
      queue: { order:[], updatedAt:0, dealId:null },
      netOk: true
    };

    // =========================
    // Mount
    // =========================
    function mount(){
      var root = document.getElementById("cgd-leads-root");
      if(!root){
        root = document.createElement("div");
        root.id = "cgd-leads-root";
        document.body.prepend(root);
      }

      root.innerHTML =
        '<div id="cgdApp">' +
          '<div class="cgdTop">' +
            '<div class="cgdTopLeft">' +
              '<img class="cgdLogo" src="' + esc(CONFIG.LOGO_URL) + '" alt="CGD" />' +
              '<div class="cgdTitle">PAINEL DE LEADS • CGD CORRETORA</div>' +
            '</div>' +
            '<div class="cgdTopRight">' +
              '<div class="cgdPill" id="pillDay">Leads do dia: 0</div>' +
              '<div class="cgdPill" id="pillMonth">Leads do mês: 0</div>' +
              '<button class="cgdBtn" id="btnQueue">FILA</button>' +
              '<button class="cgdBtn" id="btnManage">GERENCIAR USUÁRIA</button>' +
              '<button class="cgdBtn" id="btnRefresh">ATUALIZAR</button>' +
              '<button class="cgdBtn" id="btnSound">Som: ON</button>' +
            '</div>' +
          '</div>' +

          '<div class="cgdGrid">' +
            '<section class="cgdCol" id="colNew">' +
              '<div class="cgdColHead">' +
                '<div style="width:100%">' +
                  '<div class="hTitle">NOVOS LEADS • PENDENTES</div>' +
                  '<div class="hSub">Somente status: <b>NOVO LEAD</b></div>' +
                '</div>' +
                '<div class="hActions">' +
                  '<button class="cgdBtn" id="btnBatch">Transferir em lote</button>' +
                  '<button class="cgdBtn" id="btnRefreshNew">Atualizar</button>' +
                '</div>' +
              '</div>' +
              '<div class="cgdList" id="listNew">' +
                '<div class="cgdAlertBox" id="alertNew" style="display:none">' +
                  '<div class="txt">🚨 <b>NOVO LEAD</b><small>3 bipes quando entrar novo lead.</small></div>' +
                  '<button class="cgdBtn" id="btnSilence">Silenciar</button>' +
                '</div>' +
                '<div class="cgdOffline" id="offlineNew">Sem conexão agora. Mantendo os dados atuais.</div>' +
                '<div style="opacity:.7;font-weight:900">Carregando…</div>' +
              '</div>' +
            '</section>' +

            '<section class="cgdCol" id="colWho">' +
              '<div class="cgdColHead">' +
                '<div style="width:100%">' +
                  '<div class="hTitle">QUEM PEGOU HOJE</div>' +
                  '<div class="hSub">Puxados hoje + últimos atendimentos (sem storage)</div>' +
                '</div>' +
                '<div class="hActions">' +
                  '<button class="cgdBtn" id="btnRefreshWho">Atualizar</button>' +
                '</div>' +
              '</div>' +
              '<div class="cgdList" id="listWho"><div style="opacity:.7;font-weight:900">Carregando…</div></div>' +
            '</section>' +
          '</div>' +

          '<div class="cgdBottom">' +
            '<div class="cgdQueueRow" id="queueRow">' +
              '<div class="cgdQueueChip"><b>Fila de atendimento</b></div>' +
              '<div class="cgdQueueChip" id="queueHint">Fila vazia. Clique em FILA → Montar fila.</div>' +
            '</div>' +
            '<div class="cgdQueueRow">' +
              '<button class="cgdBtn" id="btnQueueReset">Resetar</button>' +
              '<button class="cgdBtn" id="btnNext">Próxima disponível</button>' +
              '<div class="cgdStatusLine" id="statusLine">Atualizado: —</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    // =========================
    // Data: NEW LEADS
    // =========================
    async function fetchNewLeads(){
      var filter = { CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID };
      if(CONFIG.NEW_LEADS_FILTER && CONFIG.NEW_LEADS_FILTER.STAGE_ID){
        filter.STAGE_ID = CONFIG.NEW_LEADS_FILTER.STAGE_ID;
      }

      var items = await bxListAll("crm.deal.list", {
        filter: filter,
        order: { ID: "DESC" },
        select: ["ID","TITLE","DATE_CREATE","DATE_MODIFY","ASSIGNED_BY_ID","STAGE_ID"]
      }, CONFIG.LIMIT_NEW);

      return items || [];
    }

    // =========================
    // Data: STATS
    // =========================
    async function fetchStats(){
      var startToday = todayISOStart();
      var now = new Date();
      var y = now.getFullYear();
      var m = String(now.getMonth()+1).padStart(2,"0");
      var monthStart = y + "-" + m + "-01T00:00:00";

      var dayItems = await bxListAll("crm.deal.list", {
        filter: { CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID, ">DATE_MODIFY": startToday },
        order: { DATE_MODIFY: "DESC" },
        select: ["ID"]
      }, 200);

      var monthItems = await bxListAll("crm.deal.list", {
        filter: { CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID, ">DATE_MODIFY": monthStart },
        order: { DATE_MODIFY: "DESC" },
        select: ["ID"]
      }, 500);

      return { day: (dayItems||[]).length, month: (monthItems||[]).length };
    }

    // =========================
    // Data: User history
    // =========================
    async function fetchUserHistory(userId){
      var startToday = todayISOStart();

      var today = await bxListAll("crm.deal.list", {
        filter: {
          CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID,
          "ASSIGNED_BY_ID": String(userId),
          ">DATE_MODIFY": startToday
        },
        order: { DATE_MODIFY: "DESC" },
        select: ["ID","TITLE","DATE_MODIFY","STAGE_ID","ASSIGNED_BY_ID"]
      }, 80);

      var last = await bxListAll("crm.deal.list", {
        filter: { CATEGORY_ID: CONFIG.LEADS_CATEGORY_ID, "ASSIGNED_BY_ID": String(userId) },
        order: { DATE_MODIFY: "DESC" },
        select: ["ID","TITLE","DATE_MODIFY","STAGE_ID","ASSIGNED_BY_ID"]
      }, CONFIG.LIMIT_USER_HISTORY);

      return { pulledToday: (today||[]).length, last: (last||[]) };
    }

    // =========================
    // Data: Queue JSON via Pipeline 27
    // =========================
    async function ensureQueueDeal(){
      var items = await bxListAll("crm.deal.list", {
        filter: {
          CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
          STAGE_ID: CONFIG.QUEUE.STAGE_ID,
          "%TITLE": CONFIG.QUEUE.TITLE_KEY
        },
        order: { ID:"DESC" },
        select: ["ID","TITLE", CONFIG.QUEUE.UF_QUEUE_JSON, "DATE_MODIFY"]
      }, 5);

      if(items && items[0]) return items[0];

      var id = await bx("crm.deal.add", {
        fields: {
          CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
          STAGE_ID: CONFIG.QUEUE.STAGE_ID,
          TITLE: CONFIG.QUEUE.TITLE_KEY + " FILA ATENDIMENTO",
          [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify({ v:1, order:[], updatedAt: Date.now() })
        }
      });

      var created = await bx("crm.deal.get", { id: String(id) });
      return created;
    }

    function parseQueue(json){
      try{
        var o = JSON.parse(json || "{}");
        return {
          order: Array.isArray(o.order) ? o.order : [],
          updatedAt: +o.updatedAt || 0
        };
      }catch(_){
        return { order:[], updatedAt:0 };
      }
    }

    async function fetchQueue(){
      var deal = await ensureQueueDeal();
      var raw = deal && deal[CONFIG.QUEUE.UF_QUEUE_JSON];
      var pq = parseQueue(raw);
      return { dealId: String(deal.ID), order: pq.order, updatedAt: pq.updatedAt };
    }

    async function saveQueue(dealId, order){
      var payload = { v:1, order: order || [], updatedAt: Date.now() };
      await bx("crm.deal.update", {
        id: String(dealId),
        fields: { [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify(payload) }
      });
    }

    // =========================
    // Render
    // =========================
    function renderNewLeads(items){
      var list = $("#listNew");
      if(!list) return;

      var alert = $("#alertNew");
      var offline = $("#offlineNew");

      // preserva os “fixos”
      list.innerHTML = "";
      if(alert) list.appendChild(alert);
      if(offline) list.appendChild(offline);

      var has = (items||[]).length > 0;
      if(alert) alert.style.display = has ? "flex" : "none";

      if(!has){
        var empty = document.createElement("div");
        empty.style.opacity = ".75";
        empty.style.fontWeight = "900";
        empty.textContent = "Nenhum lead para mostrar.";
        list.appendChild(empty);
        return;
      }

      (items||[]).forEach(function(it){
        var id = String(it.ID || "");
        var title = String(it.TITLE || "").trim() || ("Lead #" + id);

        var card = document.createElement("div");
        card.className = "cgdCard";
        card.innerHTML =
          '<div class="cgdCardRow">' +
            '<div class="cgdLeadName">' + esc(title) + '</div>' +
            '<div style="font-weight:950; font-size:12px; opacity:.7">ID: ' + esc(id) + '</div>' +
          '</div>' +
          '<div class="cgdBadges">' +
            '<span class="cgdBadge">STAGE: ' + esc(it.STAGE_ID || "—") + '</span>' +
            '<span class="cgdBadge">MOD: ' + esc(String(it.DATE_MODIFY||"").replace("T"," ").slice(0,19) || "—") + '</span>' +
          '</div>' +
          '<div class="cgdActions">' +
            '<button class="cgdMiniBtn primary" data-grab="' + esc(id) + '">PEGAR</button>' +
          '</div>';

        list.appendChild(card);
      });
    }

    function renderStats(stats){
      var p1 = $("#pillDay"), p2 = $("#pillMonth");
      if(p1) p1.textContent = "Leads do dia: " + (stats.day || 0);
      if(p2) p2.textContent = "Leads do mês: " + (stats.month || 0);
    }

    function renderWho(users){
      var list = $("#listWho");
      if(!list) return;
      list.innerHTML = "";

      users.forEach(function(u){
        var us = state.userStats[u.id] || { pulledToday:0, last:[] };
        var last1 = (us.last && us.last[0]) ? ("Último: " + (us.last[0].TITLE || ("#" + us.last[0].ID))) : "Último: —";
        var last2 = (us.last && us.last[1]) ? ("Anterior: " + (us.last[1].TITLE || ("#" + us.last[1].ID))) : "Anterior: —";

        var card = document.createElement("div");
        card.className = "cgdCard";
        card.innerHTML =
          '<div class="cgdCardRow">' +
            '<div style="font-weight:950">' + esc(u.name) + ' <span style="opacity:.65;font-weight:900">(' + esc(u.id) + ')</span></div>' +
            '<div style="display:flex; gap:8px; align-items:center">' +
              '<span class="cgdBadge">puxados hoje: ' + esc(us.pulledToday || 0) + '</span>' +
              '<button class="cgdMiniBtn" data-open-user="' + esc(u.id) + '">Abrir</button>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">' + esc(last1) + '</div>' +
          '<div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">' + esc(last2) + '</div>';

        list.appendChild(card);
      });
    }

    function renderQueue(){
      var row = $("#queueRow");
      var hint = $("#queueHint");
      if(!row || !hint) return;

      var keep = row.firstElementChild;
      row.innerHTML = "";
      if(keep) row.appendChild(keep);

      var order = state.queue.order || [];
      if(order.length === 0){
        hint.textContent = "Fila vazia. Clique em FILA → Montar fila.";
        row.appendChild(hint);
        return;
      }

      hint.textContent = "";
      row.appendChild(hint);

      order.forEach(function(id, idx){
        var u = CONFIG.USERS.find(function(x){ return String(x.id) === String(id); });
        var chip = document.createElement("div");
        chip.className = "cgdQueueChip";
        chip.innerHTML = "<b>" + esc(u ? u.name : ("USER "+id)) + "</b> <span style='opacity:.65'>#" + (idx+1) + "</span>";
        row.appendChild(chip);
      });
    }

    function setStatus(txt){
      var el = $("#statusLine");
      if(el) el.textContent = txt;
    }

    function setOffline(flag){
      state.netOk = !flag;
      var off = $("#offlineNew");
      if(off) off.style.display = flag ? "block" : "none";
    }

    // =========================
    // Actions
    // =========================
    async function actionAssign(dealId, userId){
      await bx("crm.deal.update", {
        id: String(dealId),
        fields: { ASSIGNED_BY_ID: String(userId) }
      });
    }

    async function actionSetPrazo(dealId, iso){
      var fields = {};
      fields[CONFIG.UF_PRAZO] = iso;
      await bx("crm.deal.update", { id: String(dealId), fields: fields });
    }

    // =========================
    // Modals
    // =========================
    function modalPickLead(dealId){
      var uops = CONFIG.USERS.map(function(u){
        return '<option value="'+esc(u.id)+'">'+esc(u.name)+' ('+esc(u.id)+')</option>';
      }).join("");

      openModal("PEGAR LEAD",
        '<div style="font-weight:950;margin-bottom:10px">Escolha quem vai pegar este lead</div>' +
        '<div class="cgdRow" style="margin-bottom:12px">' +
          '<label style="font-weight:950">Usuária:</label>' +
          '<select class="cgdSelect" id="pickUser">' + uops + '</select>' +
        '</div>' +
        '<div style="font-size:11px;font-weight:900;opacity:.75">Ao confirmar, muda o responsável do card.</div>',
        '<button class="cgdBtn" data-close-modal>Cancelar</button>' +
        '<button class="cgdBtn" id="pickGo">Confirmar</button>'
      );

      $("#pickGo").addEventListener("click", async function(){
        try{
          var uid = $("#pickUser").value;
          $("#pickGo").disabled = true;
          await actionAssign(dealId, uid);
          closeModal();
          await hardRefreshAll();
        }catch(err){
          alert("Falha agora. Mantive o painel; tente novamente.");
        }finally{
          if($("#pickGo")) $("#pickGo").disabled = false;
        }
      });
    }

    async function modalQueue(){
      var q;
      try{
        q = await fetchQueue();
      }catch(_){
        return openModal("FILA", '<div style="font-weight:900;color:#a00">Falha ao carregar fila agora.</div>');
      }

      var current = q.order || [];
      var options = CONFIG.USERS.map(function(u){
        return '<option value="'+esc(u.id)+'">'+esc(u.name)+' ('+esc(u.id)+')</option>';
      }).join("");

      var rows = current.length ? current.map(function(id, i){
        var u = CONFIG.USERS.find(function(x){ return String(x.id)===String(id); });
        return '<tr>' +
          '<td>'+(i+1)+'</td>' +
          '<td><b>'+esc(u?u.name:("USER "+id))+'</b> <span style="opacity:.65">('+esc(id)+')</span></td>' +
          '<td>' +
            '<button class="cgdBtn" data-q-up="'+esc(i)+'">↑</button> ' +
            '<button class="cgdBtn" data-q-down="'+esc(i)+'">↓</button> ' +
            '<button class="cgdBtn" data-q-del="'+esc(i)+'">Remover</button>' +
          '</td>' +
        '</tr>';
      }).join("") : '<tr><td colspan="3" style="opacity:.75;font-weight:900">Fila vazia</td></tr>';

      openModal("FILA",
        '<div style="font-weight:950;margin-bottom:10px">Gerenciar fila (sincroniza em todos os PCs)</div>' +
        '<div class="cgdRow" style="margin-bottom:12px">' +
          '<label style="font-weight:950">Adicionar:</label>' +
          '<select class="cgdSelect" id="qAddSel">'+options+'</select>' +
          '<button class="cgdBtn" id="qAddBtn">Adicionar</button>' +
          '<button class="cgdBtn" id="qBuildBtn">Montar fila (todas)</button>' +
        '</div>' +
        '<table class="cgdTable"><thead><tr><th>#</th><th>Usuária</th><th>Ações</th></tr></thead><tbody id="qTbody">'+rows+'</tbody></table>',
        '<button class="cgdBtn" data-close-modal>Fechar</button>'
      );

      $("#qAddBtn").addEventListener("click", async function(){
        var id = $("#qAddSel").value;
        var next = (q.order||[]).slice();
        if(next.indexOf(id) === -1) next.push(id);
        await saveQueue(q.dealId, next);
        closeModal();
        await hardRefreshAll();
      });

      $("#qBuildBtn").addEventListener("click", async function(){
        var next = CONFIG.USERS.map(function(u){ return String(u.id); });
        await saveQueue(q.dealId, next);
        closeModal();
        await hardRefreshAll();
      });

      $(".cgdModalBody").addEventListener("click", async function(e){
        var up = e.target.closest("[data-q-up]");
        var down = e.target.closest("[data-q-down]");
        var del = e.target.closest("[data-q-del]");
        if(!up && !down && !del) return;

        var idx = +((up && up.getAttribute("data-q-up")) || (down && down.getAttribute("data-q-down")) || (del && del.getAttribute("data-q-del")) || 0);
        var next = (q.order||[]).slice();

        if(del){
          next.splice(idx,1);
        }else if(up && idx > 0){
          var t = next[idx-1]; next[idx-1] = next[idx]; next[idx] = t;
        }else if(down && idx < next.length-1){
          var t2 = next[idx+1]; next[idx+1] = next[idx]; next[idx] = t2;
        }

        await saveQueue(q.dealId, next);
        closeModal();
        await hardRefreshAll();
      });
    }

    async function modalManageUser(userId){
      var u = CONFIG.USERS.find(function(x){ return String(x.id)===String(userId); });
      if(!u) return;

      var hist;
      try{
        hist = await fetchUserHistory(u.id);
      }catch(_){
        return openModal("GERENCIAR USUÁRIA • " + u.name, '<div style="font-weight:900;color:#a00">Falha ao carregar agora.</div>');
      }

      var optUsers = CONFIG.USERS.map(function(x){
        return '<option value="'+esc(x.id)+'">'+esc(x.name)+' ('+esc(x.id)+')</option>';
      }).join("");

      var rows = (hist.last||[]).map(function(it){
        var id = String(it.ID);
        var title = it.TITLE || ("Lead #"+id);
        var dm = String(it.DATE_MODIFY||"").replace("T"," ").slice(0,19);

        return '<tr>' +
          '<td><b>'+esc(title)+'</b><div style="opacity:.7;font-weight:900;font-size:11px">ID: '+esc(id)+' • '+esc(dm||"—")+'</div></td>' +
          '<td><div class="cgdRow">' +
            '<input class="cgdInput" type="datetime-local" data-prazo="'+esc(id)+'" />' +
            '<button class="cgdBtn" data-save-prazo="'+esc(id)+'">Salvar prazo</button>' +
          '</div></td>' +
          '<td><div class="cgdRow">' +
            '<select class="cgdSelect" data-move-to="'+esc(id)+'">'+optUsers+'</select>' +
            '<button class="cgdBtn" data-do-move="'+esc(id)+'">Transferir</button>' +
          '</div></td>' +
        '</tr>';
      }).join("");

      openModal(
        "GERENCIAR USUÁRIA • " + u.name + " (" + u.id + ")",
        '<div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">' +
          '<div style="font-weight:950">FOLLOW-UP (prazo) + transferir leads (sem storage)</div>' +
          '<button class="cgdBtn" id="muRefresh">Atualizar</button>' +
        '</div>' +
        '<div class="cgdRow" style="margin-bottom:10px">' +
          '<div class="cgdBadge">Puxados hoje: <b>'+esc(hist.pulledToday||0)+'</b></div>' +
          '<div class="cgdBadge">Últimos: <b>'+esc((hist.last||[]).length)+'</b></div>' +
        '</div>' +
        '<table class="cgdTable"><thead><tr><th>Lead</th><th>FOLLOW-UP</th><th>Transferir</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>') +
        '</tbody></table>'
      );

      $("#muRefresh").addEventListener("click", async function(){
        closeModal();
        await modalManageUser(userId);
      });

      $(".cgdModalBody").addEventListener("click", async function(e){
        var sp = e.target.closest("[data-save-prazo]");
        var mv = e.target.closest("[data-do-move]");
        try{
          if(sp){
            var dealId = sp.getAttribute("data-save-prazo");
            var inp = $('input[data-prazo="'+dealId+'"]', $(".cgdModalBody"));
            var iso = isoFromLocalInput(inp && inp.value);
            if(!iso) return alert("Preencha a data/hora corretamente.");
            sp.disabled = true;
            await actionSetPrazo(dealId, iso);
            await hardRefreshAll();
            alert("Prazo salvo ✅");
          }
          if(mv){
            var dealId2 = mv.getAttribute("data-do-move");
            var sel = $('select[data-move-to="'+dealId2+'"]', $(".cgdModalBody"));
            var toId = sel && sel.value;
            if(!toId) return;
            mv.disabled = true;
            await actionAssign(dealId2, toId);
            await hardRefreshAll();
            alert("Transferido ✅");
          }
        }catch(err){
          alert("Falha agora. Mantive o painel; tente novamente.");
        }finally{
          if(sp) sp.disabled = false;
          if(mv) mv.disabled = false;
        }
      });
    }

    function modalBatchTransfer(){
      var items = state.newLeads || [];
      var ops = CONFIG.USERS.map(function(u){
        return '<option value="'+esc(u.id)+'">'+esc(u.name)+' ('+esc(u.id)+')</option>';
      }).join("");

      openModal("TRANSFERIR EM LOTE",
        '<div style="font-weight:950;margin-bottom:10px">Transferir em lote</div>' +
        '<div class="cgdRow" style="margin-bottom:12px">' +
          '<label style="font-weight:950">Filtrar por texto:</label>' +
          '<input class="cgdInput" id="btOper" placeholder="Ex.: MEDSENIOR" />' +
          '<label style="font-weight:950">Para:</label>' +
          '<select class="cgdSelect" id="btUser">'+ops+'</select>' +
          '<button class="cgdBtn" id="btApply">Aplicar</button>' +
        '</div>' +
        '<div class="cgdRow" style="margin-bottom:10px"><div class="cgdBadge">Leads listados: <b id="btCount">'+esc(items.length)+'</b></div></div>' +
        '<table class="cgdTable"><thead><tr><th>Sel</th><th>Lead</th></tr></thead><tbody id="btTbody">' +
          (items.length ? items.map(function(it){
            return '<tr>' +
              '<td><input type="checkbox" data-bt-id="'+esc(it.ID)+'" checked /></td>' +
              '<td><b>'+esc(it.TITLE||("Lead #"+it.ID))+'</b> <span style="opacity:.65;font-weight:900">ID: '+esc(it.ID)+'</span></td>' +
            '</tr>';
          }).join("") : '<tr><td colspan="2" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>') +
        '</tbody></table>',
        '<button class="cgdBtn" data-close-modal>Cancelar</button>' +
        '<button class="cgdBtn" id="btDo">Transferir selecionados</button>'
      );

      var tbody = $("#btTbody");
      var countEl = $("#btCount");

      function applyFilter(){
        var q = String($("#btOper").value || "").trim().toUpperCase();
        var filtered = items;

        if(q){
          filtered = items.filter(function(it){
            return String(it.TITLE || "").toUpperCase().indexOf(q) !== -1;
          });
        }

        countEl.textContent = String(filtered.length);
        tbody.innerHTML = filtered.length ? filtered.map(function(it){
          return '<tr>' +
            '<td><input type="checkbox" data-bt-id="'+esc(it.ID)+'" checked /></td>' +
            '<td><b>'+esc(it.TITLE||("Lead #"+it.ID))+'</b> <span style="opacity:.65;font-weight:900">ID: '+esc(it.ID)+'</span></td>' +
          '</tr>';
        }).join("") : '<tr><td colspan="2" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>';
      }

      $("#btApply").addEventListener("click", applyFilter);

      $("#btDo").addEventListener("click", async function(){
        var toId = $("#btUser").value;
        var ids = $$("input[type=checkbox][data-bt-id]", tbody)
          .filter(function(x){ return x.checked; })
          .map(function(x){ return x.getAttribute("data-bt-id"); });

        if(ids.length === 0) return alert("Selecione pelo menos 1 lead.");

        try{
          $("#btDo").disabled = true;
          for(var i=0;i<ids.length;i++){
            await actionAssign(ids[i], toId);
            await sleep(120);
          }
          closeModal();
          await hardRefreshAll();
          alert("Transferência concluída ✅");
        }catch(_){
          alert("Falha agora. Mantive o painel; tente novamente.");
        }finally{
          $("#btDo").disabled = false;
        }
      });
    }

    // =========================
    // Refresh
    // =========================
    async function refreshNewLeads(){
      try{
        var items = await fetchNewLeads();
        setOffline(false);

        var newest = (items && items[0]) ? String(items[0].ID) : null;
        if(newest && newest !== state.lastNewLeadId){
          state.lastNewLeadId = newest;
          if(state.soundOn) tripleBeep();
        }

        state.newLeads = items || [];
        renderNewLeads(state.newLeads);
      }catch(_){
        // mantém render anterior
        setOffline(true);
      }
    }

    async function refreshStats(){
      try{
        var s = await fetchStats();
        state.stats = s;
        renderStats(s);
      }catch(_){}
    }

    async function refreshUsers(){
      try{
        await Promise.all(CONFIG.USERS.map(async function(u){
          state.userStats[u.id] = await fetchUserHistory(u.id);
        }));
        renderWho(CONFIG.USERS);
      }catch(_){}
    }

    async function refreshQueue(){
      try{
        var q = await fetchQueue();
        state.queue = { order: q.order||[], updatedAt: q.updatedAt||0, dealId: q.dealId };
        renderQueue();
      }catch(_){}
    }

    async function hardRefreshAll(){
      setStatus("Atualizando… (" + nowBRTime() + ")");
      await Promise.allSettled([refreshNewLeads(), refreshStats(), refreshUsers(), refreshQueue()]);
      setStatus("Atualizado: " + nowBRTime());
    }

    // =========================
    // Events
    // =========================
    function wire(){
      $("#btnSound").addEventListener("click", function(){
        state.soundOn = !state.soundOn;
        $("#btnSound").textContent = "Som: " + (state.soundOn ? "ON" : "OFF");
      });

      $("#btnSilence").addEventListener("click", function(){
        state.soundOn = false;
        $("#btnSound").textContent = "Som: OFF";
      });

      $("#btnRefresh").addEventListener("click", hardRefreshAll);
      $("#btnRefreshNew").addEventListener("click", refreshNewLeads);
      $("#btnRefreshWho").addEventListener("click", refreshUsers);

      $("#btnQueue").addEventListener("click", modalQueue);

      $("#btnManage").addEventListener("click", function(){
        var opts = CONFIG.USERS.map(function(u){
          return '<option value="'+esc(u.id)+'">'+esc(u.name)+' ('+esc(u.id)+')</option>';
        }).join("");

        openModal("GERENCIAR USUÁRIA",
          '<div class="cgdRow">' +
            '<label style="font-weight:950">Selecione:</label>' +
            '<select class="cgdSelect" id="muSel">'+opts+'</select>' +
            '<button class="cgdBtn" id="muOpen">Abrir</button>' +
          '</div>'
        );

        $("#muOpen").addEventListener("click", function(){
          var id = $("#muSel").value;
          closeModal();
          modalManageUser(id);
        });
      });

      $("#btnBatch").addEventListener("click", modalBatchTransfer);

      $("#btnNext").addEventListener("click", async function(){
        try{
          var q = await fetchQueue();
          var order = (q.order||[]).slice();
          if(order.length === 0) return alert("Fila vazia.");
          var nextId = order.shift();
          await saveQueue(q.dealId, order);
          await hardRefreshAll();
          var u = CONFIG.USERS.find(function(x){ return String(x.id)===String(nextId); });
          alert("Próxima: " + (u ? u.name : ("USER " + nextId)));
        }catch(_){
          alert("Falha agora. Mantive o painel; tente novamente.");
        }
      });

      $("#btnQueueReset").addEventListener("click", async function(){
        try{
          var q = await fetchQueue();
          await saveQueue(q.dealId, []);
          await hardRefreshAll();
        }catch(_){
          alert("Falha agora. Mantive o painel; tente novamente.");
        }
      });

      document.addEventListener("click", function(e){
        var g = e.target.closest && e.target.closest("[data-grab]");
        var ou = e.target.closest && e.target.closest("[data-open-user]");

        if(g){
          modalPickLead(g.getAttribute("data-grab"));
        }
        if(ou){
          modalManageUser(ou.getAttribute("data-open-user"));
        }
      });
    }

    // =========================
    // Start
    // =========================
    async function start(){
      if(!CONFIG.WEBHOOK){
        showFatal("CONFIG.WEBHOOK vazio.");
        return;
      }

      injectCSS();
      mount();
      wire();

      $("#btnSound").textContent = "Som: " + (state.soundOn ? "ON" : "OFF");

      await hardRefreshAll();

      setInterval(refreshNewLeads, CONFIG.REFRESH_NEW_LEADS_MS);
      setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
      setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);
    }

    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", start);
    }else{
      start();
    }

  }catch(err){
    showFatal(err);
  }
})();
