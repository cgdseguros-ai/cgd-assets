/* cgd-leads.js — Painel de Leads (Bitrix24 Sites)
   - SEM storage do navegador (NADA de localStorage/sessionStorage)
   - UI refinada + ajustes de layout (títulos centralizados, botões abaixo do título, contrastes)
   - Fila multi-PC via QUEUE_JSON (Deal em Pipeline 27 / Stage QUEUE_JSON)
   - Contagens por "Data PEGAR" (UF_CRM_1771741018): dia e mês (geral e por USER)
     ✅ Considera apenas etapas: EM ATENDIMENTO, ATENDIDO, QUALIFICADO, LEAD DESCARTADO, CONVERTIDO
   - Busca global: mostra RESPONSÁVEL + TRANSFERIR + EXCLUIR (1 ou vários)
   - Correções:
     ✅ Avião só quando ENTRA lead novo em NOVOS LEADS (não quando remove por PEGAR/DESCARTAR)
     ✅ Avião maior (~10cm), papel amarelo 3D de lado
     ✅ PREVENT com fundo azul escuro na badge OPERADORA
     ✅ Barra inferior: cinza bem escuro + CNPJs lado a lado + label "Endereço"
     ✅ ABRIR: lista com informações do lead (operadora, idade, tel, bairro, fonte, data)
     ✅ ABRIR mais robusto (retry) para reduzir erro intermitente "Sem conexão"
*/
(function(){
  "use strict";

  // =========================
  // CONFIG — AJUSTE AQUI
  // =========================
  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",

    // Campo UF usado no Follow-up (no LEAD)
    UF_PRAZO: "UF_CRM_1768175087",

    // ✅ Data PEGAR (base oficial de contagem "dia" e "mês")
    UF_DATA_PEGAR: "UF_CRM_1771741018",

    // Campos no card/badges (se existirem)
    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD:   "UF_CRM_1771333014", // Data/Hora do Lead (UF)
    UF_IDADE:     "UF_CRM_1771339221", // Idade (texto)
    UF_BAIRRO:    "UF_CRM_LEAD_1731909705398",
    UF_FONTE:     "UF_CRM_1767285733843",
    UF_TELEFONE:  "UF_CRM_1771282207",

    // Fila multi-PC via PIPELINE 27 (controle)
    QUEUE: {
      CATEGORY_ID: 27,
      STAGE_ID: "C27:UC_SVUYIO",
      UF_QUEUE_JSON: "UF_CRM_1771293519",
      TITLE_KEY: "__QUEUE__CGD__"
    },

    // Pipeline 17 (Negócios) — Follow-up cria Deal aqui
    FOLLOWUP_DEALS: {
      CATEGORY_ID: 17,
      STAGE_BY_USER: {
        "15":   "C17:UC_FQ8UPI",   // ALINE
        "19":   "C17:UC_1HXNTB",   // ADRIANA
        "17":   "C17:UC_RRQKAQ",   // ANDREYNA
        "23":   "C17:UC_4HQGI1",   // MARIANA
        "811":  "C17:UC_8Y4R4V",   // JOSIANE
        "3081": "C17:EXECUTING",   // BRUNA LUISA
        "3083": "C17:UC_8O5UFO",   // FERNANDA SILVA
        "3079": "C17:UC_P1P9RJ",   // LIVIA ALVES
        "3085": "C17:UC_U8AAGB",   // NICOLLE BELMONTE
        "3389": "C17:UC_A6LSS8",   // ANNA CLARA
        "815":  "C17:UC_ZT6WEB",   // GABRIEL
        "3387": "C17:UC_RXISLQ"    // BEATRIZ
      }
    },

    // Logo topo (troque aqui quando quiser)
    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=awjcg85eqrbi",

    // Links
    LINKS: {
      GET: "https://getcgdcorretora.bitrix24.site/tfequipes/",
      VENDAS: "https://cgdcorretorabase.bitrix24.site/vendas/"
    },

    // Refresh
    REFRESH_NEW_LEADS_MS: 4500,
    REFRESH_STATS_MS: 9000,
    REFRESH_QUEUE_MS: 3000,
    REFRESH_WHO_MS: 12000,

    // Limites
    LIMIT_NEW_RENDER: 30,
    LIMIT_BATCH_MAX:  600,
    LIMIT_USER_LAST:  160, // ABRIR: lista completa (um pouco maior)
    LIMIT_LAST_TWO_FETCH: 12,

    // Usuárias do painel
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

    // Sócios (fotos na barra inferior)
    BOSSES: [27, 1, 15],

    // ✅ Status/Stages de LEADS
    LEAD_STATUS: {
      NOVO_LEAD: "NEW",
      EM_ATENDIMENTO: "IN_PROCESS",
      ATENDIDO: "UC_JT9G60",
      QUALIFICADO: "UC_0NFA3H",
      PERDIDO: "UC_5IMTI4",
      CONVERTIDO: "UC_B3RQAF",
      DESCARTADO_SISTEMA: "JUNK",       // lead descartado (sistema)
      CONVERTIDO_SISTEMA: "CONVERTED"   // lead convertido (sistema)
    },

    // ✅ Contagem deve considerar APENAS estas colunas:
    // EM ATENDIMENTO, ATENDIDO, QUALIFICADO, LEAD DESCARTADO, CONVERTIDO
    COUNT_STATUS_ALLOWED: [
      "IN_PROCESS",     // EM ATENDIMENTO
      "UC_JT9G60",      // ATENDIDO
      "UC_0NFA3H",      // QUALIFICADO
      "JUNK",           // LEAD DESCARTADO (sistema)
      "UC_B3RQAF"       // CONVERTIDO (custom)
      // se você quiser também contar "CONVERTED" (sistema), adicione aqui:
      // "CONVERTED"
    ],

    // Nomes (para exibir na busca)
    LEAD_STATUS_NAMES: {
      "NEW": "NOVO LEAD",
      "IN_PROCESS": "EM ATENDIMENTO",
      "UC_JT9G60": "ATENDIDO",
      "UC_0NFA3H": "QUALIFICADO",
      "UC_5IMTI4": "PERDIDO",
      "UC_B3RQAF": "CONVERTIDO",
      "CONVERTED": "LEAD CONVERTIDO (sistema)",
      "JUNK": "DESCARTADO (sistema)"
    },

    // Select do lead
    LEAD_SELECT: [
      "ID","TITLE","NAME","LAST_NAME","SECOND_NAME",
      "STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY",
      "SOURCE_ID","PHONE","EMAIL",
      "ADDRESS_CITY","ADDRESS","ADDRESS_2","ADDRESS_REGION",
      "UF_*"
    ],

    HOT_EMOJI: "🔥"
  };

  // =========================
  // Helpers DOM
  // =========================
  const $ = (q, el=document)=> el.querySelector(q);
  const $$ = (q, el=document)=> Array.from(el.querySelectorAll(q));
  const esc = (s)=> String(s??"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));

  function nowBRTime(){
    try{ return new Date().toLocaleTimeString("pt-BR"); }catch(_){ return ""; }
  }

  // =========================
  // Datas: ISO com offset BR (-03:00) por padrão
  // =========================
  function pad2(n){ return String(n).padStart(2,"0"); }

  function isoLocalWithOffset(dt, offsetMinutes){
    // offsetMinutes: ex -180 para -03:00
    offsetMinutes = Number.isFinite(offsetMinutes) ? offsetMinutes : -180;

    const y = dt.getFullYear();
    const mo = pad2(dt.getMonth()+1);
    const d = pad2(dt.getDate());
    const hh = pad2(dt.getHours());
    const mi = pad2(dt.getMinutes());
    const ss = pad2(dt.getSeconds());

    const sign = offsetMinutes <= 0 ? "-" : "+";
    const abs = Math.abs(offsetMinutes);
    const oh = pad2(Math.floor(abs/60));
    const om = pad2(abs%60);
    return `${y}-${mo}-${d}T${hh}:${mi}:${ss}${sign}${oh}:${om}`;
  }

  function dayRange(){
    const d0 = new Date(); d0.setHours(0,0,0,0);
    const d1 = new Date(d0.getTime() + 24*60*60*1000);
    return {
      startISO: isoLocalWithOffset(d0, -180),
      endISO: isoLocalWithOffset(d1, -180)
    };
  }

  function monthRange(){
    const d0 = new Date(); d0.setDate(1); d0.setHours(0,0,0,0);
    const d1 = new Date(d0); d1.setMonth(d1.getMonth()+1);
    return {
      startISO: isoLocalWithOffset(d0, -180),
      endISO: isoLocalWithOffset(d1, -180)
    };
  }

  function isoFromLocalInput(v){
    if(!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!m) return "";
    const y=+m[1], mo=+m[2]-1, d=+m[3], hh=+m[4], mi=+m[5];
    const dt = new Date(y, mo, d, hh, mi, 0, 0);
    if(Number.isNaN(dt.getTime())) return "";
    // salva como ISO com offset BR para ficar coerente no Bitrix
    return isoLocalWithOffset(dt, -180);
  }

  function fmtDateBRFromISO(iso){
    if(!iso) return "";
    const t = Date.parse(String(iso));
    if(!Number.isFinite(t)) return String(iso);
    const d = new Date(t);
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,"0");
    const mi = String(d.getMinutes()).padStart(2,"0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  }

  function stageName(id){
    return CONFIG.LEAD_STATUS_NAMES[String(id||"")] || String(id||"—");
  }

  function userNameById(id){
    const s = String(id||"");
    const u = CONFIG.USERS.find(x=>String(x.id)===s);
    if(u) return u.name;
    return s ? ("USER " + s) : "—";
  }

  // =========================
  // Robust retry helper
  // =========================
  async function retryAsync(fn, tries=3, baseDelay=250){
    let last;
    for(let i=0;i<tries;i++){
      try{ return await fn(); }
      catch(err){
        last = err;
        await sleep(baseDelay + i*baseDelay);
      }
    }
    throw last;
  }

  // =========================
  // Webhook client
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

  async function bxRaw(method, params={}, options={}){
    const timeoutMs = Math.max(8000, Number(options.timeoutMs || 18000));
    const pairs = toPairs("", params, []);
    const body = new URLSearchParams();
    for(const [k,v] of pairs){ if(k) body.append(k, v); }

    let lastErr = null;

    for(let attempt=0; attempt<4; attempt++){
      const ctrl = new AbortController();
      const t = setTimeout(()=>{ try{ ctrl.abort(); }catch(_){} }, timeoutMs);

      try{
        const resp = await fetch(CONFIG.WEBHOOK + method, {
          method:"POST",
          headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},
          body,
          signal: ctrl.signal
        });

        const data = await resp.json().catch(()=> ({}));
        if(!resp.ok){
          const e = new Error(`HTTP ${resp.status} em ${method}`);
          e._httpStatus = resp.status;
          throw e;
        }
        if(data && data.error){
          const e = new Error(data.error_description || data.error);
          e._bxError = data.error;
          throw e;
        }
        return data; // ✅ objeto completo
      }catch(err){
        lastErr = err;
        const http = err && err._httpStatus;
        const transientHTTP = (http===429 || http===500 || http===502 || http===503 || http===504);
        const aborted = (err && (err.name==="AbortError"));
        const net = (err && String(err.message||err).toLowerCase().includes("failed to fetch"));

        if(attempt < 3 && (transientHTTP || aborted || net)){
          clearTimeout(t);
          await sleep(260 + attempt*520);
          continue;
        }
        clearTimeout(t);
        throw err;
      }finally{
        clearTimeout(t);
      }
    }
    throw lastErr || new Error("Falha desconhecida");
  }

  async function bx(method, params={}, options={}){
    const data = await bxRaw(method, params, options);
    return data.result;
  }

  async function bxListAll(method, params, max=500){
    let start = 0;
    let out = [];
    while(true){
      const r = await bx(method, { ...params, start });
      const items = Array.isArray(r) ? r : (r && Array.isArray(r.items) ? r.items : []);
      out = out.concat(items);
      if(out.length >= max) break;

      if(r && typeof r === "object" && r.next !== undefined && r.next !== null){
        start = r.next;
        if(!start) break;
      }else{
        if(items.length < 50) break;
        start = start + 50;
      }
      if(items.length === 0) break;
    }
    return out.slice(0, max);
  }

  // =========================
  // “Offline”: fila de ações (só RAM)
  // =========================
  const pendingOps = [];
  function enqueueOp(name, run){ pendingOps.push({ name, run }); }

  let flushBusy = false;
  async function flushOps(){
    if(flushBusy) return;
    if(pendingOps.length === 0) return;
    flushBusy = true;
    try{
      for(let i=0; i<25 && pendingOps.length; i++){
        const op = pendingOps[0];
        try{
          await op.run();
          pendingOps.shift();
          await sleep(90);
        }catch(_){
          break;
        }
      }
    } finally{
      flushBusy = false;
    }
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
        g.gain.exponentialRampToValueAtTime(0.20, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.18);
      };
      make(t0 + 0.00);
      make(t0 + 0.26);
      make(t0 + 0.52);
      setTimeout(()=>{ try{ ctx.close(); }catch(_){} }, 1000);
    }catch(_){}
  }

  // =========================
  // Paper plane animation — AMARELO ~10cm (maior) — 3D side
  // =========================
  function flyPlaneYellow(){
    try{
      const d = document.createElement("div");
      d.className = "cgdPlane";
      d.innerHTML = `
        <svg viewBox="0 0 240 140" width="380" height="380" aria-hidden="true">
          <defs>
            <linearGradient id="gBody" x1="0" x2="1">
              <stop offset="0" stop-color="#ffe86a"/>
              <stop offset="0.55" stop-color="#ffd400"/>
              <stop offset="1" stop-color="#ffbf00"/>
            </linearGradient>
            <linearGradient id="gShadow" x1="0" x2="1">
              <stop offset="0" stop-color="rgba(0,0,0,0.22)"/>
              <stop offset="1" stop-color="rgba(0,0,0,0)"/>
            </linearGradient>
          </defs>

          <!-- “corpo” do avião (lateral 3D) -->
          <path d="M12 74 L220 18 L148 112 L120 86 L12 74 Z"
                fill="url(#gBody)" stroke="rgba(0,0,0,.28)" stroke-width="4" />

          <!-- dobra superior -->
          <path d="M120 86 L220 18"
                stroke="rgba(0,0,0,.28)" stroke-width="4" />

          <!-- sombra/dobra inferior para dar 3D -->
          <path d="M12 74 L120 86 L148 112"
                fill="url(#gShadow)" opacity="0.55"/>

          <!-- “bico” -->
          <path d="M220 18 L210 48 L196 30 Z" fill="rgba(255,255,255,.22)" />
        </svg>
      `;
      document.body.appendChild(d);
      setTimeout(()=>{ try{ d.remove(); }catch(_){} }, 2200);
    }catch(_){}
  }

  // =========================
  // CSS
  // =========================
  function injectCSS(){
    const css = `
#cgdApp{
  --radius:18px;
  --border: rgba(30,40,70,.12);
  --text: rgba(18,26,40,.92);
  --muted: rgba(18,26,40,.62);
  --card2: rgba(255,255,255,.92);
  --shadow: 0 10px 30px rgba(20,30,60,.10);

  min-height: calc(100vh - 90px);
  padding: 10px 12px 120px;
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
  color: var(--text);
  background:
    radial-gradient(900px 600px at 15% 20%, rgba(176,140,255,.18), transparent 55%),
    radial-gradient(900px 600px at 85% 20%, rgba(120,210,255,.14), transparent 55%),
    radial-gradient(900px 650px at 55% 95%, rgba(255,150,200,.12), transparent 60%),
    linear-gradient(135deg, #f7f3ff, #f3fbff 50%, #fff7fb);
}

/* Top bar */
.cgdTop{
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(18,20,24,.92);
  color: #fff;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  box-shadow: var(--shadow);
}
.cgdTopLeft{ display:flex; align-items:center; gap:10px; min-width: 320px; }
.cgdLogo{
  width: 56px; height: 56px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.14);
  object-fit: cover;
  background: rgba(255,255,255,.08);
}
.cgdTitle{ font-weight: 950; letter-spacing:.2px; font-size: 13px; white-space: nowrap; }
.cgdTopRight{ display:flex; gap:8px; align-items:center; flex-wrap: wrap; justify-content: flex-end; }

.cgdPill{
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.10);
  color:#fff;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 950;
}

/* Botões com contraste forte (padrão) */
.cgdBtn{
  cursor:pointer;
  border: 2px solid rgba(255,255,255,.22);
  background: rgba(10,10,12,.92);
  color:#fff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 950;
}
.cgdBtn:active{ transform: translateY(1px); }
.cgdBtn[disabled]{ opacity:.6; cursor:not-allowed; transform:none; }

/* Mini botões */
.cgdMiniBtn{
  cursor:pointer;
  border: 2px solid rgba(10,10,12,.85);
  background: rgba(255,255,255,.95);
  color: rgba(10,10,12,.92);
  border-radius: 12px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 950;
}
.cgdMiniBtn.primary{
  background: rgba(120,210,255,.32);
  border-color: rgba(10,10,12,.75);
}
.cgdMiniBtn.danger{
  background: rgba(255,70,120,.18);
  border-color: rgba(10,10,12,.75);
}

/* Layout */
.cgdLayout{
  margin-top: 12px;
  display:flex;
  gap: 12px;
  align-items: stretch;
}

.cgdGrid{
  flex: 1 1 auto;
  display:grid;
  grid-template-columns: 0.85fr 2.15fr;
  gap: 12px;
}

/* Sidebar FILA — +20% largura */
.cgdQueueSide{
  width: 390px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255,255,255,.62);
  box-shadow: var(--shadow);
  overflow:hidden;
  display:flex;
  flex-direction: column;
  min-height: 68vh;
}
.cgdQueueHead{
  padding: 10px 10px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,.78);
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 8px;
}
.cgdQueueHead .qt{
  width: 100%;
  text-align: center;
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.3px;
  text-transform: uppercase;
  white-space: nowrap;
}
.cgdQueueBody{
  padding: 10px;
  overflow:auto;
  min-height: 0;
  display:flex;
  flex-direction: column;
  gap: 8px;
}
.cgdQueueRowItem{
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255,255,255,.92);
  padding: 10px 10px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 8px;
}
.cgdQueueRowItem .nm{ font-weight: 950; font-size: 12px; }
.cgdQueueRowItem .ord{ font-weight: 950; opacity:.65; font-size: 12px; }
.cgdQueueArrows{ display:flex; gap:6px; align-items:center; }

/* Colunas */
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

/* Cabeçalho das colunas — título central e ações abaixo */
.cgdColHead{
  padding: 8px 10px 10px;
  background: rgba(255,255,255,.78);
  border-bottom: 1px solid var(--border);
}
.cgdColHead .hTitle{
  width:100%;
  text-align:center;
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.3px;
  text-transform: uppercase;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cgdColHead .hActionsRow{
  margin-top: 8px;
  display:flex;
  gap:8px;
  align-items:center;
  flex-wrap:wrap;
  justify-content:center;
}

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
.cgdBadge.oper{ border: 0; padding: 5px 10px; }
.cgdActions{
  margin-top: 10px;
  display:flex;
  gap:8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* 🚨 NOVO LEAD: preto/branco; com leads -> vermelho/preto */
.cgdAlertBox{
  border: 2px solid rgba(10,10,12,.85);
  border-radius: 16px;
  padding: 12px;
  background: rgba(10,10,12,.94);
  color: #fff;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}
.cgdAlertBox.hot{
  background: rgba(255,0,0,.92);
  color: #111;
  border-color: rgba(0,0,0,.35);
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
  opacity: .92;
  font-weight: 900;
}

/* HISTÓRICO em 2 colunas */
#listWho.cgdWhoGrid{
  display:grid !important;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 1100px){
  #listWho.cgdWhoGrid{ grid-template-columns: 1fr; }
}

/* Usuária: foto maior + layout */
.cgdUserLine{
  display:flex;
  gap:10px;
  align-items:flex-start;
}
.cgdUserPic{
  width: 52px; height: 52px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid rgba(0,0,0,.10);
  background:#fff;
  flex: 0 0 auto;
}

/* Bottom bar */
.cgdBottom{
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 80;
  background: rgba(16,16,18,.96); /* ✅ cinza bem escuro */
  color: #fff;
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255,255,255,.10);
  padding: 10px 12px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 12px;
}
.cgdBottom .bLeft{ display:flex; align-items:flex-start; gap:10px; min-width: 360px; }
.cgdBottom .bCenter{ flex:1; text-align:center; font-style: italic; font-weight: 900; opacity:.92; }
.cgdBottom .bRight{ text-align:right; font-weight: 900; opacity:.92; min-width: 520px; }
.cgdBossPics{ display:flex; gap:8px; align-items:center; margin-top:2px; }
.cgdBossPic{
  width: 34px; height: 34px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(255,255,255,.08);
}
.cgdAddrWrap{ display:flex; flex-direction:column; gap:4px; }
.cgdAddrLabel{ font-size: 11px; font-weight: 950; opacity: .85; }
.cgdAddr{ font-size: 11px; font-weight: 900; opacity: .92; line-height: 1.15; }
.cgdCnpjRow{
  display:flex;
  gap:14px;
  align-items:flex-start;
  justify-content:flex-end;
  flex-wrap: wrap;
  font-size: 11px;
  line-height: 1.25;
}
.cgdCnpjBox{ white-space: nowrap; }
.cgdCnpjBox b{ font-size: 11px; }

/* Modals */
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
  width: min(1180px, 96vw);
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
  vertical-align: top;
}
.cgdTable th{ text-align:left; font-weight: 950; background: rgba(245,248,255,.8); }
.cgdTable tr:last-child td{ border-bottom: 0; }

body{ padding-bottom: 120px !important; }

/* Paper plane */
.cgdPlane{
  position: fixed;
  top: 88px;
  left: -520px;
  width: 380px;
  height: 380px;
  z-index: 9999;
  pointer-events:none;
  opacity: .98;
  animation: planeFly 1.9s linear forwards;
  filter: drop-shadow(0 18px 20px rgba(0,0,0,.18));
}
@keyframes planeFly{
  0%   { transform: translateX(0) rotate(6deg); opacity: .0; }
  10%  { opacity: .98; }
  100% { transform: translateX(calc(100vw + 920px)) rotate(-8deg); opacity: 0; }
}

/* DARK MODE */
body.cgdDark #cgdApp{
  background: linear-gradient(135deg, #2a2d33, #23262b 50%, #1f2227);
  color: rgba(255,255,255,.92);
}
body.cgdDark .cgdQueueSide,
body.cgdDark .cgdCol{
  background: rgba(25,27,31,.72) !important;
  border-color: rgba(255,255,255,.10) !important;
}
body.cgdDark .cgdColHead,
body.cgdDark .cgdQueueHead{
  background: rgba(25,27,31,.82) !important;
  border-color: rgba(255,255,255,.10) !important;
  color:#fff;
}
body.cgdDark .cgdCard{
  background: rgba(248,248,245,.92) !important;
  color: rgba(18,26,40,.92) !important;
}
body.cgdDark .cgdBadge{
  background: rgba(255,255,255,.9) !important;
}
@media (max-width: 1200px){
  .cgdLayout{ flex-direction: column; }
  .cgdQueueSide{ width: auto; min-height: unset; }
  .cgdBottom .bRight{ min-width: unset; }
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
  function escClose(e){ if(e.key === "Escape"){ closeModal(); } }
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
    dark: false,

    _newLeadFirstLoadDone: false,
    _newTopIds: [],

    newLeadsAll: [],
    newLeadsRender: [],
    pendingCount: 0,

    stats: { day:0, month:0 },

    userStats: {}, // {id: { pulledToday, pulledMonth, lastTwo, list? }}

    queue: { order:[], updatedAt:0, dealId:null, hiddenUsers:[] },
    queueLocalTouchTs: 0,

    lastServedUserName: "—",

    // cache fotos usuários (RAM)
    userPhoto: new Map(),         // id -> url (string)
    userPhotoTs: new Map(),       // id -> ms
    userPhotoPending: new Set(),  // id
  };

  // =========================
  // Fotos: robusto + rápido
  // =========================
  const BLANK_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  async function fetchUserPhotoOnce(userId){
    const r = await bx("user.get", { ID: String(userId) }, { timeoutMs: 12000 });
    const u = Array.isArray(r) ? r[0] : (r?.[0] || r);
    const photo = (u && (u.PERSONAL_PHOTO || u.WORK_PHOTO)) ? String(u.PERSONAL_PHOTO || u.WORK_PHOTO) : "";
    return photo || "";
  }

  async function ensureUserPhoto(userId){
    const id = String(userId);
    const now = Date.now();

    const ts = state.userPhotoTs.get(id) || 0;
    if(state.userPhoto.has(id) && (now - ts) < 30*60*1000) return state.userPhoto.get(id);

    if(state.userPhotoPending.has(id)) return state.userPhoto.get(id) || "";

    state.userPhotoPending.add(id);

    let photo = "";
    try{
      for(let i=0;i<3;i++){
        try{
          photo = await fetchUserPhotoOnce(id);
          if(photo) break;
        }catch(_){}
        await sleep(180 + i*240);
      }
    } finally{
      state.userPhotoPending.delete(id);
    }

    state.userPhoto.set(id, photo || "");
    state.userPhotoTs.set(id, now);
    return state.userPhoto.get(id) || "";
  }

  async function warmUserPhotos(){
    const ids = CONFIG.USERS.map(u=>String(u.id));
    const bosses = CONFIG.BOSSES.map(x=>String(x));
    const all = Array.from(new Set(ids.concat(bosses)));

    for(let i=0;i<all.length;i+=6){
      const part = all.slice(i,i+6);
      await Promise.all(part.map(id=>ensureUserPhoto(id)));
      await sleep(120);
    }
  }

  async function renderBossPics(){
    const box = document.getElementById("bossPics");
    if(!box) return;
    box.innerHTML = "";
    const ids = CONFIG.BOSSES.map(String);
    ids.forEach(id=>{
      const img = document.createElement("img");
      img.className = "cgdBossPic";
      img.alt = "Sócio";
      img.loading = "lazy";
      img.src = state.userPhoto.get(id) || BLANK_IMG;
      img.onerror = ()=>{ img.src = BLANK_IMG; };
      box.appendChild(img);
    });

    setTimeout(()=>{
      ids.forEach((id, idx)=>{
        const img = box.children[idx];
        if(!img) return;
        const url = state.userPhoto.get(id) || "";
        if(url) img.src = url;
      });
    }, 600);
  }

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
            <div class="cgdPill" id="pillPending">Pendentes: 0</div>
            <div class="cgdPill" id="pillDay">Leads do dia: 0</div>
            <div class="cgdPill" id="pillMonth">Leads do mês: 0</div>

            <select class="cgdSelect" id="searchScope">
              <option value="ALL">Busca geral</option>
              ${CONFIG.USERS.map(u=>`<option value="${esc(u.id)}">Busca: ${esc(u.name)}</option>`).join("")}
            </select>
            <input class="cgdInput" id="searchBox" placeholder="Buscar lead por nome…" style="min-width:220px" />
            <button class="cgdBtn" id="btnSearch">Buscar</button>

            <button class="cgdBtn" id="btnGET">GET</button>
            <button class="cgdBtn" id="btnVendas">VENDAS</button>

            <button class="cgdBtn" id="btnRefresh">Atualizar</button>
            <button class="cgdBtn" id="btnSound">Som: ON</button>
            <button class="cgdBtn" id="btnDark">Modo: Claro</button>
          </div>
        </div>

        <div class="cgdLayout">
          <div class="cgdGrid">
            <section class="cgdCol" id="colNew">
              <div class="cgdColHead">
                <div class="hTitle">NOVOS LEADS</div>
                <div class="hActionsRow">
                  <button class="cgdBtn" id="btnBatch">Transferir em lote</button>
                  <button class="cgdBtn" id="btnRefreshNew">Atualizar</button>
                </div>
              </div>

              <div class="cgdList" id="listNew">
                <div class="cgdAlertBox" id="alertNew" style="display:none">
                  <div class="txt">
                    🚨 <b>NOVO LEAD</b>
                    <small>Alarme sonoro enquanto existir lead em “NOVO LEAD”.</small>
                  </div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                    <button class="cgdBtn" id="btnSilence">Silenciar</button>
                    <button class="cgdBtn" id="btnSoundOn" style="display:none">Ligar som</button>
                  </div>
                </div>
                <div style="opacity:.7;font-weight:900">Carregando…</div>
              </div>
            </section>

            <section class="cgdCol" id="colWho">
              <div class="cgdColHead">
                <div class="hTitle">HISTÓRICO DE LEADS</div>
                <div class="hActionsRow">
                  <button class="cgdBtn" id="btnHideUsers">Ocultar usuárias</button>
                  <button class="cgdBtn" id="btnRefreshWho">Atualizar</button>
                </div>
              </div>
              <div class="cgdList cgdWhoGrid" id="listWho">
                <div style="opacity:.7;font-weight:900">Carregando…</div>
              </div>
            </section>
          </div>

          <aside class="cgdQueueSide" id="queueSide">
            <div class="cgdQueueHead">
              <div class="qt">FILA</div>
              <button class="cgdBtn" id="btnQueueManage">Gerenciar</button>
            </div>
            <div class="cgdQueueBody" id="queueBody">
              <div style="opacity:.7;font-weight:900">Carregando fila…</div>
            </div>
            <div style="padding:10px; border-top:1px solid var(--border); display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end">
              <button class="cgdBtn" id="btnQueueWalk">ANDAR FILA</button>
              <button class="cgdBtn" id="btnQueueReset">RESETAR</button>
            </div>
            <div style="padding:10px; border-top:1px solid var(--border); font-size:11px; font-weight:900; opacity:.7">
              Última: <b id="lastServed">—</b> • <span id="statusLine">Atualizado: —</span>
            </div>
          </aside>
        </div>

        <div class="cgdBottom">
          <div class="bLeft">
            <div class="cgdBossPics" id="bossPics"></div>
            <div class="cgdAddrWrap">
              <div class="cgdAddrLabel">Endereço</div>
              <div class="cgdAddr">Av Ayrton Senna, 2500, SS109, Barra da Tijuca</div>
            </div>
          </div>

          <div class="bCenter">System created by GRUPO CGD</div>

          <div class="bRight">
            <div class="cgdCnpjRow">
              <div class="cgdCnpjBox"><b>CGD CORRETORA</b> CNPJ 01.654.471/0001-86 • SUSEP 202031791</div>
              <div class="cgdCnpjBox"><b>CGD BARRA</b> CNPJ 53.013.848/0001-11 • SUSEP 242158650</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================
  // Queue JSON via Pipeline 27 (multi-PC)
  // =========================
  async function ensureQueueDeal(){
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

    const id = await bx("crm.deal.add", {
      fields: {
        CATEGORY_ID: CONFIG.QUEUE.CATEGORY_ID,
        STAGE_ID: CONFIG.QUEUE.STAGE_ID,
        TITLE: `${CONFIG.QUEUE.TITLE_KEY} FILA ATENDIMENTO`,
        [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify({ v:1, order:[], hiddenUsers:[], updatedAt: Date.now() })
      }
    });
    return bx("crm.deal.get", { id: String(id) });
  }

  function parseQueue(json){
    try{
      const o = JSON.parse(json || "{}");
      const order = Array.isArray(o.order) ? o.order.map(String) : [];
      const hiddenUsers = Array.isArray(o.hiddenUsers) ? o.hiddenUsers.map(String) : [];
      const updatedAt = +o.updatedAt || 0;
      return { order, hiddenUsers, updatedAt };
    }catch(_){
      return { order:[], hiddenUsers:[], updatedAt:0 };
    }
  }

  let queueBusy = false;
  async function withQueueLock(fn){
    for(let i=0; i<20 && queueBusy; i++) await sleep(60);
    queueBusy = true;
    try{ return await fn(); }
    finally{ queueBusy = false; }
  }

  async function fetchQueue(){
    return withQueueLock(async ()=>{
      let lastErr = null;
      for(let attempt=0; attempt<3; attempt++){
        try{
          const deal = await ensureQueueDeal();
          const raw = deal && deal[CONFIG.QUEUE.UF_QUEUE_JSON];
          return { dealId: String(deal.ID), ...parseQueue(raw) };
        }catch(err){
          lastErr = err;
          await sleep(220 + attempt*420);
        }
      }
      throw lastErr || new Error("Falha ao carregar fila");
    });
  }

  async function saveQueue(dealId, payload){
    return withQueueLock(async ()=>{
      const next = {
        v: 1,
        order: Array.isArray(payload.order) ? payload.order.map(String) : [],
        hiddenUsers: Array.isArray(payload.hiddenUsers) ? payload.hiddenUsers.map(String) : [],
        updatedAt: Date.now()
      };

      let lastErr = null;
      for(let attempt=0; attempt<3; attempt++){
        try{
          await bx("crm.deal.update", {
            id: String(dealId),
            fields: { [CONFIG.QUEUE.UF_QUEUE_JSON]: JSON.stringify(next) }
          });
          return;
        }catch(err){
          lastErr = err;
          await sleep(260 + attempt*520);
        }
      }
      throw lastErr || new Error("Falha ao salvar fila");
    });
  }

  // =========================
  // Render queue sidebar
  // =========================
  function setStatus(txt){
    const el = $("#statusLine");
    if(el) el.textContent = txt;
  }
  function setLastServed(name){
    state.lastServedUserName = name || "—";
    const el = $("#lastServed");
    if(el) el.textContent = state.lastServedUserName;
  }

  function renderQueueSidebar(){
    const body = $("#queueBody");
    if(!body) return;
    body.innerHTML = "";

    const order = (state.queue.order || []).map(String);
    if(order.length === 0){
      const d = document.createElement("div");
      d.style.opacity = ".75";
      d.style.fontWeight = "900";
      d.textContent = "Fila vazia. Clique em Gerenciar para adicionar usuárias.";
      body.appendChild(d);
      return;
    }

    order.forEach((id, idx)=>{
      const u = CONFIG.USERS.find(x=> String(x.id)===String(id));
      const row = document.createElement("div");
      row.className = "cgdQueueRowItem";
      row.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center">
          <div class="ord">#${idx+1}</div>
          <div class="nm">${esc(u ? u.name : ("USER "+id))}</div>
        </div>
        <div class="cgdQueueArrows">
          <button class="cgdMiniBtn" data-q-up="${esc(id)}">↑</button>
          <button class="cgdMiniBtn" data-q-down="${esc(id)}">↓</button>
        </div>
      `;
      body.appendChild(row);
    });
  }

  function moveQueueLocal(userId, dir){
    const id = String(userId);
    const arr = (state.queue.order || []).map(String);
    const i = arr.indexOf(id);
    if(i < 0) return arr;
    if(dir==="up" && i>0){
      const t = arr[i-1]; arr[i-1]=arr[i]; arr[i]=t;
    }
    if(dir==="down" && i < arr.length-1){
      const t = arr[i+1]; arr[i+1]=arr[i]; arr[i]=t;
    }
    return arr;
  }

  async function persistQueueOrder(nextOrder){
    const q = state.queue.dealId ? state.queue : await fetchQueue();
    state.queueLocalTouchTs = Date.now();
    state.queue = { ...state.queue, ...q, order: nextOrder.slice() };
    renderQueueSidebar();
    enqueueOp("saveQueueOrder", async ()=>{ await saveQueue(q.dealId, { order: nextOrder, hiddenUsers: q.hiddenUsers||[] }); });
    flushOps();
  }

  // =========================
  // LEADS: fetch / actions
  // =========================
  async function fetchNewLeadsAll(){
    const items = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: CONFIG.LEAD_SELECT
    }, CONFIG.LIMIT_BATCH_MAX);
    return items || [];
  }

  async function fetchNewLeadsCount(){
    const data = await bxRaw("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO_LEAD },
      order: { ID: "DESC" },
      select: ["ID"],
      start: 0
    }, { timeoutMs: 22000 });
    const total = Number(data && data.total);
    if(Number.isFinite(total)) return total;
    const items = Array.isArray(data?.result) ? data.result : [];
    return items.length;
  }

  // =========================
  // ✅ Contagens por Data PEGAR (dia e mês) + múltiplos STATUS + tolerância de offset
  // =========================
  function countFilterBase(startISO, endISO){
    return {
      [">=" + CONFIG.UF_DATA_PEGAR]: startISO,
      ["<"  + CONFIG.UF_DATA_PEGAR]: endISO,
      "@STATUS_ID": CONFIG.COUNT_STATUS_ALLOWED.slice()
    };
  }

  async function countOnce(filter){
    const data = await bxRaw("crm.lead.list", {
      filter,
      order: { ID: "DESC" },
      select: ["ID"],
      start: 0
    }, { timeoutMs: 24000 });

    const total = Number(data && data.total);
    if(Number.isFinite(total)) return total;

    const items = Array.isArray(data?.result) ? data.result : [];
    return items.length;
  }

  function rangesWithOffsets(startISO, endISO){
    const swapOffset = (iso, newOff) => String(iso).replace(/([+-]\d{2}:\d{2})$/, newOff);
    const noOffset = (iso) => String(iso).replace(/([+-]\d{2}:\d{2})$/, "");

    const s = String(startISO), e = String(endISO);

    const variants = [
      { s, e },
      { s: swapOffset(s, "+03:00"), e: swapOffset(e, "+03:00") },
      { s: swapOffset(s, "-03:00"), e: swapOffset(e, "-03:00") },
      { s: noOffset(s), e: noOffset(e) }
    ];

    const seen = new Set();
    return variants.filter(v=>{
      const k = v.s + "||" + v.e;
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function fetchPegCountRangeAll(startISO, endISO){
    const vars = rangesWithOffsets(startISO, endISO);
    const totals = await Promise.all(vars.map(v => countOnce(countFilterBase(v.s, v.e)).catch(()=>0)));
    return Math.max(0, ...totals);
  }

  async function fetchPegCountRangeUser(userId, startISO, endISO){
    const vars = rangesWithOffsets(startISO, endISO);
    const totals = await Promise.all(vars.map(v => {
      const f = { ...countFilterBase(v.s, v.e), "ASSIGNED_BY_ID": String(userId) };
      return countOnce(f).catch(()=>0);
    }));
    return Math.max(0, ...totals);
  }

  function leadDisplayName(it){
    const nm = [it.NAME, it.SECOND_NAME, it.LAST_NAME].filter(Boolean).map(String).join(" ").trim();
    if(nm) return nm;
    const t = String(it.TITLE||"").trim();
    if(t && !/^Lead\s*#\d+$/i.test(t)) return t;
    if(t) return t;
    return `Lead #${it.ID}`;
  }

  function pickUF(it, key){
    try{
      return it && Object.prototype.hasOwnProperty.call(it, key) ? it[key] : (it ? it[key] : "");
    }catch(_){ return ""; }
  }

  function bestPhone(it){
    const uf = pickUF(it, CONFIG.UF_TELEFONE);
    if(uf) return String(uf);
    const p = it && it.PHONE;
    if(Array.isArray(p) && p[0] && p[0].VALUE) return String(p[0].VALUE);
    return "";
  }

  function operStyle(operRaw){
    const op = String(operRaw||"").toUpperCase();
    if(op.includes("LEVE")) return { bg:"#f5a23a", fg:"#111" };
    // ✅ PREVENT: azul escuro
    if(op.includes("PREVENT")) return { bg:"#0b2a6b", fg:"#fff" };
    if(op.includes("MEDSENIOR")) return { bg:"#63c454", fg:"#111" };
    if(op.includes("AMIL")) return { bg:"#7db7ff", fg:"#111" };
    if(op.includes("UNIMED")) return { bg:"#2f6f4f", fg:"#fff" };
    if(op.includes("ALICE")) return { bg:"#ff7bb8", fg:"#111" };
    return { bg:"rgba(255,255,255,.9)", fg:"rgba(18,26,40,.92)" };
  }

  function leadBadgesRich(it){
    const b = [];
    const oper = pickUF(it, CONFIG.UF_OPERADORA);
    const idade = pickUF(it, CONFIG.UF_IDADE);
    const bairro= pickUF(it, CONFIG.UF_BAIRRO);
    const fonte = pickUF(it, CONFIG.UF_FONTE);
    const dtuf  = pickUF(it, CONFIG.UF_DT_LEAD);
    const dt = dtuf ? fmtDateBRFromISO(dtuf) : "";
    const tel = bestPhone(it);

    if(oper)  b.push(["OPERADORA", oper]);
    if(idade) b.push(["IDADE", idade]);
    if(tel)   b.push(["TELEFONE", tel]);
    if(bairro)b.push(["BAIRRO", bairro]);
    if(fonte) b.push(["FONTE", fonte]);
    if(dt)    b.push(["DATA", dt]);

    if(b.length < 2){
      if(it.SOURCE_ID) b.push(["FONTE", it.SOURCE_ID]);
      if(it.DATE_CREATE) b.push(["CRIADO", String(it.DATE_CREATE).replace("T"," ").slice(0,16)]);
    }
    return b.slice(0, 6);
  }

  async function leadUpdate(id, fields){
    return bx("crm.lead.update", { id: String(id), fields });
  }
  async function leadDelete(id){
    return bx("crm.lead.delete", { id: String(id) });
  }

  async function actionPickLead(leadId, userId, rotateQueue){
    // UI otimista
    state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(leadId));
    state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
    renderNewLeads(state.newLeadsRender);
    renderPendingCount(state.pendingCount - 1);

    enqueueOp("pickLead", async ()=>{
      await leadUpdate(leadId, {
        ASSIGNED_BY_ID: String(userId),
        STATUS_ID: CONFIG.LEAD_STATUS.EM_ATENDIMENTO,
        [CONFIG.UF_DATA_PEGAR]: isoLocalWithOffset(new Date(), -180) // ✅ grava Data PEGAR coerente
      });
    });

    if(rotateQueue){
      enqueueOp("rotateQueueOnPick", async ()=>{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        const order = (q.order||[]).map(String);
        const uid = String(userId);
        const i = order.indexOf(uid);
        if(i >= 0){
          order.splice(i,1);
          order.push(uid);
          await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
          state.queueLocalTouchTs = Date.now();
          state.queue = { ...state.queue, ...q, order };
        }
      });
    }

    flushOps();
  }

  async function actionDiscardLead(leadId){
    state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(leadId));
    state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
    renderNewLeads(state.newLeadsRender);
    renderPendingCount(state.pendingCount - 1);

    enqueueOp("discardLead", async ()=>{
      await leadUpdate(leadId, { STATUS_ID: CONFIG.LEAD_STATUS.PERDIDO });
    });
    flushOps();
  }

  async function actionMoveLead(leadId, statusId){
    enqueueOp("moveLead", async ()=>{
      const fields = { STATUS_ID: statusId };
      if(statusId === CONFIG.LEAD_STATUS.QUALIFICADO){
        const lead = await bx("crm.lead.get", { id: String(leadId) }, { timeoutMs: 24000 });
        const t = String(lead?.TITLE||"").trim();
        if(!t.startsWith(CONFIG.HOT_EMOJI)){
          fields.TITLE = `${CONFIG.HOT_EMOJI} ${t}`.trim();
        }
      }
      await leadUpdate(leadId, fields);
    });
    flushOps();
  }

  async function actionTransferLead(leadId, toUserId){
    enqueueOp("transferLead", async ()=>{
      await leadUpdate(leadId, { ASSIGNED_BY_ID: String(toUserId) });
    });
    flushOps();
  }

  async function actionSetPrazo(leadId, iso){
    enqueueOp("setPrazo", async ()=>{
      await leadUpdate(leadId, { [CONFIG.UF_PRAZO]: iso });
    });
    flushOps();
  }

  async function createFollowUpDeal(userId, lead, iso){
    const stage = CONFIG.FOLLOWUP_DEALS.STAGE_BY_USER[String(userId)];
    const title = `FOLLOW-UP • ${leadDisplayName(lead)} • Lead #${lead.ID}`;
    enqueueOp("createDealFollowUp", async ()=>{
      await bx("crm.deal.add", {
        fields: {
          CATEGORY_ID: CONFIG.FOLLOWUP_DEALS.CATEGORY_ID,
          STAGE_ID: stage || "C17:NEW",
          ASSIGNED_BY_ID: String(userId),
          TITLE: title,
          COMMENTS: `Gerado pelo Painel de Leads • Referência: Lead #${lead.ID}`,
          [CONFIG.UF_PRAZO]: iso || undefined
        }
      }, { timeoutMs: 24000 });
    });
    flushOps();
  }

  // =========================
  // Render
  // =========================
  function renderPendingCount(n){
    state.pendingCount = Math.max(0, Number(n||0));
    const el = $("#pillPending");
    if(el) el.textContent = `Pendentes: ${state.pendingCount}`;
  }

  function renderNewLeads(items){
    const list = $("#listNew");
    if(!list) return;

    const alert = $("#alertNew");
    list.innerHTML = "";
    if(alert) list.appendChild(alert);

    const has = (items||[]).length > 0;
    if(alert){
      alert.style.display = has ? "flex" : "none";
      alert.classList.toggle("hot", has);
    }

    const btnSoundOn = $("#btnSoundOn");
    if(btnSoundOn) btnSoundOn.style.display = state.soundOn ? "none" : "inline-block";

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
      const title = leadDisplayName(it);

      const badges = leadBadgesRich(it).map(([k,v])=>{
        if(k === "OPERADORA"){
          const st = operStyle(v);
          return `<span class="cgdBadge oper" style="background:${esc(st.bg)}; color:${esc(st.fg)}">${esc(k)}: ${esc(v)}</span>`;
        }
        return `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`;
      }).join("");

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdCardRow">
          <div class="cgdLeadName">${esc(title)}</div>
        </div>
        <div class="cgdBadges">${badges}</div>
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

  function computeUserOrder(){
    const users = CONFIG.USERS.slice();
    const hiddenSet = new Set((state.queue.hiddenUsers||[]).map(String));
    const visible = users.filter(u => !hiddenSet.has(String(u.id)));

    function lastTs(u){
      const h = state.userStats[u.id];
      const d = h?.lastTwo?.[0]?.DATE_MODIFY;
      if(!d) return 0;
      const t = Date.parse(String(d));
      return Number.isFinite(t) ? t : 0;
    }

    visible.sort((a,b)=> lastTs(b)-lastTs(a));
    return visible;
  }

  function renderWho(){
    const list = $("#listWho");
    if(!list) return;
    list.innerHTML = "";

    const ordered = computeUserOrder();
    ordered.forEach(u=>{
      const us = state.userStats[u.id] || { pulledToday:0, pulledMonth:0, lastTwo:[] };
      const l1 = us.lastTwo[0];
      const l2 = us.lastTwo[1];

      const last1 = l1 ? `Último: ${leadDisplayName(l1)}` : "Último: —";
      const last2 = l2 ? `Anterior: ${leadDisplayName(l2)}` : "Anterior: —";

      const imgUrl = state.userPhoto.get(String(u.id)) || BLANK_IMG;

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdUserLine">
          <img class="cgdUserPic" alt="${esc(u.name)}" loading="lazy" src="${esc(imgUrl || BLANK_IMG)}" data-user-pic="${esc(u.id)}" />
          <div style="width:100%">
            <div class="cgdCardRow">
              <div style="font-weight:950">${esc(u.name)}</div>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
                <span class="cgdBadge">dia: ${esc(us.pulledToday||0)}</span>
                <span class="cgdBadge">mês: ${esc(us.pulledMonth||0)}</span>
                <button class="cgdMiniBtn" data-open-user="${esc(u.id)}">Abrir</button>
              </div>
            </div>
            <div style="margin-top:8px; font-size:12px; font-weight:900; opacity:.85">${esc(last1)}</div>
            <div style="margin-top:4px; font-size:12px; font-weight:900; opacity:.75">${esc(last2)}</div>
          </div>
        </div>
      `;
      list.appendChild(card);
    });

    if(ordered.length===0){
      const empty = document.createElement("div");
      empty.style.opacity=".75";
      empty.style.fontWeight="900";
      empty.textContent="Nenhuma usuária para mostrar (todas ocultas).";
      list.appendChild(empty);
    }

    setTimeout(async ()=>{
      const imgs = $$("img[data-user-pic]");
      const ids = imgs.map(img=>String(img.getAttribute("data-user-pic")));
      await Promise.all(ids.map(id=>ensureUserPhoto(id)));
      imgs.forEach(img=>{
        const id = String(img.getAttribute("data-user-pic"));
        const url = state.userPhoto.get(id) || "";
        if(url && img.src !== url) img.src = url;
      });
    }, 500);
  }

  // =========================
  // Fetch Usuárias (RÁPIDO pro Histórico)
  // =========================
  async function fetchUserLastTwoFast(userId){
    const last = await bxListAll("crm.lead.list", {
      filter: { "ASSIGNED_BY_ID": String(userId) },
      order: { DATE_MODIFY: "DESC" },
      select: ["ID","TITLE","NAME","LAST_NAME","SECOND_NAME","STATUS_ID","ASSIGNED_BY_ID","DATE_MODIFY"]
    }, CONFIG.LIMIT_LAST_TWO_FETCH);

    const lastTwo = (last||[]).filter(x=>{
      const st = String(x.STATUS_ID||"");
      return st===CONFIG.LEAD_STATUS.EM_ATENDIMENTO || st===CONFIG.LEAD_STATUS.QUALIFICADO || st===CONFIG.LEAD_STATUS.ATENDIDO;
    }).slice(0,2);

    return { lastTwo };
  }

  // Lista completa (somente quando abrir modal ABRIR)
  async function fetchUserStatsFull(userId){
    const { startISO: dayS, endISO: dayE } = dayRange();
    const { startISO: monS, endISO: monE } = monthRange();

    const [pulledToday, pulledMonth, list] = await Promise.all([
      fetchPegCountRangeUser(userId, dayS, dayE),
      fetchPegCountRangeUser(userId, monS, monE),
      bxListAll("crm.lead.list", {
        filter: { "ASSIGNED_BY_ID": String(userId) },
        order: { DATE_MODIFY: "DESC" },
        select: CONFIG.LEAD_SELECT
      }, CONFIG.LIMIT_USER_LAST)
    ]);

    const lastTwo = (list||[]).filter(x=>{
      const st = String(x.STATUS_ID||"");
      return st===CONFIG.LEAD_STATUS.EM_ATENDIMENTO || st===CONFIG.LEAD_STATUS.QUALIFICADO || st===CONFIG.LEAD_STATUS.ATENDIDO;
    }).slice(0,2);

    return { pulledToday, pulledMonth, lastTwo, list: list || [] };
  }

  // =========================
  // Modals
  // =========================
  async function modalHideUsers(){
    openModal("OCULTAR USUÁRIAS", `<div style="font-weight:900;opacity:.75">Carregando…</div>`);
    let q;
    try{
      q = await fetchQueue();
    }catch(_){
      closeModal();
      return openModal("OCULTAR USUÁRIAS", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    const hiddenSet = new Set((q.hiddenUsers||[]).map(String));

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Ocultar/mostrar cards de usuárias (sincroniza em todos os PCs)</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="huNone">Mostrar todas</button>
        <button class="cgdBtn" id="huApply">Aplicar</button>
      </div>

      <table class="cgdTable">
        <thead><tr><th>Oculta</th><th>Usuária</th></tr></thead>
        <tbody>
          ${CONFIG.USERS.map(u=>{
            const checked = hiddenSet.has(String(u.id)) ? "checked" : "";
            return `<tr>
              <td style="width:90px"><input type="checkbox" data-hu-user="${esc(u.id)}" ${checked} /></td>
              <td><b>${esc(u.name)}</b></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;

    openModal("OCULTAR USUÁRIAS", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`);

    $("#huNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-hu-user]').forEach(ch=> ch.checked = false);
    });

    $("#huApply")?.addEventListener("click", async ()=>{
      const btn = $("#huApply");
      try{
        btn.disabled = true;
        const hidden = $$('input[type=checkbox][data-hu-user]')
          .filter(ch=> ch.checked)
          .map(ch=> String(ch.getAttribute("data-hu-user")));

        await saveQueue(q.dealId, { order: q.order||[], hiddenUsers: hidden });

        const fresh = await fetchQueue();
        state.queue = { ...state.queue, ...fresh };
        renderQueueSidebar();
        renderWho();
        setStatus(`Atualizado: ${nowBRTime()}`);
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalQueueManage(){
    openModal("FILA • GERENCIAR", `<div style="font-weight:900;opacity:.75">Carregando…</div>`);
    let q;
    try{
      q = await fetchQueue();
    }catch(_){
      closeModal();
      return openModal("FILA • GERENCIAR", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    state.queue = { ...state.queue, ...q };

    const current = (q.order || []).map(String);
    const currentSet = new Set(current);

    const rows = CONFIG.USERS.map(u=>{
      const checked = currentSet.has(String(u.id)) ? "checked" : "";
      return `<tr data-u="${esc(u.id)}">
        <td style="width:90px"><input type="checkbox" data-q-user="${esc(u.id)}" ${checked} /></td>
        <td><b>${esc(u.name)}</b></td>
      </tr>`;
    }).join("");

    const body = `
      <div style="font-weight:950; margin-bottom:10px">Adicionar / retirar usuárias da fila</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="qAll">Selecionar todas</button>
        <button class="cgdBtn" id="qNone">Limpar</button>
        <button class="cgdBtn" id="qApply">Aplicar alterações</button>
      </div>

      <table class="cgdTable">
        <thead><tr><th>Na fila</th><th>Usuária</th></tr></thead>
        <tbody id="qTbody">${rows}</tbody>
      </table>
    `;

    openModal("FILA • GERENCIAR", body, `<button class="cgdBtn" data-close-modal>Fechar</button>`);

    const tbody = $("#qTbody");
    const getChecked = ()=> $$('input[type=checkbox][data-q-user]', tbody)
      .filter(ch=>ch.checked)
      .map(ch=> String(ch.getAttribute("data-q-user")));

    $("#qAll")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-q-user]', tbody).forEach(ch => ch.checked = true);
    });
    $("#qNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-q-user]', tbody).forEach(ch => ch.checked = false);
    });

    $("#qApply")?.addEventListener("click", async ()=>{
      const btn = $("#qApply");
      try{
        btn.disabled = true;

        const checked = getChecked();
        const keep = current.filter(id=> checked.includes(id));
        const add = checked.filter(id=> !keep.includes(id));
        const next = keep.concat(add);

        await saveQueue(q.dealId, { order: next, hiddenUsers: q.hiddenUsers||[] });
        const fresh = await fetchQueue();
        state.queueLocalTouchTs = Date.now();
        state.queue = { ...state.queue, ...fresh };
        renderQueueSidebar();
        setStatus(`Atualizado: ${nowBRTime()}`);
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalPickLead(leadId){
    const uops = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");
    const body = `
      <div style="font-weight:950;margin-bottom:10px">PEGAR lead</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <button class="cgdBtn" id="pickFirst">PRIMEIRA DA FILA</button>
      </div>

      <div style="height:1px;background:rgba(30,40,70,.10);margin:10px 0"></div>

      <div style="font-weight:950;margin-bottom:8px">Ou selecionar usuária:</div>
      <div class="cgdRow">
        <select class="cgdSelect" id="pickUser">${uops}</select>
        <button class="cgdBtn" id="pickGo">Confirmar</button>
      </div>
      <div style="font-size:11px;font-weight:900;opacity:.75;margin-top:10px">
        Ao confirmar: muda responsável e envia para <b>EM ATENDIMENTO</b>. A usuária vai para o final da fila.
      </div>
    `;
    openModal("PEGAR LEAD", body, `<button class="cgdBtn" data-close-modal>Cancelar</button>`);

    $("#pickFirst")?.addEventListener("click", async ()=>{
      const btn = $("#pickFirst");
      try{
        btn.disabled = true;

        const q = state.queue.dealId ? state.queue : await fetchQueue();
        const order = (q.order||[]).map(String);
        if(order.length === 0){
          alert("Fila vazia. Clique em FILA > Gerenciar para adicionar usuárias.");
          return;
        }

        const firstId = order.shift();
        order.push(firstId);

        state.queueLocalTouchTs = Date.now();
        state.queue = { ...state.queue, ...q, order: order.slice() };
        renderQueueSidebar();

        const nm = userNameById(firstId);
        setLastServed(nm);
        setStatus(`Próxima: ${nm} • ${nowBRTime()}`);

        enqueueOp("saveQueueRotate", async ()=>{
          await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] });
        });

        await actionPickLead(leadId, firstId, false);
        flushOps();
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });

    $("#pickGo")?.addEventListener("click", async ()=>{
      const btn = $("#pickGo");
      try{
        btn.disabled = true;
        const uid = $("#pickUser").value;
        await actionPickLead(leadId, uid, true);
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalBatchTransfer(){
    openModal("TRANSFERIR EM LOTE", `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote</div>
      <div style="opacity:.75;font-weight:900">Carregando leads pendentes…</div>
    `);

    let all;
    try{
      all = state.newLeadsAll && state.newLeadsAll.length ? state.newLeadsAll.slice() : await fetchNewLeadsAll();
    }catch(_){
      closeModal();
      return openModal("TRANSFERIR EM LOTE", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    const opsUser = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");

    function uniq(arr){
      const s = new Set(arr.filter(Boolean).map(String));
      return Array.from(s).sort((a,b)=> String(a).localeCompare(String(b)));
    }

    const operadoras = uniq(all.map(it=> pickUF(it, CONFIG.UF_OPERADORA)));
    const opsOper = [`<option value="ALL">Todas</option>`].concat(
      operadoras.map(o=> `<option value="${esc(o)}">${esc(o)}</option>`)
    ).join("");

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Transferir em lote</div>

      <div class="cgdRow" style="margin-bottom:12px">
        <label style="font-weight:950">Operadora:</label>
        <select class="cgdSelect" id="btOper">${opsOper}</select>

        <label style="font-weight:950">Data do Lead:</label>
        <input class="cgdInput" type="date" id="btDate" />

        <label style="font-weight:950">Transferir para:</label>
        <select class="cgdSelect" id="btUser">${opsUser}</select>

        <button class="cgdBtn" id="btApply">Aplicar filtro</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Leads listados: <b id="btCount">0</b></div>
        <div class="cgdBadge">Pendentes total: <b>${esc(state.pendingCount||all.length)}</b></div>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:80px">Sel.</th>
            <th>Lead</th>
            <th style="width:280px">Info</th>
          </tr>
        </thead>
        <tbody id="btTbody"></tbody>
      </table>
    `;

    openModal("TRANSFERIR EM LOTE", body, `
      <button class="cgdBtn" data-close-modal>Cancelar</button>
      <button class="cgdBtn" id="btDo">Transferir selecionados</button>
    `);

    const tbody = $("#btTbody");
    const countEl = $("#btCount");

    function matchDate(it, yyyy_mm_dd){
      if(!yyyy_mm_dd) return true;
      const dtuf = pickUF(it, CONFIG.UF_DT_LEAD);
      const t = Date.parse(String(dtuf||""));
      if(!Number.isFinite(t)) return false;
      const d = new Date(t);
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,"0");
      const da= String(d.getDate()).padStart(2,"0");
      return `${y}-${m}-${da}` === yyyy_mm_dd;
    }

    function filtered(){
      const op = $("#btOper").value;
      const date = $("#btDate").value;
      return all.filter(it=>{
        const oper = String(pickUF(it, CONFIG.UF_OPERADORA)||"");
        if(op!=="ALL" && oper!==op) return false;
        if(!matchDate(it, date)) return false;
        return true;
      });
    }

    function draw(list){
      countEl.textContent = String(list.length);
      tbody.innerHTML = list.length ? list.map(it=>{
        const info = leadBadgesRich(it);
        const infoHtml = info.map(([k,v])=> `<div style="font-weight:900;opacity:.85">${esc(k)}: ${esc(v)}</div>`).join("");
        return `
          <tr>
            <td><input type="checkbox" data-bt-id="${esc(it.ID)}" checked /></td>
            <td>
              <b>${esc(leadDisplayName(it))}</b>
              <div style="opacity:.7;font-weight:900;font-size:11px">STATUS: ${esc(stageName(it.STATUS_ID))}</div>
            </td>
            <td>${infoHtml}</td>
          </tr>
        `;
      }).join("") : `<tr><td colspan="3" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    draw(filtered());
    $("#btApply")?.addEventListener("click", ()=> draw(filtered()));

    $("#btDo")?.addEventListener("click", async ()=>{
      const btn = $("#btDo");
      const toId = $("#btUser").value;
      const ids = $$("input[type=checkbox][data-bt-id]", tbody)
        .filter(x=>x.checked)
        .map(x=> x.getAttribute("data-bt-id"));

      if(ids.length === 0) return alert("Selecione pelo menos 1 lead.");
      try{
        btn.disabled = true;

        ids.forEach(id=>{
          state.newLeadsAll = state.newLeadsAll.filter(x=> String(x.ID)!==String(id));
        });
        state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
        renderNewLeads(state.newLeadsRender);

        for(const id of ids){
          await actionPickLead(id, toId, true);
          await sleep(60);
        }
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  async function modalUserOpen(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    openModal(`ABRIR • ${u.name}`, `
      <div style="font-weight:950;margin-bottom:10px">Carregando leads…</div>
      <div style="opacity:.75;font-weight:900">Isso pode levar alguns segundos dependendo da conexão.</div>
    `);

    let us;
    try{
      // ✅ retry para reduzir erro intermitente
      us = await retryAsync(()=>fetchUserStatsFull(u.id), 3, 350);
    }catch(err){
      console.error(err);
      closeModal();
      return openModal(`ABRIR • ${u.name}`, `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    state.userStats[u.id] = us;
    renderWho();

    const body = `
      <div class="cgdRow" style="justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:950">LEADS DA USUÁRIA • buscar / mover / follow-up</div>
        <button class="cgdBtn" id="muRefresh">Atualizar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:10px">
        <div class="cgdBadge">Puxados (dia): <b>${esc(us.pulledToday||0)}</b></div>
        <div class="cgdBadge">Puxados (mês): <b>${esc(us.pulledMonth||0)}</b></div>
      </div>

      <div class="cgdRow" style="margin-bottom:12px">
        <input class="cgdInput" id="muSearch" placeholder="Filtrar na lista (rápido)..." style="min-width:260px" />
        <select class="cgdSelect" id="muStage">
          <option value="ALL">Todas as etapas</option>
          ${Object.values(CONFIG.LEAD_STATUS).map(st=>`<option value="${esc(st)}">${esc(stageName(st))}</option>`).join("")}
        </select>
        <button class="cgdBtn" id="muAll">Marcar todos</button>
        <button class="cgdBtn" id="muNone">Desmarcar</button>
      </div>

      <div class="cgdRow" style="margin-bottom:12px">
        <input class="cgdInput" type="datetime-local" id="muBulkDate" />
        <button class="cgdBtn" id="muBulkPrazo">FOLLOW-UP em lote</button>

        <select class="cgdSelect" id="muMoveTo">
          <option value="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">Mover p/ QUALIFICADO (🔥)</option>
          <option value="${esc(CONFIG.LEAD_STATUS.PERDIDO)}">Mover p/ PERDIDO</option>
          <option value="${esc(CONFIG.LEAD_STATUS.CONVERTIDO)}">Mover p/ CONVERTIDO</option>
          <option value="${esc(CONFIG.LEAD_STATUS.ATENDIDO)}">Mover p/ ATENDIDO</option>
          <option value="${esc(CONFIG.LEAD_STATUS.EM_ATENDIMENTO)}">Mover p/ EM ATENDIMENTO</option>
        </select>
        <button class="cgdBtn" id="muBulkMove">Mover em lote</button>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:70px">Sel.</th>
            <th>Lead</th>
            <th style="width:360px">Informações</th>
            <th style="width:300px">FOLLOW-UP</th>
            <th style="width:300px">Mover</th>
          </tr>
        </thead>
        <tbody id="muTbody"></tbody>
      </table>
    `;

    openModal(`ABRIR • ${u.name}`, body);

    const tbody = $("#muTbody");
    const search = $("#muSearch");
    const stageSel = $("#muStage");

    function listFiltered(){
      const q = (search.value||"").trim().toLowerCase();
      const st = (stageSel.value||"ALL");
      return (us.list||[]).filter(it=>{
        const title = leadDisplayName(it).toLowerCase();
        const rawT = String(it.TITLE||"").toLowerCase();
        if(q && !(title.includes(q) || rawT.includes(q))) return false;
        if(st!=="ALL" && String(it.STATUS_ID)!==String(st)) return false;
        return true;
      });
    }

    function infoHtml(it){
      const oper = pickUF(it, CONFIG.UF_OPERADORA);
      const idade= pickUF(it, CONFIG.UF_IDADE);
      const tel  = bestPhone(it);
      const bairro=pickUF(it, CONFIG.UF_BAIRRO);
      const fonte= pickUF(it, CONFIG.UF_FONTE);
      const dt   = fmtDateBRFromISO(pickUF(it, CONFIG.UF_DT_LEAD));
      return `
        <div style="font-weight:900;opacity:.9">OPERADORA: <b>${esc(oper||"—")}</b></div>
        <div style="font-weight:900;opacity:.9">IDADE: <b>${esc(idade||"—")}</b></div>
        <div style="font-weight:900;opacity:.9">TELEFONE: <b>${esc(tel||"—")}</b></div>
        <div style="font-weight:900;opacity:.9">BAIRRO: <b>${esc(bairro||"—")}</b></div>
        <div style="font-weight:900;opacity:.9">FONTE: <b>${esc(fonte||"—")}</b></div>
        <div style="font-weight:900;opacity:.9">DATA/HORA: <b>${esc(dt||"—")}</b></div>
      `;
    }

    function renderRows(){
      const list = listFiltered();
      tbody.innerHTML = list.length ? list.map(it=>{
        const id = String(it.ID);
        const name = leadDisplayName(it);
        const st = String(it.STATUS_ID||"—");
        const dm = (it.DATE_MODIFY||"").replace("T"," ").slice(0,19);
        const hot = String(it.TITLE||"").trim().startsWith(CONFIG.HOT_EMOJI) ? CONFIG.HOT_EMOJI+" " : "";
        return `<tr>
          <td><input type="checkbox" data-sel="${esc(id)}" /></td>
          <td>
            <b>${esc(hot + name)}</b>
            <div style="opacity:.7;font-weight:900;font-size:11px">STAGE: ${esc(stageName(st))} • ${esc(dm||"—")}</div>
          </td>
          <td>${infoHtml(it)}</td>
          <td>
            <div class="cgdRow">
              <input class="cgdInput" type="datetime-local" data-prazo="${esc(id)}" />
              <button class="cgdBtn" data-save-prazo="${esc(id)}">Salvar</button>
              <button class="cgdBtn" data-save-fupdeal="${esc(id)}">Salvar + Criar CARD</button>
            </div>
          </td>
          <td>
            <div class="cgdRow">
              <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.QUALIFICADO)}">Qualificado</button>
              <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.ATENDIDO)}">Atendido</button>
              <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.PERDIDO)}">Perdido</button>
              <button class="cgdBtn" data-move="${esc(id)}" data-to="${esc(CONFIG.LEAD_STATUS.CONVERTIDO)}">Convertido</button>
            </div>
          </td>
        </tr>`;
      }).join("") : `<tr><td colspan="5" style="opacity:.75;font-weight:900">Nenhum lead para mostrar.</td></tr>`;
    }

    renderRows();

    $("#muRefresh")?.addEventListener("click", async ()=>{
      closeModal();
      await modalUserOpen(userId);
    });

    search?.addEventListener("input", renderRows);
    stageSel?.addEventListener("change", renderRows);

    $("#muAll")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-sel]').forEach(ch=> ch.checked = true);
    });
    $("#muNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-sel]').forEach(ch=> ch.checked = false);
    });

    function selectedIds(){
      return $$('input[type=checkbox][data-sel]')
        .filter(ch=> ch.checked)
        .map(ch=> ch.getAttribute("data-sel"));
    }

    $("#muBulkPrazo")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const iso = isoFromLocalInput($("#muBulkDate")?.value || "");
      if(!iso) return alert("Preencha a data/hora do FOLLOW-UP.");
      for(const id of ids){
        await actionSetPrazo(id, iso);
        await sleep(60);
      }
      alert("FOLLOW-UP em lote enfileirado ✅ (sincroniza quando a conexão normalizar)");
    });

    $("#muBulkMove")?.addEventListener("click", async ()=>{
      const ids = selectedIds();
      if(!ids.length) return alert("Selecione pelo menos 1 lead.");
      const to = $("#muMoveTo")?.value;
      for(const id of ids){
        await actionMoveLead(id, to);
        await sleep(60);
      }
      alert("Movimento em lote enfileirado ✅ (sincroniza quando a conexão normalizar)");
    });

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const sp = e.target.closest("[data-save-prazo]");
      const sd = e.target.closest("[data-save-fupdeal]");
      const mv = e.target.closest("[data-move]");

      if(sp){
        const leadId = sp.getAttribute("data-save-prazo");
        const inp = $(`input[data-prazo="${CSS.escape(String(leadId))}"]`, $(".cgdModalBody"));
        const iso = isoFromLocalInput(inp?.value || "");
        if(!iso) return alert("Preencha data/hora corretamente.");
        await actionSetPrazo(leadId, iso);
        alert("FOLLOW-UP salvo ✅ (sincroniza quando normalizar a conexão)");
      }

      if(sd){
        const leadId = sd.getAttribute("data-save-fupdeal");
        const lead = (us.list||[]).find(x=> String(x.ID)===String(leadId));
        const inp = $(`input[data-prazo="${CSS.escape(String(leadId))}"]`, $(".cgdModalBody"));
        const iso = isoFromLocalInput(inp?.value || "");
        if(iso) await actionSetPrazo(leadId, iso);
        if(lead) await createFollowUpDeal(u.id, lead, iso || "");
        alert("FOLLOW-UP + CARD enfileirados ✅ (sincroniza quando normalizar a conexão)");
      }

      if(mv){
        const leadId = mv.getAttribute("data-move");
        const to = mv.getAttribute("data-to");
        await actionMoveLead(leadId, to);
        alert("Movimento enfileirado ✅ (sincroniza quando normalizar a conexão)");
      }
    });
  }

  // =========================
  // Busca global no Bitrix por nome
  // =========================
  function uniqById(list){
    const m = new Map();
    (list||[]).forEach(x=>{
      const id = String(x.ID||"");
      if(id) m.set(id, x);
    });
    return Array.from(m.values());
  }

  async function searchLeadsByName(term, assignedIdOrAll){
    const t = String(term||"").trim();
    if(!t) return [];

    const baseFilter = {};
    if(assignedIdOrAll && assignedIdOrAll !== "ALL"){
      baseFilter["ASSIGNED_BY_ID"] = String(assignedIdOrAll);
    }

    const a = await bxListAll("crm.lead.list", {
      filter: { ...baseFilter, "%TITLE": t },
      order: { DATE_MODIFY:"DESC" },
      select: CONFIG.LEAD_SELECT
    }, 60).catch(()=>[]);

    const b = await bxListAll("crm.lead.list", {
      filter: { ...baseFilter, "%NAME": t },
      order: { DATE_MODIFY:"DESC" },
      select: CONFIG.LEAD_SELECT
    }, 60).catch(()=>[]);

    const c = await bxListAll("crm.lead.list", {
      filter: { ...baseFilter, "%LAST_NAME": t },
      order: { DATE_MODIFY:"DESC" },
      select: CONFIG.LEAD_SELECT
    }, 60).catch(()=>[]);

    const merged = uniqById([...(a||[]), ...(b||[]), ...(c||[])]);
    return merged.slice(0, 60);
  }

  function modalTransferOne(leadId){
    const opts = CONFIG.USERS.map(u=> `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");
    openModal("TRANSFERIR LEAD", `
      <div style="font-weight:950;margin-bottom:10px">Transferir Lead #${esc(leadId)}</div>
      <div class="cgdRow">
        <select class="cgdSelect" id="trUser">${opts}</select>
        <button class="cgdBtn" id="trGo">Transferir</button>
      </div>
      <div style="opacity:.75;font-weight:900;margin-top:10px">Apenas muda o RESPONSÁVEL (não altera etapa).</div>
    `, `<button class="cgdBtn" data-close-modal>Cancelar</button>`);
    $("#trGo")?.addEventListener("click", async ()=>{
      const btn = $("#trGo");
      try{
        btn.disabled = true;
        const uid = $("#trUser").value;
        await actionTransferLead(leadId, uid);
        alert("Transferência enfileirada ✅");
        closeModal();
      }catch(err){
        console.error(err);
      }finally{
        btn.disabled = false;
      }
    });
  }

  function modalSearchResults(term, results){
    const rows = (results||[]).map(it=>{
      const name = leadDisplayName(it);
      const st = stageName(it.STATUS_ID);
      const respId = String(it.ASSIGNED_BY_ID||"");
      const respNm = userNameById(respId);
      const oper = pickUF(it, CONFIG.UF_OPERADORA);
      const idade = pickUF(it, CONFIG.UF_IDADE);
      const tel = bestPhone(it);
      const bairro = pickUF(it, CONFIG.UF_BAIRRO);
      const fonte = pickUF(it, CONFIG.UF_FONTE);
      const dt = fmtDateBRFromISO(pickUF(it, CONFIG.UF_DT_LEAD));
      return `
        <tr>
          <td style="width:70px"><input type="checkbox" data-sel-del="${esc(it.ID)}" /></td>
          <td>
            <b>${esc(name)}</b>
            <div style="opacity:.7;font-weight:900;font-size:11px">STAGE: ${esc(st)} • RESPONSÁVEL: <b>${esc(respNm)}</b></div>
          </td>
          <td style="width:360px">
            <div style="font-weight:900;opacity:.9">OPERADORA: ${esc(oper||"—")}</div>
            <div style="font-weight:900;opacity:.9">IDADE: ${esc(idade||"—")}</div>
            <div style="font-weight:900;opacity:.9">TELEFONE: ${esc(tel||"—")}</div>
            <div style="font-weight:900;opacity:.9">BAIRRO: ${esc(bairro||"—")}</div>
            <div style="font-weight:900;opacity:.9">FONTE: ${esc(fonte||"—")}</div>
            <div style="font-weight:900;opacity:.9">DATA/HORA: ${esc(dt||"—")}</div>
          </td>
          <td style="width:240px;text-align:right">
            <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
              <button class="cgdBtn" data-open-lead="${esc(it.ID)}">Abrir</button>
              <button class="cgdBtn" data-transfer-lead="${esc(it.ID)}">Transferir</button>
              <button class="cgdBtn" data-del-one="${esc(it.ID)}">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    openModal(`BUSCA • ${term}`, `
      <div class="cgdRow" style="justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:950">Resultados: <b>${esc((results||[]).length)}</b></div>
        <div class="cgdRow">
          <button class="cgdBtn" id="sdAll">Marcar todos</button>
          <button class="cgdBtn" id="sdNone">Desmarcar</button>
          <button class="cgdBtn" id="sdDel">Excluir selecionados</button>
        </div>
      </div>
      <table class="cgdTable">
        <thead><tr><th>Sel.</th><th>Lead</th><th>Dados</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" style="opacity:.75;font-weight:900">Nenhum lead encontrado.</td></tr>`}</tbody>
      </table>
    `);

    $("#sdAll")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-sel-del]').forEach(ch=> ch.checked = true);
    });
    $("#sdNone")?.addEventListener("click", ()=>{
      $$('input[type=checkbox][data-sel-del]').forEach(ch=> ch.checked = false);
    });

    $("#sdDel")?.addEventListener("click", async ()=>{
      const ids = $$('input[type=checkbox][data-sel-del]').filter(ch=>ch.checked).map(ch=>ch.getAttribute("data-sel-del"));
      if(!ids.length) return alert("Selecione pelo menos 1 lead para excluir.");
      if(!confirm(`Excluir ${ids.length} lead(s)?`)) return;
      try{
        for(const id of ids){
          enqueueOp("deleteLead", async ()=>{ await leadDelete(id); });
          await sleep(40);
        }
        flushOps();
        alert("Exclusões enfileiradas ✅");
        closeModal();
      }catch(err){
        console.error(err);
      }
    });

    $(".cgdModalBody")?.addEventListener("click", async (e)=>{
      const b = e.target.closest("[data-open-lead]");
      const t = e.target.closest("[data-transfer-lead]");
      const d = e.target.closest("[data-del-one]");

      if(b){
        const id = b.getAttribute("data-open-lead");
        await modalLeadDetails(id);
      }
      if(t){
        const id = t.getAttribute("data-transfer-lead");
        modalTransferOne(id);
      }
      if(d){
        const id = d.getAttribute("data-del-one");
        if(!confirm(`Excluir Lead #${id}?`)) return;
        enqueueOp("deleteLeadOne", async ()=>{ await leadDelete(id); });
        flushOps();
        alert("Exclusão enfileirada ✅");
      }
    });
  }

  async function modalLeadDetails(leadId){
    openModal("LEAD", `<div style="opacity:.75;font-weight:900">Carregando…</div>`);
    try{
      const it = await bx("crm.lead.get", { id: String(leadId) }, { timeoutMs: 24000 });
      const name = leadDisplayName(it);
      const st = stageName(it.STATUS_ID);

      const respId = String(it.ASSIGNED_BY_ID||"");
      const respNm = userNameById(respId);

      const oper = pickUF(it, CONFIG.UF_OPERADORA);
      const idade = pickUF(it, CONFIG.UF_IDADE);
      const tel = bestPhone(it);
      const bairro = pickUF(it, CONFIG.UF_BAIRRO);
      const fonte = pickUF(it, CONFIG.UF_FONTE);
      const dt = fmtDateBRFromISO(pickUF(it, CONFIG.UF_DT_LEAD));

      openModal(`LEAD • ${name}`, `
        <div class="cgdRow" style="margin-bottom:10px">
          <div class="cgdBadge">STAGE: <b>${esc(st)}</b></div>
          <div class="cgdBadge">RESPONSÁVEL: <b>${esc(respNm)}</b></div>
          <div class="cgdBadge">ID: <b>${esc(it.ID)}</b></div>
        </div>
        <div style="font-weight:900;opacity:.9;line-height:1.4">
          <div>OPERADORA: <b>${esc(oper||"—")}</b></div>
          <div>IDADE: <b>${esc(idade||"—")}</b></div>
          <div>TELEFONE: <b>${esc(tel||"—")}</b></div>
          <div>BAIRRO: <b>${esc(bairro||"—")}</b></div>
          <div>FONTE: <b>${esc(fonte||"—")}</b></div>
          <div>DATA/HORA: <b>${esc(dt||"—")}</b></div>
        </div>
      `);
    }catch(_){
      closeModal();
      openModal("LEAD", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }
  }

  // =========================
  // Refresh orchestration
  // =========================
  async function refreshNewLeads(){
    try{
      const items = await fetchNewLeadsAll();
      state.newLeadsAll = items || [];
      state.newLeadsRender = state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER);
      renderNewLeads(state.newLeadsRender);

      const topIds = (items||[]).slice(0,5).map(x=>String(x.ID||"")).filter(Boolean);

      // ✅ aviãozinho só quando ENTRA lead novo (topId novo que não existia no top anterior)
      if(!state._newLeadFirstLoadDone){
        state._newLeadFirstLoadDone = true;
        state._newTopIds = topIds.slice();
        return;
      }

      const prev = new Set(state._newTopIds || []);
      const newest = topIds[0] || "";
      const isNewEntry = newest && !prev.has(newest);

      // Atualiza memória dos top ids
      state._newTopIds = topIds.slice();

      if(isNewEntry){
        flyPlaneYellow();
        if(state.soundOn) tripleBeep();
      }
    }catch(err){
      console.warn("new leads fetch failed", err);
    }
  }

  async function refreshPendingCount(){
    try{
      const n = await fetchNewLeadsCount();
      renderPendingCount(n);
    }catch(err){
      console.warn("pending count failed", err);
    }
  }

  async function refreshStats(){
    try{
      const { startISO: dayS, endISO: dayE } = dayRange();
      const { startISO: monS, endISO: monE } = monthRange();

      const [day, month] = await Promise.all([
        fetchPegCountRangeAll(dayS, dayE),
        fetchPegCountRangeAll(monS, monE)
      ]);

      state.stats = { day: day||0, month: month||0 };
      renderStats(state.stats);
    }catch(err){
      console.warn("stats failed", err);
    }
  }

  async function refreshUsersFast(){
    try{
      const { startISO: dayS, endISO: dayE } = dayRange();
      const { startISO: monS, endISO: monE } = monthRange();

      const users = CONFIG.USERS.slice();
      for(let i=0;i<users.length;i+=4){
        const part = users.slice(i,i+4);
        const jobs = part.map(async u=>{
          const [d, m, lt] = await Promise.all([
            fetchPegCountRangeUser(u.id, dayS, dayE),
            fetchPegCountRangeUser(u.id, monS, monE),
            fetchUserLastTwoFast(u.id)
          ]);
          state.userStats[u.id] = {
            ...(state.userStats[u.id]||{}),
            pulledToday: d||0,
            pulledMonth: m||0,
            lastTwo: lt.lastTwo || []
          };
        });
        await Promise.all(jobs);
        renderWho();
        await sleep(120);
      }
    }catch(err){
      console.warn("user stats failed", err);
    }
  }

  async function refreshQueue(){
    try{
      if(Date.now() - state.queueLocalTouchTs < 1400) return;

      const q = await fetchQueue();
      state.queue = { ...state.queue, ...q };
      renderQueueSidebar();
    }catch(err){
      console.warn("queue failed", err);
      renderQueueSidebar();
    }
  }

  async function hardRefreshAll(){
    setStatus(`Atualizando… (${nowBRTime()})`);
    await Promise.allSettled([
      refreshNewLeads(),
      refreshPendingCount(),
      refreshStats(),
      refreshQueue()
    ]);
    await refreshUsersFast();
    setStatus(`Atualizado: ${nowBRTime()}`);
  }

  // =========================
  // Events / UI
  // =========================
  function updateSoundUI(){
    $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;
    const so = $("#btnSoundOn");
    if(so) so.style.display = state.soundOn ? "none" : "inline-block";
  }

  function applyDark(){
    document.body.classList.toggle("cgdDark", !!state.dark);
    const b = $("#btnDark");
    if(b) b.textContent = `Modo: ${state.dark ? "Escuro" : "Claro"}`;
  }

  function wire(){
    $("#btnSound")?.addEventListener("click", ()=>{
      state.soundOn = !state.soundOn;
      updateSoundUI();
    });

    $("#btnSilence")?.addEventListener("click", ()=>{
      state.soundOn = false;
      updateSoundUI();
    });

    $("#btnSoundOn")?.addEventListener("click", ()=>{
      state.soundOn = true;
      updateSoundUI();
      if((state.newLeadsAll||[]).length > 0) tripleBeep();
    });

    $("#btnDark")?.addEventListener("click", ()=>{
      state.dark = !state.dark;
      applyDark();
    });

    $("#btnRefresh")?.addEventListener("click", hardRefreshAll);
    $("#btnRefreshNew")?.addEventListener("click", refreshNewLeads);
    $("#btnRefreshWho")?.addEventListener("click", refreshUsersFast);

    $("#btnBatch")?.addEventListener("click", modalBatchTransfer);
    $("#btnHideUsers")?.addEventListener("click", modalHideUsers);

    $("#btnGET")?.addEventListener("click", ()=>{
      window.open(CONFIG.LINKS.GET, "_blank", "noopener");
    });
    $("#btnVendas")?.addEventListener("click", ()=>{
      window.open(CONFIG.LINKS.VENDAS, "_blank", "noopener");
    });

    // FILA
    $("#btnQueueManage")?.addEventListener("click", modalQueueManage);

    $("#queueBody")?.addEventListener("click", async (e)=>{
      const up = e.target.closest("[data-q-up]");
      const dn = e.target.closest("[data-q-down]");
      if(!up && !dn) return;

      try{
        const id = up ? up.getAttribute("data-q-up") : dn.getAttribute("data-q-down");
        const dir = up ? "up" : "down";
        const next = moveQueueLocal(id, dir);

        state.queueLocalTouchTs = Date.now();
        state.queue.order = next.slice();
        renderQueueSidebar();
        setStatus(`Fila ajustada • ${nowBRTime()}`);

        await persistQueueOrder(next);
      }catch(err){
        console.error(err);
      }
    });

    $("#btnQueueWalk")?.addEventListener("click", async ()=>{
      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        const order = (q.order||[]).map(String);
        if(order.length===0){
          alert("Fila vazia. Clique em Gerenciar para adicionar usuárias.");
          return;
        }
        const nextId = order.shift();
        order.push(nextId);

        state.queueLocalTouchTs = Date.now();
        state.queue = { ...state.queue, ...q, order: order.slice() };
        renderQueueSidebar();

        const nm = userNameById(nextId);
        setLastServed(nm);
        setStatus(`Andou fila: ${nm} • ${nowBRTime()}`);

        enqueueOp("queueWalk", async ()=>{ await saveQueue(q.dealId, { order, hiddenUsers: q.hiddenUsers||[] }); });
        flushOps();
      }catch(err){
        console.error(err);
      }
    });

    $("#btnQueueReset")?.addEventListener("click", async ()=>{
      try{
        const q = state.queue.dealId ? state.queue : await fetchQueue();
        state.queueLocalTouchTs = Date.now();
        state.queue = { ...state.queue, ...q, order: [] };
        renderQueueSidebar();
        enqueueOp("queueReset", async ()=>{ await saveQueue(q.dealId, { order: [], hiddenUsers: q.hiddenUsers||[] }); });
        flushOps();
      }catch(err){
        console.error(err);
      }
    });

    // Busca global
    $("#btnSearch")?.addEventListener("click", async ()=>{
      const term = ($("#searchBox").value||"").trim();
      if(!term) return;
      const scope = ($("#searchScope").value||"ALL");
      openModal("BUSCA", `<div style="opacity:.75;font-weight:900">Buscando no Bitrix…</div>`);
      try{
        const res = await searchLeadsByName(term, scope);
        modalSearchResults(term, res);
      }catch(err){
        console.error(err);
        closeModal();
        openModal("BUSCA", `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
      }
    });

    $("#searchBox")?.addEventListener("keydown", (e)=>{
      if(e.key==="Enter") $("#btnSearch")?.click();
    });

    // Delegação cards
    document.addEventListener("click", (e)=>{
      const g = e.target.closest("[data-grab]");
      const d = e.target.closest("[data-discard]");
      const ou = e.target.closest("[data-open-user]");

      if(g){
        const id = g.getAttribute("data-grab");
        modalPickLead(id);
      }
      if(d){
        const id = d.getAttribute("data-discard");
        actionDiscardLead(id);
      }
      if(ou){
        const uid = ou.getAttribute("data-open-user");
        modalUserOpen(uid);
      }
    });
  }

  // =========================
  // Start
  // =========================
  async function start(){
    if(!CONFIG.WEBHOOK){
      const sentinel = document.getElementById("cgd-sentinel");
      if(sentinel) sentinel.textContent = "⚠️ CONFIG.WEBHOOK vazio";
      return;
    }

    injectCSS();
    mount();
    wire();
    updateSoundUI();
    applyDark();

    warmUserPhotos().then(()=> renderBossPics()).catch(()=>{});

    await hardRefreshAll();
    renderBossPics();

    // refreshes
    setInterval(refreshNewLeads, CONFIG.REFRESH_NEW_LEADS_MS);
    setInterval(refreshPendingCount, Math.max(9000, CONFIG.REFRESH_NEW_LEADS_MS*2));
    setInterval(refreshStats, CONFIG.REFRESH_STATS_MS);
    setInterval(refreshQueue, CONFIG.REFRESH_QUEUE_MS);
    setInterval(refreshUsersFast, CONFIG.REFRESH_WHO_MS);

    // offline flush
    setInterval(flushOps, 2500);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }
})();
