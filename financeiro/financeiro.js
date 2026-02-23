/* ===== Layout shell (sidebar + main) ===== */
.fin-shell{
  min-height:100vh;
  display:flex;
  gap:14px;
  padding:14px;
  font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial;
  color: rgba(18,26,40,.92);
}
.fin-side{
  width:270px;
  border-radius:18px;
  background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.12);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(0,0,0,.20);
  padding:12px;
  color:#e5e7eb;
}
.fin-main{flex:1; display:flex; flex-direction:column; gap:12px}

/* ===== Sidebar brand ===== */
.fin-side-brand{
  display:flex; gap:10px; align-items:center;
  padding:10px;
  border-radius:16px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.10);
}
.fin-brand-logo{width:38px; height:38px; border-radius:12px; object-fit:contain; background:#fff; padding:4px}
.fin-brand-title{font-weight:950; letter-spacing:.2px}
.fin-brand-sub{font-size:12px; opacity:.85; margin-top:2px}

.fin-side-block{margin-top:12px}
.fin-side-h{font-size:12px; font-weight:950; opacity:.9; margin:6px 6px 8px}
.fin-side-list{display:flex; flex-direction:column; gap:6px}
.fin-side-item{
  width:100%;
  display:flex; gap:10px; align-items:center;
  padding:10px 10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  color:#e5e7eb;
  cursor:pointer;
  font-weight:800;
}
.fin-side-item:hover{background:rgba(255,255,255,.10)}
.fin-side-item.is-active{
  background:rgba(37,99,235,.28);
  border-color:rgba(37,99,235,.45);
}
.fin-dot{width:10px;height:10px;border-radius:4px;background:rgba(255,255,255,.35)}
.fin-side-item.is-active .fin-dot{background:rgba(37,99,235,.95)}
.fin-side-label{font-size:13px}
.fin-side-muted{opacity:.95}
.fin-side-note{font-size:12px; font-weight:800; opacity:.85; padding:0 6px 6px}

/* ===== Topbar ===== */
.fin-topbar{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 12px;
  border-radius:18px;
  background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.12);
  color:#e5e7eb;
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(0,0,0,.20);
}
.fin-top-left{display:flex; gap:10px; align-items:center}
.fin-top-logo{width:40px; height:40px; border-radius:12px; object-fit:contain; background:#fff; padding:5px}
.fin-top-title{font-weight:950; letter-spacing:.2px}
.fin-top-sub{font-size:12px; opacity:.85; margin-top:2px}

.fin-top-actions{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
.fin-search{
  display:flex; align-items:center; gap:8px;
  padding:10px 12px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  min-width:320px;
}
.fin-search input{
  border:none; outline:none; background:transparent;
  color:#e5e7eb; width:100%;
  font-weight:800;
}
.fin-btn{
  padding:10px 12px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.08);
  color:#e5e7eb;
  cursor:pointer;
  font-weight:900;
}
.fin-btn:hover{background:rgba(255,255,255,.12)}
.fin-btn--primary{
  background:rgba(37,99,235,.30);
  border-color:rgba(37,99,235,.45);
}
.fin-loading{
  display:inline-flex; align-items:center; gap:6px;
  padding:6px 10px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);
  font-size:12px;
  font-weight:900;
  margin-left:10px;
}

