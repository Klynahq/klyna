/*
 * Klyna Bundles — storefront widget.
 *
 * Hydrates every [data-klyna-bundles] block on the page:
 *   1. fetch the product's active bundle and volume tiers from the
 *      app proxy (/apps/klyna-bundles?product=<gid>),
 *   2. render the bundle offer and volume-break table,
 *   3. wire "Add bundle to cart" to the Shopify AJAX cart API.
 *
 * No framework, no build step — vanilla JS so it drops straight into any theme.
 */
(function () {
  'use strict';

  var FALLBACK_IMG =
    'https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png';

  function money(n) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: window.Shopify && window.Shopify.currency ? window.Shopify.currency.active : 'USD',
      }).format(n);
    } catch (e) {
      return Number(n).toFixed(2);
    }
  }

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  // Pull the trailing numeric id out of a Product/ProductVariant GID.
  function idFromGid(gid) {
    if (!gid) return null;
    var parts = String(gid).split('/');
    return parts[parts.length - 1] || null;
  }

  function addToCart(variantIds) {
    var items = variantIds
      .filter(Boolean)
      .map(function (id) {
        return { id: Number(id), quantity: 1 };
      });
    if (items.length === 0) return Promise.reject(new Error('No variants to add.'));
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items }),
    }).then(function (res) {
      if (!res.ok) throw new Error('Add to cart failed');
      return res.json();
    });
  }

  function renderBundle(bundle, settings) {
    var card = el('div', 'klyna-card');
    card.appendChild(el('h3', 'klyna-card__title', escapeHtml(settings.bundleHeading || 'Complete the set & save')));

    var list = el('div', 'klyna-bundle__items');
    bundle.items.forEach(function (it, i) {
      var row = el('div', 'klyna-bundle__item');
      var img = el('img', 'klyna-thumb');
      img.src = it.imageUrl || FALLBACK_IMG;
      img.alt = it.title;
      img.loading = 'lazy';
      row.appendChild(img);
      row.appendChild(el('span', 'klyna-bundle__name', escapeHtml(it.title) + (it.quantity > 1 ? ' ×' + it.quantity : '')));
      list.appendChild(row);
      if (i < bundle.items.length - 1) list.appendChild(el('span', 'klyna-plus', '+'));
    });
    card.appendChild(list);

    var priceRow = el('div', 'klyna-price');
    priceRow.appendChild(el('span', 'klyna-price__was', money(bundle.subtotal)));
    priceRow.appendChild(el('span', 'klyna-price__now', money(bundle.total)));
    if (settings.showSavingsBadge && bundle.savings > 0) {
      priceRow.appendChild(el('span', 'klyna-badge', 'Save ' + bundle.savingsPercent + '%'));
    }
    card.appendChild(priceRow);

    var btn = el('button', 'klyna-btn', 'Add bundle to cart');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Adding…';
      var variantIds = bundle.items.map(function (it) {
        return idFromGid(it.variantGid) || idFromGid(it.productGid);
      });
      addToCart(variantIds)
        .then(function () {
          btn.textContent = 'Added ✓';
          document.dispatchEvent(new CustomEvent('klyna:bundle:added', { detail: bundle }));
          window.location.href = '/cart';
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = 'Add bundle to cart';
        });
    });
    card.appendChild(btn);
    return card;
  }

  function renderFbt(fbt, settings) {
    var card = el('div', 'klyna-card');
    card.appendChild(el('h3', 'klyna-card__title', escapeHtml(settings.widgetHeading || 'Frequently bought together')));
    var row = el('div', 'klyna-fbt');
    fbt.forEach(function (p) {
      var item = el('a', 'klyna-fbt__item');
      var img = el('img', 'klyna-thumb');
      img.src = p.imageUrl || FALLBACK_IMG;
      img.alt = p.title;
      img.loading = 'lazy';
      item.appendChild(img);
      item.appendChild(el('span', 'klyna-fbt__name', escapeHtml(p.title)));
      item.appendChild(el('span', 'klyna-fbt__price', money(p.price)));
      var add = el('button', 'klyna-btn klyna-btn--ghost', 'Add');
      add.type = 'button';
      add.addEventListener('click', function (e) {
        e.preventDefault();
        add.disabled = true;
        addToCart([idFromGid(p.productGid)]).then(function () {
          add.textContent = '✓';
        }).catch(function () {
          add.disabled = false;
        });
      });
      item.appendChild(add);
      row.appendChild(item);
    });
    card.appendChild(row);
    return card;
  }

  function renderVolume(tiers) {
    var card = el('div', 'klyna-card');
    card.appendChild(el('h3', 'klyna-card__title', 'Buy more, save more'));
    var table = el('table', 'klyna-volume');
    var thead = el('thead');
    thead.appendChild(el('tr', null, '<th>Quantity</th><th>Discount</th>'));
    table.appendChild(thead);
    var tbody = el('tbody');
    tiers.forEach(function (t) {
      var off = t.discountType === 'percentage' ? t.discountValue + '% off' : money(t.discountValue) + ' off';
      tbody.appendChild(el('tr', null, '<td>' + t.minQuantity + '+</td><td>' + off + '</td>'));
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hydrate(root) {
    var productGid = root.getAttribute('data-product-gid');
    var proxy = root.getAttribute('data-proxy');
    var showBundle = root.getAttribute('data-show-bundle') !== 'false';
    var showFbt = root.getAttribute('data-show-fbt') !== 'false';
    var showVolume = root.getAttribute('data-show-volume') !== 'false';
    var loading = root.querySelector('[data-klyna-loading]');
    var content = root.querySelector('[data-klyna-content]');

    var url = proxy + '?product=' + encodeURIComponent(productGid);
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('proxy ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('no data');
        var settings = data.settings || {};
        if (settings.accentColor) root.style.setProperty('--klyna-accent', settings.accentColor);

        var rendered = 0;
        if (showBundle && data.bundles && data.bundles.length > 0) {
          content.appendChild(renderBundle(data.bundles[0], settings));
          rendered++;
        }
        if (showVolume && data.volumeTiers && data.volumeTiers.length > 0) {
          content.appendChild(renderVolume(data.volumeTiers));
          rendered++;
        }
        if (showFbt && data.fbt && data.fbt.length > 0) {
          content.appendChild(renderFbt(data.fbt, settings));
          rendered++;
        }

        loading.hidden = true;
        if (rendered > 0) {
          content.hidden = false;
        } else {
          root.hidden = true; // nothing to show for this product
        }
      })
      .catch(function () {
        // Fail quietly — never block the product page on our widget.
        root.hidden = true;
      });
  }

  function init() {
    var blocks = document.querySelectorAll('[data-klyna-bundles]');
    for (var i = 0; i < blocks.length; i++) hydrate(blocks[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
