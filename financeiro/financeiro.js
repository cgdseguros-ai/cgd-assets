(function(){
  const root = document.getElementById("fin-root") || document.body;
  root.innerHTML = `
    <div style="padding:16px;font-family:system-ui">
      <div style="font-weight:900;font-size:16px">Financeiro CGD</div>
      <div style="opacity:.7;margin-top:6px">JS carregou via Worker ✅</div>
    </div>
  `;
})();