/* ===== Panel ===== */
.fin-panel{
  border-radius:18px;
  background:rgba(255,255,255,.10);
  border:1px solid rgba(255,255,255,.12);
  box-shadow: 0 10px 30px rgba(0,0,0,.20);
  overflow:hidden;
}
.fin-panel-inner{
  background:rgba(255,255,255,.92);
  padding:14px;
}
.fin-kpis{display:grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap:12px}
.fin-kpi{border-radius:16px; padding:14px; border:1px solid rgba(30,40,70,.12); background:#fff}
.fin-kpi-k{font-size:12px; font-weight:950; opacity:.7}
.fin-kpi-v{font-size:22px; font-weight:950; margin-top:6px}

.fin-filters{
  display:flex; gap:10px; flex-wrap:wrap; align-items:end;
  padding:10px; margin-top:12px;
  border-radius:16px;
  background:#f6f7fb;
  border:1px solid rgba(30,40,70,.12);
}
.fin-field{
  display:flex; flex-direction:column; gap:6px;
  padding:8px 10px;
  border-radius:14px;
  background:#fff;
  border:1px solid rgba(30,40,70,.12);
}
.fin-field label{font-size:12px; font-weight:950; opacity:.65}
.fin-field select,.fin-field input,.fin-field textarea{
  border:none; outline:none; background:transparent;
  font-weight:900; color:#111827;
}

/* ===== Table ===== */
.fin-table-wrap{margin-top:12px; overflow:auto; border:1px solid rgba(30,40,70,.12); border-radius:16px; background:#fff}
.fin-table{width:100%; border-collapse:separate; border-spacing:0}
.fin-table th,.fin-table td{padding:10px 10px; border-bottom:1px solid rgba(30,40,70,.10); font-size:12px}
.fin-table th{color:rgba(18,26,40,.55); text-align:left; font-weight:950}
.fin-table td{font-weight:900}
.fin-muted{opacity:.65; font-weight:800}
.fin-strong{font-weight:950}
.fin-small{font-size:12px}
.fin-mono{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace}
.fin-actions-row{display:flex; gap:6px; flex-wrap:wrap}
.fin-mini{padding:7px 10px; border-radius:12px; border:1px solid rgba(30,40,70,.12); background:#fff; cursor:pointer; font-weight:950; font-size:12px}
.fin-mini--ok{border-color: rgba(22,163,74,.25)}
.fin-mini--danger{border-color: rgba(239,68,68,.25)}

/* ===== Footer ===== */
.fin-footerbar{
  border-radius:18px;
  background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.12);
  color:#e5e7eb;
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(0,0,0,.20);
  padding:12px 14px;
  display:flex;
  align-items:center;
  gap:14px;
  flex-wrap:wrap;
}
.fin-footer-left{display:flex; flex-direction:column; gap:2px; min-width:260px}
.fin-footer-left .k{font-size:11px; font-weight:950; opacity:.85}
.fin-footer-left .v{font-size:12px; font-weight:900; opacity:.95}

.fin-footer-center{
  flex:1;
  text-align:center;
  font-size:12px;
  font-weight:950;
  opacity:.92;
  min-width:220px;
}
.fin-footer-right{
  display:flex;
  gap:14px;
  align-items:center;
  justify-content:flex-end;
  min-width:340px;
}
.fin-footer-box{
  padding:8px 10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);
}
.fin-footer-box .t{font-size:12px; font-weight:950}
.fin-footer-box .s{font-size:11px; font-weight:900; opacity:.85; margin-top:2px}

.fin-footer-avatars{display:flex; align-items:center; gap:8px; margin-left:auto}
.fin-avatar{
  width:34px; height:34px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.20);
  background:rgba(255,255,255,.10);
  display:grid; place-items:center;
  font-weight:950;
  color:#e5e7eb;
  overflow:hidden;
}
.fin-avatar img{width:100%; height:100%; object-fit:cover}

/* ===== Modals / toast (mantém simples) ===== */
.fin-modal-wrap{position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center}
.fin-modal-backdrop{position:absolute; inset:0; background:rgba(0,0,0,.45)}
.fin-modal{position:relative; width:min(980px, 92vw); max-height:86vh; overflow:auto; border-radius:18px; background:#fff; border:1px solid rgba(30,40,70,.12)}
.fin-modal-head{display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(30,40,70,.10)}
.fin-modal-title{font-weight:950}
.fin-x{border:none; background:transparent; font-size:22px; cursor:pointer}
.fin-modal-body{padding:14px}
.fin-grid{display:grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap:10px}
.fin-row{display:flex; gap:10px; align-items:center}
.fin-row--right{justify-content:flex-end}
.fin-hint{margin-top:10px; font-size:12px; font-weight:800; opacity:.7}

.fin-toast-host{position:fixed; right:14px; bottom:14px; display:flex; flex-direction:column; gap:8px; z-index:10000}
.fin-toast{
  transform: translateY(10px);
  opacity:0;
  transition: all .18s ease;
  border-radius:14px;
  padding:10px 12px;
  font-weight:900;
  border:1px solid rgba(255,255,255,.14);
  background: rgba(17,24,39,.86);
  color:#e5e7eb;
  backdrop-filter: blur(8px);
}
.fin-toast--show{transform: translateY(0); opacity:1}
.fin-toast--err{background: rgba(127,29,29,.88)}
.fin-toast--ok{background: rgba(17,94,89,.88)}

/* ===== Boot ===== */
.fin-boot{
  min-height:100vh;
  display:flex; align-items:center; justify-content:center;
  padding:14px;
  background:
    radial-gradient(1200px 800px at 20% 20%, rgba(37,99,235,.35), transparent 60%),
    radial-gradient(900px 650px at 75% 55%, rgba(22,163,74,.22), transparent 60%),
    linear-gradient(180deg, #0b1020, #070a14);
}
.fin-boot-card{
  border-radius:18px;
  background:rgba(255,255,255,.10);
  border:1px solid rgba(255,255,255,.12);
  color:#e5e7eb;
  padding:14px 16px;
  box-shadow: 0 10px 30px rgba(0,0,0,.20);
}
.fin-boot-title{font-weight:950}
.fin-boot-sub{opacity:.85; margin-top:4px; font-weight:800}

/* ===== Responsive ===== */
@media (max-width: 1100px){
  .fin-shell{padding:10px}
  .fin-side{display:none}
  .fin-search{min-width:180px}
  .fin-kpis{grid-template-columns:1fr}
  .fin-grid{grid-template-columns:1fr}
  .fin-footer-center{text-align:left}
  .fin-footer-right{justify-content:flex-start; min-width:auto; flex-wrap:wrap}
  .fin-footer-avatars{margin-left:0}
}
