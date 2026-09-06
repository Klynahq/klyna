(() => {
  const button = document.getElementById('mobile-nav-toggle');
  const panel = document.getElementById('mobile-nav-panel');
  if (!button || !panel) return;

  button.addEventListener('click', () => {
    const hidden = panel.classList.toggle('hidden');
    button.setAttribute('aria-expanded', String(!hidden));
  });
})();
