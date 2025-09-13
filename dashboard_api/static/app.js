(() => {
  const t = document.getElementById('themeToggle');
  if (t) t.addEventListener('click', ()=> document.body.classList.toggle('dark'));
  const links = document.querySelectorAll('[data-nav]');
  links.forEach(l=>{ if (location.pathname.startsWith(l.getAttribute('href'))) l.classList.add('active'); });
  window.toast = (msg) => {
    const el = document.getElementById('toast');
    if (!el) return; el.textContent = msg; el.hidden = false; setTimeout(()=> el.hidden = true, 2200);
  }

  // Global delegation for TB overlay controls (robust if inline JS fails)
  document.addEventListener('click', (e) => {
    const expandBtn = e.target.closest && e.target.closest('#tb_expand_btn');
    const closeBtn = e.target.closest && e.target.closest('#tb_close_btn');
    if (!expandBtn && !closeBtn) return;

    const overlay = document.getElementById('tb_overlay');
    if (!overlay) return;

    if (expandBtn) {
      e.preventDefault();
      // Sync iframe URLs if needed
      const small = document.getElementById('tb_frame');
      const full = document.getElementById('tb_frame_full');
      if (small && full) {
        // If small has a src and full differs or is empty, copy it over
        if (small.src && full.src !== small.src) {
          full.src = small.src;
        }
      }
      overlay.classList.remove('hidden');
    } else if (closeBtn) {
      e.preventDefault();
      overlay.classList.add('hidden');
    }
  });
})();
