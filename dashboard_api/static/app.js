(() => {
  const t = document.getElementById('themeToggle');
  if (t) t.addEventListener('click', ()=> document.body.classList.toggle('light'));
  const links = document.querySelectorAll('[data-nav]');
  links.forEach(l=>{ if (location.pathname.startsWith(l.getAttribute('href'))) l.classList.add('active'); });
  window.toast = (msg) => {
    const el = document.getElementById('toast');
    if (!el) return; el.textContent = msg; el.hidden = false; setTimeout(()=> el.hidden = true, 2200);
  }
})();

