(() => {
  const search = document.getElementById('help-search');
  const results = document.getElementById('help-results');
  const categories = document.getElementById('help-categories');
  const index = document.getElementById('help-index');
  if (!search || !results || !categories || !index) return;

  const entries = JSON.parse(index.textContent || '[]');
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    if (!query) {
      results.classList.add('hidden');
      results.replaceChildren();
      categories.classList.remove('hidden');
      return;
    }

    const matches = entries
      .filter((entry) => entry.title.toLowerCase().includes(query)
        || entry.description.toLowerCase().includes(query)
        || entry.category.toLowerCase().includes(query))
      .slice(0, 12);

    categories.classList.add('hidden');
    results.classList.remove('hidden');
    results.replaceChildren();

    if (matches.length) {
      matches.forEach((entry) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        const title = document.createElement('div');
        const description = document.createElement('div');
        link.href = entry.url;
        link.className = 'block px-4 py-3 hover:bg-white/5';
        title.className = 'font-medium';
        title.textContent = entry.title;
        description.className = 'text-sm text-[color:var(--color-text-muted)] mt-0.5';
        description.textContent = entry.description;
        link.append(title, description);
        item.append(link);
        results.append(item);
      });
      return;
    }

    const item = document.createElement('li');
    const contactLink = document.createElement('a');
    item.className = 'px-4 py-6 text-center text-sm text-[color:var(--color-text-muted)]';
    item.append('No matches. Try the ');
    contactLink.href = '/contact';
    contactLink.className = 'text-[color:var(--color-accent)] hover:underline';
    contactLink.textContent = 'contact form';
    item.append(contactLink, '.');
    results.append(item);
  });
})();
