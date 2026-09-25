(() => {
  const root = document.querySelector('[data-language-switcher]');
  if (!(root instanceof HTMLElement)) return;

  const routeMap = ['', '/products', '/shopify/seo'];
  const match = location.pathname.match(/^\/(es|fr|it)(\/|$)/);
  const current = match?.[1] || 'en';
  let base = match ? location.pathname.replace(/^\/(es|fr|it)/, '') || '/' : location.pathname;
  base = base === '/' ? '' : base.replace(/\/+$/, '');
  if (!routeMap.includes(base)) {
    root.remove();
    return;
  }

  const names = { en: 'English', es: 'Español', fr: 'Français', it: 'Italiano' };
  const button = root.querySelector('button');
  const menu = root.querySelector('.klyna-language-menu');
  if (!(button instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) return;

  const href = (locale) => locale === 'en' ? (base || '/') : `/${locale}${base}`;
  button.textContent = current.toUpperCase();
  menu.innerHTML = Object.entries(names)
    .map(([locale, name]) => `<a href="${href(locale)}" data-locale="${locale}" ${locale === current ? 'aria-current="page"' : ''}><span>${name}</span><span>${locale.toUpperCase()}</span></a>`)
    .join('');

  button.addEventListener('click', () => {
    const open = root.dataset.open !== 'true';
    root.dataset.open = String(open);
    button.setAttribute('aria-expanded', String(open));
  });

  menu.querySelectorAll('[data-locale]').forEach((link) => {
    if (!(link instanceof HTMLElement)) return;
    link.addEventListener('click', () => {
      try {
        localStorage.setItem('klyna-locale', link.dataset.locale || 'en');
      } catch {}
    });
  });

  let saved;
  try {
    saved = localStorage.getItem('klyna-locale');
  } catch {}
  const preferred = (navigator.languages?.[0] || navigator.language || '').slice(0, 2).toLowerCase();
  if (current === 'en' && !saved && ['es', 'fr', 'it'].includes(preferred)) {
    const hint = document.createElement('div');
    hint.className = 'klyna-language-hint';
    hint.innerHTML = `View in <a href="${href(preferred)}">${names[preferred]}</a>`;
    root.append(hint);
    hint.querySelector('a')?.addEventListener('click', () => {
      try {
        localStorage.setItem('klyna-locale', preferred);
      } catch {}
    });
  }
})();
