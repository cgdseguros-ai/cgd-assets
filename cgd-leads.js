/* cgd-leads.js — CGD Leads Panel (LITE / FAST)
   - Contagem DIA/MÊS (total + por user) por UF_DATA_PEGAR = UF_CRM_1771741018
   - Considera apenas STATUS: IN_PROCESS, UC_JT9G60, UC_0NFA3H, JUNK, CONVERTED
   - NOVOS LEADS (NEW) + alerta + avião só na entrada real de novo lead
   - HISTÓRICO: cards por user com dia/mês + ABRIR (lista leve)
   - Barra inferior: cinza escuro + CNPJs lado a lado + "Endereço"
*/
(function(){
  "use strict";

  const CONFIG = {
    WEBHOOK: "https://b24-6iyx5y.bitrix24.com.br/rest/1/w84d3lpz7hwutyeb/",
    LOGO_URL: "https://bitrix24public.com/b24-6iyx5y.bitrix24.com.br/docs/pub/189eb7d8a5cc26250f61ee3c26e9f997/showFile/?&token=awjcg85eqrbi",

    // ✅ Data PEGAR
    UF_DATA_PEGAR: "UF_CRM_1771741018",

    // Campos úteis (se existirem)
    UF_OPERADORA: "UF_CRM_1771282782",
    UF_DT_LEAD:   "UF_CRM_1771333014",
    UF_IDADE:     "UF_CRM_1771339221",
    UF_BAIRRO:    "UF_CRM_LEAD_1731909705398",
    UF_FONTE:     "UF_CRM_1767285733843",
    UF_TELEFONE:  "UF_CRM_1771282207",

    // ✅ IMPORTANTÍSSIMO: Bitrix está em +03:00 (veio no seu JSON).
    BITRIX_TZ: "+03:00",

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

    LEAD_STATUS: {
      NOVO: "NEW",
      EM_ATEND: "IN_PROCESS",
      ATENDIDO: "UC_JT9G60",
      QUALIF: "UC_0NFA3H",
      // SISTEMA:
      DESCARTADO: "JUNK",
      CONVERTIDO: "CONVERTED"
    },

    STATUS_NAMES: {
      "NEW":"NOVO LEAD",
      "IN_PROCESS":"EM ATENDIMENTO",
      "UC_JT9G60":"ATENDIDO",
      "UC_0NFA3H":"QUALIFICADO",
      "JUNK":"LEAD DESCARTADO (sistema)",
      "CONVERTED":"LEAD CONVERTIDO (sistema)"
    },

    // ✅ contagem considera só estes
    COUNT_STATUS: ["IN_PROCESS","UC_JT9G60","UC_0NFA3H","JUNK","CONVERTED"],

    REFRESH_NEW_MS: 4500,
    REFRESH_COUNT_MS: 6500,

    LIMIT_NEW_RENDER: 30,
    LIMIT_USER_OPEN: 140
  };

  const $ = (q, el=document)=> el.querySelector(q);
  const $$ = (q, el=document)=> Array.from(el.querySelectorAll(q));
  const esc = (s)=> String(s??"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
  const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
  const BLANK_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  function pad2(n){ return String(n).padStart(2,"0"); }
  function nowBR(){ try{ return new Date().toLocaleTimeString("pt-BR"); }catch(_){ return ""; } }

  function fmtDateBRFromISO(iso){
    if(!iso) return "";
    const t = Date.parse(String(iso));
    if(!Number.isFinite(t)) return String(iso);
    const d = new Date(t);
    return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function stageName(id){
    return CONFIG.STATUS_NAMES[String(id||"")] || String(id||"—");
  }

  function leadDisplayName(it){
    const nm = [it.NAME, it.SECOND_NAME, it.LAST_NAME].filter(Boolean).map(String).join(" ").trim();
    if(nm) return nm;
    const t = String(it.TITLE||"").trim();
    return t || `Lead #${it.ID}`;
  }

  function pickUF(it, key){
    try{ return it && Object.prototype.hasOwnProperty.call(it, key) ? it[key] : (it?it[key]:""); }
    catch(_){ return ""; }
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
    if(op.includes("PREVENT")) return { bg:"#0b2a5a", fg:"#fff" }; // ✅ azul escuro
    if(op.includes("LEVE")) return { bg:"#f5a23a", fg:"#111" };
    if(op.includes("MEDSENIOR")) return { bg:"#63c454", fg:"#111" };
    if(op.includes("AMIL")) return { bg:"#7db7ff", fg:"#111" };
    if(op.includes("UNIMED")) return { bg:"#2f6f4f", fg:"#fff" };
    if(op.includes("ALICE")) return { bg:"#ff7bb8", fg:"#111" };
    return { bg:"rgba(255,255,255,.9)", fg:"rgba(18,26,40,.92)" };
  }

  // =========================
  // Bitrix client (robusto + retries)
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
    const timeoutMs = Math.max(6000, Number(options.timeoutMs || 14000));
    const pairs = toPairs("", params, []);
    const body = new URLSearchParams();
    for(const [k,v] of pairs){ if(k) body.append(k, v); }

    let lastErr = null;
    for(let attempt=0; attempt<3; attempt++){
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
        if(!resp.ok) throw new Error(`HTTP ${resp.status} em ${method}`);
        if(data && data.error) throw new Error(data.error_description || data.error);
        return data;
      }catch(err){
        lastErr = err;
        const msg = String(err && err.message || err).toLowerCase();
        const retry = msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout") || msg.includes("http 5") || msg.includes("http 429");
        clearTimeout(t);
        if(attempt < 2 && retry){ await sleep(220 + attempt*420); continue; }
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

  async function bxListAll(method, params, max=400){
    let start = 0;
    let out = [];
    while(true){
      const r = await bx(method, { ...params, start });
      const items = Array.isArray(r) ? r : [];
      out = out.concat(items);
      if(out.length >= max) break;
      if(items.length < 50) break;
      start += 50;
    }
    return out.slice(0, max);
  }

  async function bxBatch(cmdObj, timeoutMs=18000){
    const data = await bxRaw("batch", { halt: 0, cmd: cmdObj }, { timeoutMs });
    return (data && data.result) ? data.result : {};
  }

  // =========================
  // ✅ Funções de tempo no timezone do Bitrix (+03:00)
  // =========================
  function tzMinutes(tz){
    const m = String(tz||"").match(/^([+-])(\d{2}):(\d{2})$/);
    if(!m) return 0;
    const sign = (m[1]==="-") ? -1 : 1;
    return sign * (parseInt(m[2],10)*60 + parseInt(m[3],10));
  }

  // converte Date “agora” → string no TZ do Bitrix
  function nowInBitrixTzParts(d=new Date()){
    const off = tzMinutes(CONFIG.BITRIX_TZ); // minutos do TZ Bitrix
    const utcMs = d.getTime() + d.getTimezoneOffset()*60000;
    const tzMs = utcMs + off*60000;
    const x = new Date(tzMs);
    return {
      y: x.getUTCFullYear(),
      m: x.getUTCMonth()+1,
      d: x.getUTCDate(),
      hh: x.getUTCHours(),
      mi: x.getUTCMinutes(),
      ss: x.getUTCSeconds()
    };
  }

  function isoBitrix(y,m,d,hh,mi,ss){
    return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mi)}:${pad2(ss)}${CONFIG.BITRIX_TZ}`;
  }

  function dayRangeBitrix(){
    const p = nowInBitrixTzParts();
    const start = isoBitrix(p.y,p.m,p.d,0,0,0);
    // próximo dia 00:00
    const dt = new Date(Date.UTC(p.y,p.m-1,p.d,0,0,0));
    dt.setUTCDate(dt.getUTCDate()+1);
    const end = isoBitrix(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate(), 0,0,0);
    return { startISO: start, endISO: end };
  }

  function monthRangeBitrix(){
    const p = nowInBitrixTzParts();
    const start = isoBitrix(p.y,p.m,1,0,0,0);
    const dt = new Date(Date.UTC(p.y,p.m-1,1,0,0,0));
    dt.setUTCMonth(dt.getUTCMonth()+1);
    const end = isoBitrix(dt.getUTCFullYear(), dt.getUTCMonth()+1, 1, 0,0,0);
    return { startISO: start, endISO: end };
  }

  // =========================
  // UI
  // =========================
  function injectCSS(){
    const css = `
#cgdApp{
  --radius:18px;
  --border: rgba(30,40,70,.12);
  --shadow: 0 10px 30px rgba(20,30,60,.10);
  min-height: calc(100vh - 90px);
  padding: 10px 12px 110px;
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
  color: rgba(18,26,40,.92);
  background:
    radial-gradient(900px 600px at 15% 20%, rgba(176,140,255,.18), transparent 55%),
    radial-gradient(900px 600px at 85% 20%, rgba(120,210,255,.14), transparent 55%),
    radial-gradient(900px 650px at 55% 95%, rgba(255,150,200,.12), transparent 60%),
    linear-gradient(135deg, #f7f3ff, #f3fbff 50%, #fff7fb);
}
.cgdTop{
  position: sticky; top: 0; z-index: 50;
  background: rgba(18,20,24,.92);
  color: #fff;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  padding: 10px 12px;
  display:flex; align-items:center; justify-content: space-between; gap: 10px;
  box-shadow: var(--shadow);
}
.cgdTopLeft{ display:flex; align-items:center; gap:10px; }
.cgdLogo{
  width: 56px; height: 56px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,.14); object-fit: cover;
  background: rgba(255,255,255,.08);
}
.cgdTitle{ font-weight: 950; letter-spacing:.2px; font-size: 13px; white-space: nowrap; }
.cgdTopRight{ display:flex; gap:8px; align-items:center; flex-wrap: wrap; justify-content: flex-end; }
.cgdPill{
  border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.10);
  color:#fff; border-radius: 999px;
  padding: 6px 10px; font-size: 12px; font-weight: 950;
}
.cgdBtn{
  cursor:pointer;
  border: 2px solid rgba(255,255,255,.22);
  background: rgba(10,10,12,.92);
  color:#fff; border-radius: 999px;
  padding: 8px 12px; font-size: 12px; font-weight: 950;
}
.cgdBtn:active{ transform: translateY(1px); }
.cgdBtn[disabled]{ opacity:.6; cursor:not-allowed; transform:none; }

.cgdLayout{ margin-top: 12px; display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cgdCol{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255,255,255,.62);
  box-shadow: var(--shadow);
  overflow: hidden;
  min-height: 68vh;
  display:flex; flex-direction: column;
}
.cgdColHead{
  padding: 10px;
  background: rgba(255,255,255,.78);
  border-bottom: 1px solid var(--border);
  display:flex; align-items:center; justify-content: space-between; gap: 10px;
}
.cgdColHead .hTitle{ font-weight: 950; font-size: 12px; letter-spacing:.3px; text-transform: uppercase; }
.cgdList{ padding: 10px; display:flex; flex-direction: column; gap: 10px; overflow:auto; min-height: 0; }
.cgdCard{
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(255,255,255,.92);
  box-shadow: 0 8px 20px rgba(20,30,60,.08);
  padding: 10px;
}
.cgdRow{ display:flex; align-items:flex-start; justify-content: space-between; gap:10px; }
.cgdLeadName{ font-weight: 950; font-size: 14px; line-height: 1.2; word-break: break-word; }
.cgdBadges{ display:flex; gap:6px; flex-wrap: wrap; margin-top: 8px; }
.cgdBadge{
  font-size: 10px; font-weight: 950;
  border: 1px solid rgba(30,40,70,.12);
  padding: 4px 8px; border-radius: 999px;
  background: rgba(255,255,255,.9);
}
.cgdActions{ margin-top: 10px; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
.cgdMiniBtn{
  cursor:pointer;
  border: 2px solid rgba(10,10,12,.85);
  background: rgba(255,255,255,.95);
  color: rgba(10,10,12,.92);
  border-radius: 12px;
  padding: 7px 10px; font-size: 12px; font-weight: 950;
}
.cgdMiniBtn.primary{ background: rgba(120,210,255,.32); }
.cgdMiniBtn.danger{ background: rgba(255,70,120,.18); }

.cgdAlertBox{
  border: 2px solid rgba(10,10,12,.85);
  border-radius: 16px;
  padding: 12px;
  background: rgba(10,10,12,.94);
  color: #fff;
  display:flex; align-items:center; justify-content: space-between; gap: 10px;
}
.cgdAlertBox.hot{ background: rgba(255,0,0,.92); color:#111; border-color: rgba(0,0,0,.35); }
.cgdAlertBox .txt{ font-weight: 950; font-size: 12px; line-height: 1.25; width: 100%; }
.cgdAlertBox .txt small{ display:block; margin-top: 4px; font-size: 11px; opacity: .92; font-weight: 900; }

.cgdUserLine{ display:flex; gap:10px; align-items:flex-start; }
.cgdUserPic{
  width: 52px; height: 52px;
  border-radius: 999px; object-fit: cover;
  border: 1px solid rgba(0,0,0,.10);
  background:#fff; flex: 0 0 auto;
}

.cgdBottom{
  position: fixed; left:0; right:0; bottom:0; z-index: 80;
  background: rgba(22,24,28,.98); /* ✅ cinza bem escuro */
  color: #fff;
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255,255,255,.10);
  padding: 10px 12px;
  display:flex; align-items:center; justify-content: space-between; gap: 12px;
}
.cgdBottom .bLeft{ display:flex; align-items:center; gap:10px; min-width: 340px; }
.cgdBottom .bCenter{ flex:1; text-align:center; font-style: italic; font-weight: 900; opacity:.92; }
.cgdBottom .bRight{ text-align:right; font-weight: 900; opacity:.92; min-width: 360px; }
.cgdAddrWrap{ display:flex; flex-direction: column; gap:2px; line-height: 1.1; }
.cgdAddrLabel{ font-size: 11px; font-weight: 950; opacity: .95; }
.cgdAddr{ font-size: 11px; font-weight: 900; opacity: .92; }
.cgdCnpjRow{ display:flex; gap: 14px; align-items:flex-start; justify-content:flex-end; flex-wrap:wrap; }
.cgdCnpjBox{ font-size: 11px; line-height: 1.25; font-weight: 900; opacity: .92; white-space: nowrap; }

/* Modal */
.cgdModalOverlay{
  position: fixed; inset: 0;
  background: rgba(0,0,0,.28);
  backdrop-filter: blur(4px);
  z-index: 200;
  display:flex; align-items:center; justify-content:center;
  padding: 16px;
}
.cgdModal{
  width: min(1040px, 96vw);
  max-height: min(88vh, 900px);
  background: rgba(255,255,255,.94);
  border: 1px solid rgba(30,40,70,.16);
  border-radius: 20px;
  box-shadow: 0 24px 70px rgba(20,30,60,.22);
  overflow:hidden;
  display:flex; flex-direction: column;
}
.cgdModalHead{
  padding: 12px 14px;
  display:flex; align-items:center; justify-content: space-between; gap: 10px;
  border-bottom: 1px solid rgba(30,40,70,.12);
  background: rgba(255,255,255,.75);
}
.cgdModalTitle{ font-weight: 950; font-size: 13px; }
.cgdModalBody{ padding: 12px 14px; overflow: auto; min-height: 0; }
.cgdModalFoot{
  padding: 12px 14px;
  border-top: 1px solid rgba(30,40,70,.12);
  display:flex; gap: 10px; justify-content:flex-end; flex-wrap: wrap;
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

body{ padding-bottom: 110px !important; }

/* Avião amarelo 3D lateral (maior) */
.cgdPlane{
  position: fixed;
  top: 98px;
  left: -520px;
  width: 420px;
  height: 210px;
  z-index: 9999;
  pointer-events:none;
  opacity: .98;
  animation: planeFly 1.8s linear forwards;
}
@keyframes planeFly{
  0%   { transform: translateX(0) rotate(6deg); opacity: .0; }
  10%  { opacity: .98; }
  100% { transform: translateX(calc(100vw + 960px)) rotate(-6deg); opacity: 0; }
}
    `;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

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
            <div class="cgdTitle">PAINEL DE LEADS • CGD CORRETORA (LITE)</div>
          </div>
          <div class="cgdTopRight">
            <div class="cgdPill" id="pillPending">Pendentes: 0</div>
            <div class="cgdPill" id="pillDay">Leads do dia: 0</div>
            <div class="cgdPill" id="pillMonth">Leads do mês: 0</div>
            <button class="cgdBtn" id="btnRefresh">Atualizar</button>
            <button class="cgdBtn" id="btnSound">Som: ON</button>
            <div class="cgdPill" id="pillStatus">Atualizado: —</div>
          </div>
        </div>

        <div class="cgdLayout">
          <section class="cgdCol">
            <div class="cgdColHead">
              <div class="hTitle">NOVOS LEADS</div>
              <button class="cgdBtn" id="btnRefreshNew">Atualizar</button>
            </div>
            <div class="cgdList" id="listNew">
              <div class="cgdAlertBox" id="alertNew" style="display:none">
                <div class="txt">
                  🚨 <b>NOVO LEAD</b>
                  <small>Alarme enquanto existir lead em “NOVO LEAD”.</small>
                </div>
                <button class="cgdBtn" id="btnSilence">Silenciar</button>
              </div>
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>

          <section class="cgdCol">
            <div class="cgdColHead">
              <div class="hTitle">HISTÓRICO DE LEADS (por usuária)</div>
              <button class="cgdBtn" id="btnRefreshWho">Atualizar</button>
            </div>
            <div class="cgdList" id="listWho">
              <div style="opacity:.7;font-weight:900">Carregando…</div>
            </div>
          </section>
        </div>

        <div class="cgdBottom">
          <div class="bLeft">
            <div class="cgdAddrWrap">
              <div class="cgdAddrLabel">Endereço</div>
              <div class="cgdAddr">Av Ayrton Senna, 2500, SS109, Barra da Tijuca</div>
            </div>
          </div>

          <div class="bCenter">System created by GRUPO CGD</div>

          <div class="bRight">
            <div class="cgdCnpjRow">
              <div class="cgdCnpjBox">
                <div><b>CGD CORRETORA</b></div>
                <div>CNPJ 01.654.471/0001-86 • SUSEP 202031791</div>
              </div>
              <div class="cgdCnpjBox">
                <div><b>CGD BARRA</b></div>
                <div>CNPJ 53.013.848/0001-11 • SUSEP 242158650</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ===== Modal
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
      if(e.target.closest("[data-close-modal]")) closeModal();
    });
    document.body.appendChild(ov);
    document.addEventListener("keydown", escClose, {capture:true});
  }
  function escClose(e){ if(e.key === "Escape") closeModal(); }
  function closeModal(){
    const ov = $(".cgdModalOverlay");
    if(ov) ov.remove();
    document.removeEventListener("keydown", escClose, {capture:true});
  }

  // ===== Paper plane + beep (só na entrada real)
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
        o.start(t); o.stop(t + 0.18);
      };
      make(t0 + 0.00); make(t0 + 0.26); make(t0 + 0.52);
      setTimeout(()=>{ try{ ctx.close(); }catch(_){} }, 1000);
    }catch(_){}
  }

  function flyPlaneYellow(){
    try{
      const d = document.createElement("div");
      d.className = "cgdPlane";
      d.innerHTML = `
        <svg viewBox="0 0 240 120" width="380" height="190" aria-hidden="true">
          <defs>
            <linearGradient id="g1" x1="0" x2="1">
              <stop offset="0" stop-color="#ffe66a"/>
              <stop offset="1" stop-color="#ffbf00"/>
            </linearGradient>
            <linearGradient id="g2" x1="0" x2="1">
              <stop offset="0" stop-color="rgba(0,0,0,.18)"/>
              <stop offset="1" stop-color="rgba(0,0,0,0)"/>
            </linearGradient>
          </defs>
          <path d="M10 62 L220 20 L168 102 L126 74 L10 62 Z"
                fill="url(#g1)" stroke="rgba(0,0,0,.28)" stroke-width="3.2" />
          <path d="M126 74 L220 20"
                stroke="rgba(0,0,0,.25)" stroke-width="3.2" />
          <path d="M10 62 L126 74 L168 102"
                fill="none" stroke="url(#g2)" stroke-width="10" stroke-linecap="round"/>
          <path d="M28 60 L190 30"
                stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round" />
        </svg>
      `;
      document.body.appendChild(d);
      setTimeout(()=>{ try{ d.remove(); }catch(_){} }, 2200);
    }catch(_){}
  }

  // ===== State
  const state = {
    soundOn: true,
    newLeadIds: new Set(),
    firstNewLoad: false,
    planeCooldownUntil: 0,
    newLeadsAll: [],
    userStats: {}, // id -> {d,m}
    totals: {d:0,m:0}
  };

  function setStatus(txt){
    const el = $("#pillStatus");
    if(el) el.textContent = txt;
  }
  function setPending(n){
    $("#pillPending").textContent = `Pendentes: ${Math.max(0, Number(n||0))}`;
  }
  function renderTotals(){
    $("#pillDay").textContent = `Leads do dia: ${state.totals.d||0}`;
    $("#pillMonth").textContent = `Leads do mês: ${state.totals.m||0}`;
  }

  function leadBadges(it){
    const out = [];
    const oper = pickUF(it, CONFIG.UF_OPERADORA);
    const idade = pickUF(it, CONFIG.UF_IDADE);
    const bairro= pickUF(it, CONFIG.UF_BAIRRO);
    const fonte = pickUF(it, CONFIG.UF_FONTE);
    const dtuf  = pickUF(it, CONFIG.UF_DT_LEAD);
    const tel = bestPhone(it);
    const dt = dtuf ? fmtDateBRFromISO(dtuf) : "";

    if(oper) out.push(["OPERADORA", oper]);
    if(idade) out.push(["IDADE", idade]);
    if(tel) out.push(["TELEFONE", tel]);
    if(bairro) out.push(["BAIRRO", bairro]);
    if(fonte) out.push(["FONTE", fonte]);
    if(dt) out.push(["DATA", dt]);
    return out.slice(0,6);
  }

  function renderNewLeads(){
    const list = $("#listNew");
    if(!list) return;

    const alert = $("#alertNew");
    list.innerHTML = "";
    if(alert) list.appendChild(alert);

    const has = state.newLeadsAll.length > 0;
    if(alert){
      alert.style.display = has ? "flex" : "none";
      alert.classList.toggle("hot", has);
    }

    if(!has){
      const d = document.createElement("div");
      d.style.opacity = ".75";
      d.style.fontWeight = "900";
      d.textContent = "Nenhum lead em NOVO LEAD.";
      list.appendChild(d);
      return;
    }

    state.newLeadsAll.slice(0, CONFIG.LIMIT_NEW_RENDER).forEach(it=>{
      const id = String(it.ID||"");
      const nm = leadDisplayName(it);
      const badges = leadBadges(it).map(([k,v])=>{
        if(k==="OPERADORA"){
          const st = operStyle(v);
          return `<span class="cgdBadge" style="border:0;background:${esc(st.bg)};color:${esc(st.fg)}">${esc(k)}: ${esc(v)}</span>`;
        }
        return `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`;
      }).join("");

      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdRow">
          <div class="cgdLeadName">${esc(nm)}</div>
          <div class="cgdBadge">${esc(stageName(it.STATUS_ID))}</div>
        </div>
        <div class="cgdBadges">${badges}</div>
      `;
      list.appendChild(card);
    });
  }

  function renderWho(){
    const list = $("#listWho");
    if(!list) return;
    list.innerHTML = "";

    CONFIG.USERS.forEach(u=>{
      const st = state.userStats[String(u.id)] || { d:0, m:0 };
      const card = document.createElement("div");
      card.className = "cgdCard";
      card.innerHTML = `
        <div class="cgdUserLine">
          <img class="cgdUserPic" src="${BLANK_IMG}" alt="${esc(u.name)}" />
          <div style="width:100%">
            <div class="cgdRow">
              <div style="font-weight:950">${esc(u.name)}</div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
                <span class="cgdBadge">dia: ${esc(st.d||0)}</span>
                <span class="cgdBadge">mês: ${esc(st.m||0)}</span>
                <button class="cgdMiniBtn" data-open-user="${esc(u.id)}">ABRIR</button>
              </div>
            </div>
            <div style="margin-top:8px; font-weight:900; opacity:.75">—</div>
          </div>
        </div>
      `;
      list.appendChild(card);
    });
  }

  // ===== ABRIR (lista leve)
  async function modalUserOpen(userId){
    const u = CONFIG.USERS.find(x=> String(x.id)===String(userId));
    if(!u) return;

    openModal(`ABRIR • ${u.name}`, `<div style="opacity:.75;font-weight:900">Carregando…</div>`);
    let list;
    try{
      list = await bxListAll("crm.lead.list", {
        filter: { "ASSIGNED_BY_ID": String(u.id) },
        order: { DATE_MODIFY: "DESC" },
        select: ["ID","TITLE","NAME","SECOND_NAME","LAST_NAME","STATUS_ID","ASSIGNED_BY_ID","DATE_MODIFY","DATE_CREATE","PHONE","UF_*"]
      }, CONFIG.LIMIT_USER_OPEN);
    }catch(_){
      closeModal();
      return openModal(`ABRIR • ${u.name}`, `<div style="font-weight:900;color:#a00">Sem conexão no momento. Tente novamente.</div>`);
    }

    const body = `
      <div style="font-weight:950;margin-bottom:10px">Lista leve (sem ações) • ${esc(list.length)} itens</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <input class="cgdInput" id="muSearch" placeholder="Filtrar..." style="min-width:260px" />
        <select class="cgdSelect" id="muStage">
          <option value="ALL">Todas as etapas</option>
          ${["NEW","IN_PROCESS","UC_JT9G60","UC_0NFA3H","JUNK","CONVERTED"].map(st=>`<option value="${esc(st)}">${esc(stageName(st))}</option>`).join("")}
        </select>
      </div>

      <table class="cgdTable">
        <thead>
          <tr>
            <th style="width:90px">ID</th>
            <th>Lead</th>
            <th style="width:190px">Etapa</th>
            <th style="width:320px">Info</th>
            <th style="width:170px">Atualizado</th>
          </tr>
        </thead>
        <tbody id="muTbody"></tbody>
      </table>
    `;

    openModal(`ABRIR • ${u.name}`, body);

    const tbody = $("#muTbody");
    const search = $("#muSearch");
    const stageSel = $("#muStage");

    function infoHtml(it){
      const info = leadBadges(it);
      return info.map(([k,v])=>{
        if(k==="OPERADORA"){
          const st = operStyle(v);
          return `<span class="cgdBadge" style="border:0;background:${esc(st.bg)};color:${esc(st.fg)}">${esc(k)}: ${esc(v)}</span>`;
        }
        return `<span class="cgdBadge">${esc(k)}: ${esc(v)}</span>`;
      }).join(" ");
    }

    function filtered(){
      const q = (search.value||"").trim().toLowerCase();
      const st = (stageSel.value||"ALL");
      return (list||[]).filter(it=>{
        const nm = leadDisplayName(it).toLowerCase();
        if(q && !nm.includes(q)) return false;
        if(st!=="ALL" && String(it.STATUS_ID)!==String(st)) return false;
        return true;
      });
    }

    function renderRows(){
      const rows = filtered();
      tbody.innerHTML = rows.length ? rows.map(it=>{
        const dm = it.DATE_MODIFY ? String(it.DATE_MODIFY).replace("T"," ").slice(0,19) : "—";
        return `<tr>
          <td><b>${esc(it.ID)}</b></td>
          <td><b>${esc(leadDisplayName(it))}</b></td>
          <td>${esc(stageName(it.STATUS_ID))}</td>
          <td>${infoHtml(it) || "—"}</td>
          <td>${esc(dm)}</td>
        </tr>`;
      }).join("") : `<tr><td colspan="5" style="opacity:.75;font-weight:900">Nenhum item.</td></tr>`;
    }

    renderRows();
    search.addEventListener("input", renderRows);
    stageSel.addEventListener("change", renderRows);
  }

  // ===== Contagens rápidas via batch (total e por user)
  function buildListCmd(filterObj){
    const qs = [];
    const add = (k,v)=> qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);

    Object.keys(filterObj||{}).forEach(k=>{
      const v = filterObj[k];
      if(Array.isArray(v)) v.forEach(x=> add(`filter[${k}][]`, x));
      else add(`filter[${k}]`, v);
    });

    add("select[]","ID");
    add("start",0);
    add("order[ID]","DESC");
    return `crm.lead.list?${qs.join("&")}`;
  }

  function safeTotal(res, key){
    const t = Number(res?.result_total?.[key]);
    if(Number.isFinite(t)) return t;
    const arr = res?.result_result?.[key];
    return Array.isArray(arr) ? arr.length : 0;
  }

  async function refreshCounts(){
    const { startISO: dS, endISO: dE } = dayRangeBitrix();
    const { startISO: mS, endISO: mE } = monthRangeBitrix();

    const cmd = {};
    cmd.tDay = buildListCmd({
      "STATUS_ID": CONFIG.COUNT_STATUS,
      [">=" + CONFIG.UF_DATA_PEGAR]: dS,
      ["<"  + CONFIG.UF_DATA_PEGAR]: dE
    });
    cmd.tMon = buildListCmd({
      "STATUS_ID": CONFIG.COUNT_STATUS,
      [">=" + CONFIG.UF_DATA_PEGAR]: mS,
      ["<"  + CONFIG.UF_DATA_PEGAR]: mE
    });

    CONFIG.USERS.forEach(u=>{
      const id = String(u.id);
      cmd["d"+id] = buildListCmd({
        "ASSIGNED_BY_ID": id,
        "STATUS_ID": CONFIG.COUNT_STATUS,
        [">=" + CONFIG.UF_DATA_PEGAR]: dS,
        ["<"  + CONFIG.UF_DATA_PEGAR]: dE
      });
      cmd["m"+id] = buildListCmd({
        "ASSIGNED_BY_ID": id,
        "STATUS_ID": CONFIG.COUNT_STATUS,
        [">=" + CONFIG.UF_DATA_PEGAR]: mS,
        ["<"  + CONFIG.UF_DATA_PEGAR]: mE
      });
    });

    const res = await bxBatch(cmd, 19000);

    state.totals.d = safeTotal(res, "tDay");
    state.totals.m = safeTotal(res, "tMon");
    renderTotals();

    CONFIG.USERS.forEach(u=>{
      const id = String(u.id);
      state.userStats[id] = {
        d: safeTotal(res, "d"+id),
        m: safeTotal(res, "m"+id)
      };
    });

    renderWho();
  }

  async function refreshNewLeads(){
    const items = await bxListAll("crm.lead.list", {
      filter: { "STATUS_ID": CONFIG.LEAD_STATUS.NOVO },
      order: { ID:"DESC" },
      select: ["ID","TITLE","NAME","SECOND_NAME","LAST_NAME","STATUS_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY","PHONE","UF_*"]
    }, 600);

    const newIds = new Set((items||[]).map(x=>String(x.ID)));
    let newArrival = false;

    if(!state.firstNewLoad){
      state.firstNewLoad = true;
      state.newLeadIds = newIds;
    }else{
      for(const id of newIds){ if(!state.newLeadIds.has(id)){ newArrival = true; break; } }
      state.newLeadIds = newIds;
    }

    state.newLeadsAll = items || [];
    setPending(state.newLeadsAll.length);
    renderNewLeads();

    if(newArrival && state.newLeadsAll.length && Date.now() > state.planeCooldownUntil){
      state.planeCooldownUntil = Date.now() + 1800;
      flyPlaneYellow();
      if(state.soundOn) tripleBeep();
    }
  }

  // ===== Events
  function wire(){
    $("#btnSound").addEventListener("click", ()=>{
      state.soundOn = !state.soundOn;
      $("#btnSound").textContent = `Som: ${state.soundOn ? "ON" : "OFF"}`;
    });
    $("#btnSilence").addEventListener("click", ()=>{
      state.soundOn = false;
      $("#btnSound").textContent = `Som: OFF`;
    });

    $("#btnRefresh").addEventListener("click", async ()=>{
      setStatus(`Atualizando… ${nowBR()}`);
      await Promise.allSettled([refreshNewLeads(), refreshCounts()]);
      setStatus(`Atualizado: ${nowBR()}`);
    });

    $("#btnRefreshNew").addEventListener("click", async ()=>{
      setStatus(`Atualizando novos… ${nowBR()}`);
      await Promise.allSettled([refreshNewLeads()]);
      setStatus(`Atualizado: ${nowBR()}`);
    });

    $("#btnRefreshWho").addEventListener("click", async ()=>{
      setStatus(`Atualizando contagens… ${nowBR()}`);
      await Promise.allSettled([refreshCounts()]);
      setStatus(`Atualizado: ${nowBR()}`);
    });

    document.addEventListener("click", (e)=>{
      const ou = e.target.closest("[data-open-user]");
      if(ou) modalUserOpen(ou.getAttribute("data-open-user"));
    });
  }

  // ===== Start
  async function start(){
    if(!CONFIG.WEBHOOK){
      console.error("CONFIG.WEBHOOK vazio");
      return;
    }
    injectCSS();
    mount();
    wire();

    setStatus(`Atualizando… ${nowBR()}`);
    renderWho(); // ✅ garante cards sempre
    await Promise.allSettled([refreshNewLeads(), refreshCounts()]);
    setStatus(`Atualizado: ${nowBR()}`);

    setInterval(()=>{ refreshNewLeads().catch(()=>{}); }, CONFIG.REFRESH_NEW_MS);
    setInterval(()=>{ refreshCounts().catch(()=>{}); }, CONFIG.REFRESH_COUNT_MS);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
