/*
 * Klyna Upsell — in-cart widget runtime.
 *
 * Fetches the best-matching offer for the current cart from the app, renders a
 * compact upsell card, and logs impression / accept / decline events. Accepting
 * adds the recommended product to the cart via Shopify's AJAX Cart API.
 *
 * No framework, no build step — ships as a plain asset on the theme.
 */
(function () {
  var root = document.querySelector('[data-klyna-upsell]');
  if (!root || root.dataset.klynaMounted === '1') return;
  root.dataset.klynaMounted = '1';

  var appUrl = (root.dataset.appUrl || '').replace(/\/+$/, '');
  var shop = root.dataset.shop || '';
  var cartTotal = root.dataset.cartTotal || '0';
  var cartToken = root.dataset.cartToken || '';
  var placement = root.dataset.placement || 'cart';
  if (!appUrl || !shop) return;

  var cartData = readCartJson();

  var params = new URLSearchParams({
    shop: shop,
    cartTotal: cartTotal,
    cartToken: cartToken,
    placement: placement,
    products: cartData.products.join(','),
    collections: cartData.collections.join(','),
  });

  fetch(appUrl + '/api/offers?' + params.toString(), { credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : { offer: null }; })
    .then(function (data) {
      if (data && data.offer) render(data.offer);
    })
    .catch(function () { /* fail silent — never break the cart */ });

  function readCartJson() {
    var el = root.querySelector('[data-klyna-cart]');
    if (!el) return { products: [], collections: [] };
    try {
      var parsed = JSON.parse(el.textContent || '{}');
      return {
        products: Array.isArray(parsed.products) ? parsed.products : [],
        collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      };
    } catch (e) {
      return { products: [], collections: [] };
    }
  }

  function logEvent(type, offer, revenue) {
    try {
      navigator.sendBeacon(
        appUrl + '/api/offers',
        new Blob(
          [JSON.stringify({
            shop: shop,
            offerId: offer.offerId,
            variantId: offer.variantId,
            type: type,
            revenue: revenue || 0,
          })],
          { type: 'application/json' }
        )
      );
    } catch (e) {
      // sendBeacon unavailable — fall back to fetch keepalive.
      fetch(appUrl + '/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shop, offerId: offer.offerId, variantId: offer.variantId, type: type, revenue: revenue || 0,
        }),
        keepalive: true,
      }).catch(function () {});
    }
  }

  function addToCart(offer, onDone) {
    // The offer carries a product handle; resolve its first available variant
    // through the storefront product .js endpoint, then add it to the cart.
    var handle = offer.productHandle || (offer.productGid || '').split('/').pop();
    fetch('/products/' + handle + '.js')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) {
        if (!p || !p.variants || !p.variants[0]) { onDone(0); return; }
        var available = p.variants.filter(function (v) { return v.available; });
        var chosen = available[0] || p.variants[0];
        var price = chosen.price; // minor units
        return fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: chosen.id, quantity: 1 }] }),
        }).then(function () { onDone(price); });
      })
      .catch(function () { onDone(0); });
  }

  function render(offer) {
    // Impression is logged server-side on the GET; we only post accept/decline.
    var card = document.createElement('div');
    card.className = 'klyna-upsell__card';

    var media = offer.productImage
      ? '<img class="klyna-upsell__img" src="' + offer.productImage + '" alt="" />'
      : '<div class="klyna-upsell__img klyna-upsell__img--empty"></div>';

    var badge = offer.discountPercent > 0
      ? '<span class="klyna-upsell__badge">-' + offer.discountPercent + '%</span>'
      : '';

    card.innerHTML =
      '<div class="klyna-upsell__head">' +
        '<span class="klyna-upsell__headline">' + escapeHtml(offer.headline) + '</span>' +
        '<button type="button" class="klyna-upsell__close" aria-label="Dismiss">×</button>' +
      '</div>' +
      '<div class="klyna-upsell__body">' +
        media +
        '<div class="klyna-upsell__info">' +
          '<span class="klyna-upsell__title">' + escapeHtml(offer.productTitle) + badge + '</span>' +
          '<button type="button" class="klyna-upsell__cta">' + escapeHtml(offer.ctaText) + '</button>' +
        '</div>' +
      '</div>';

    root.appendChild(card);

    card.querySelector('.klyna-upsell__close').addEventListener('click', function () {
      logEvent('decline', offer);
      card.remove();
    });

    card.querySelector('.klyna-upsell__cta').addEventListener('click', function () {
      var btn = card.querySelector('.klyna-upsell__cta');
      btn.disabled = true;
      btn.textContent = 'Adding…';
      addToCart(offer, function (price) {
        logEvent('accept', offer, price);
        // Let the theme react (some drawers listen for this) then refresh so the
        // updated cart and line totals render.
        document.dispatchEvent(new CustomEvent('klyna:upsell:accepted', { detail: offer }));
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        window.location.reload();
      });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
