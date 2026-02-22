(function(){
  const root = document.getElementById("fin-root") || document.body;
  root.innerHTML = `
    <div class="fin-wrap">
      <div class="fin-card">
        <div class="fin-title">Financeiro CGD</div>
        <div class="fin-sub">JS carregou via Cloudflare Worker ✅</div>
        <div class="fin-sub">Worker: <code>financeiro199702.cgdseguros.workers.dev</code></div>
        <div style="margin-top:12px">
          <a class="fin-btn" href="https://financeiro199702.cgdseguros.workers.dev/health" target="_blank" rel="noreferrer">Testar /health</a>
          <a class="fin-btn" href="https://financeiro199702.cgdseguros.workers.dev/asset/financeiro.js" target="_blank" rel="noreferrer">Ver JS</a>
          <a class="fin-btn" href="https://financeiro199702.cgdseguros.workers.dev/asset/financeiro.css" target="_blank" rel="noreferrer">Ver CSS</a>
        </div>
      </div>
    </div>
  `;
})();
