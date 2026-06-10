/**
 * Klyna admin glue.
 *
 * No build step — vanilla JS that lives next to the plugin. Talks to the
 * REST endpoint registered by InternalLinks::register_routes().
 */
(function () {
  'use strict';

  const btn = document.getElementById('klyna-run-links');
  const out = document.getElementById('klyna-links-output');
  if (!btn || !out) return;

  btn.addEventListener('click', async function () {
    btn.disabled = true;
    btn.textContent = 'Scanning…';
    out.innerHTML = '<p style="color:#71717a;">Crawling the corpus and computing TF-IDF…</p>';
    try {
      const res = await wp.apiFetch({
        path: '/klyna/v1/internal-links/suggest?per_page=5',
      });
      render(res);
    } catch (err) {
      out.innerHTML =
        '<p style="color:#dc2626;">Error: ' +
        (err && err.message ? err.message : String(err)) +
        '</p>';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Re-scan corpus';
    }
  });

  function render(groups) {
    if (!Array.isArray(groups) || groups.length === 0) {
      out.innerHTML =
        '<p>No suggestions found. Either your posts are already well-linked, or there are fewer than 3 posts to compare.</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    const header = document.createElement('p');
    header.style.color = '#71717a';
    header.textContent =
      'Found ' +
      groups.length +
      ' posts with link opportunities. Suggestions ranked by topical similarity.';
    frag.appendChild(header);

    groups.forEach(function (group) {
      const block = document.createElement('div');
      block.className = 'klyna-link-group';
      const h = document.createElement('h3');
      const a = document.createElement('a');
      a.href = group.from_url;
      a.textContent = group.from_title;
      a.target = '_blank';
      a.rel = 'noreferrer';
      h.appendChild(a);
      block.appendChild(h);

      const ul = document.createElement('ul');
      (group.suggestions || []).forEach(function (s) {
        const li = document.createElement('li');
        const left = document.createElement('span');
        const link = document.createElement('a');
        link.href = s.to_url;
        link.textContent = '→ ' + s.to_title;
        link.target = '_blank';
        link.rel = 'noreferrer';
        left.appendChild(link);
        const right = document.createElement('span');
        right.className = 'klyna-sim';
        right.textContent = (s.similarity * 100).toFixed(1) + '%';
        li.appendChild(left);
        li.appendChild(right);
        ul.appendChild(li);
      });
      block.appendChild(ul);
      frag.appendChild(block);
    });

    out.innerHTML = '';
    out.appendChild(frag);
  }
})();
