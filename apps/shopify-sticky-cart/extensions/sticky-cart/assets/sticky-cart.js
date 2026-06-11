/* Klyna Sticky Cart — storefront widget.
 *
 * Vanilla JS, no dependencies. Renders a persistent add-to-cart bar on product
 * pages with variant + quantity selection, quick-buy, and a free-shipping
 * progress bar. Settings come from the merchant's app (loaded live via the
 * App Proxy) and fall back to the theme-editor block settings. Interactions are
 * reported to the app through the same signed proxy.
 *
 * Shopify storefront endpoints used:
 *   POST /cart/add.js   — add a variant + quantity to the cart
 *   GET  /cart.js       — read the current cart total for the progress bar
 *   /checkout           — quick-buy redirect target after add
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-klyna-sticky-cart]');
  if (!root) return;

  var productEl = document.querySelector('[data-klyna-sticky-cart-product]');
  var product;
  try {
    product = JSON.parse(productEl.textContent);
  } catch (e) {
    return;
  }
  if (!product || !product.variants || !product.variants.length) return;

  var proxyBase = root.getAttribute('data-proxy') || '/apps/sticky-cart';
  var currency = root.getAttribute('data-currency') || 'USD';
  var moneyFormat = root.getAttribute('data-money-format') || '${{amount}}';

  // ----- Settings: start from the block (theme editor), then merge live app
  // settings from the proxy so admin changes take effect without re-saving the
  // theme. The proxy values win when present. -----
  var settings = readBlockSettings(root);

  // Cart total is given by Liquid in cents; keep it live via /cart.js too.
  var cartTotalCents = parseInt(root.getAttribute('data-cart-total') || '0', 10) || 0;

  var state = {
    variant: pickInitialVariant(product),
    qty: 1,
    addBusy: false,
    buyBusy: false,
    impressionSent: false,
    freeShipUnlockSent: false,
  };

  // `currentRefs` always points at the live DOM refs — re-render swaps it.
  var currentRefs = null;

  // Build once, then hydrate after settings resolve.
  applyTheme(root, settings);
  currentRefs = render(root, product, settings, state);
  bindEvents(currentRefs, product, settings, state);
  setupVisibility(root, settings);
  refreshCart();
  loadRecoverLine();

  fetchLiveSettings().then(function (live) {
    if (live) {
      settings = mergeSettings(settings, live);
      applyTheme(root, settings);
      // Re-render to honor toggles that change DOM (show/hide controls).
      currentRefs = render(root, product, settings, state);
      bindEvents(currentRefs, product, settings, state);
      updatePrice(currentRefs, state, settings);
      updateFreeShip(currentRefs, settings, cartTotalCents);
    }
  });

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  function readBlockSettings(el) {
    var attr = function (name, fallback) {
      var v = el.getAttribute(name);
      return v === null || v === '' ? fallback : v;
    };
    var bool = function (name, fallback) {
      var v = el.getAttribute(name);
      if (v === null || v === '') return fallback;
      return v === 'true' || v === '1';
    };
    return {
      enabled: true,
      position: attr('data-position', 'bottom') === 'top' ? 'top' : 'bottom',
      showAfterScroll: bool('data-show-after-scroll', true),
      showImage: bool('data-show-image', true),
      showPrice: bool('data-show-price', true),
      showVariantSelector: bool('data-show-variants', true),
      showQuantity: bool('data-show-quantity', true),
      cta: {
        label: attr('data-cta-label', 'Add to cart'),
        color: attr('data-cta-color', '#7c5cff'),
        textColor: attr('data-cta-text-color', '#ffffff'),
      },
      quickBuy: {
        enabled: bool('data-quickbuy', true),
        label: attr('data-quickbuy-label', 'Buy it now'),
      },
      freeShip: {
        enabled: bool('data-freeship', true),
        threshold: parseFloat(attr('data-freeship-threshold', '0')) || 0,
        color: attr('data-freeship-color', '#34d399'),
        message: attr('data-freeship-message', "You're {{remaining}} away from free shipping!"),
        successMessage: attr('data-freeship-success', "You've unlocked free shipping!"),
      },
    };
  }

  function mergeSettings(base, live) {
    return {
      enabled: live.enabled !== undefined ? live.enabled : base.enabled,
      position: live.position || base.position,
      showAfterScroll:
        live.showAfterScroll !== undefined ? live.showAfterScroll : base.showAfterScroll,
      showImage: live.showImage !== undefined ? live.showImage : base.showImage,
      showPrice: live.showPrice !== undefined ? live.showPrice : base.showPrice,
      showVariantSelector:
        live.showVariantSelector !== undefined
          ? live.showVariantSelector
          : base.showVariantSelector,
      showQuantity: live.showQuantity !== undefined ? live.showQuantity : base.showQuantity,
      cta: Object.assign({}, base.cta, live.cta),
      quickBuy: Object.assign({}, base.quickBuy, live.quickBuy),
      freeShip: Object.assign({}, base.freeShip, live.freeShip),
    };
  }

  function fetchLiveSettings() {
    return fetch(proxyBase + '/settings', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function render(el, prod, cfg, st) {
    el.setAttribute('data-pos', cfg.position);
    var inner = el.querySelector('[data-klyna-sc-inner]');
    inner.innerHTML = '';

    // Free-shipping section
    var ship = null;
    if (cfg.freeShip.enabled && cfg.freeShip.threshold > 0) {
      ship = elem('div', 'klyna-sc__ship');
      var msg = elem('div', 'klyna-sc__ship-msg');
      var track = elem('div', 'klyna-sc__ship-track');
      var fill = elem('div', 'klyna-sc__ship-fill');
      track.appendChild(fill);
      ship.appendChild(msg);
      ship.appendChild(track);
      inner.appendChild(ship);
      ship._msg = msg;
      ship._fill = fill;
    }

    var row = elem('div', 'klyna-sc__row');

    var media = null;
    if (cfg.showImage && (st.variant.image || prod.featuredImage)) {
      media = document.createElement('img');
      media.className = 'klyna-sc__media';
      media.alt = '';
      media.loading = 'lazy';
      media.src = st.variant.image || prod.featuredImage;
      row.appendChild(media);
    }

    var info = elem('div', 'klyna-sc__info');
    var title = elem('span', 'klyna-sc__title');
    title.textContent = prod.title;
    info.appendChild(title);
    var price = null;
    if (cfg.showPrice) {
      price = elem('span', 'klyna-sc__price');
      info.appendChild(price);
    }
    row.appendChild(info);

    var controls = elem('div', 'klyna-sc__controls');

    var variantSelect = null;
    if (cfg.showVariantSelector && prod.variants.length > 1) {
      variantSelect = document.createElement('select');
      variantSelect.className = 'klyna-sc__select';
      variantSelect.setAttribute('aria-label', 'Variant');
      prod.variants.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = String(v.id);
        opt.textContent = v.title + (v.available ? '' : ' — sold out');
        opt.disabled = !v.available;
        if (v.id === st.variant.id) opt.selected = true;
        variantSelect.appendChild(opt);
      });
      controls.appendChild(variantSelect);
    }

    var qtyWrap = null;
    if (cfg.showQuantity) {
      qtyWrap = elem('div', 'klyna-sc__qty');
      var minus = button('−', 'Decrease quantity');
      var input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.value = String(st.qty);
      input.setAttribute('aria-label', 'Quantity');
      var plus = button('+', 'Increase quantity');
      qtyWrap.appendChild(minus);
      qtyWrap.appendChild(input);
      qtyWrap.appendChild(plus);
      qtyWrap._minus = minus;
      qtyWrap._plus = plus;
      qtyWrap._input = input;
      controls.appendChild(qtyWrap);
    }

    var buttons = elem('div', 'klyna-sc__buttons');
    var buyBtn = null;
    if (cfg.quickBuy.enabled) {
      buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'klyna-sc__btn klyna-sc__btn--buy';
      buyBtn.textContent = cfg.quickBuy.label;
      buttons.appendChild(buyBtn);
    }
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'klyna-sc__btn klyna-sc__btn--add';
    addBtn.textContent = cfg.cta.label;
    buttons.appendChild(addBtn);

    controls.appendChild(buttons);
    row.appendChild(controls);
    inner.appendChild(row);

    var refs = {
      el: el,
      media: media,
      price: price,
      variantSelect: variantSelect,
      qtyWrap: qtyWrap,
      addBtn: addBtn,
      buyBtn: buyBtn,
      ship: ship,
    };
    // Remember the merchant's add label so we can restore it after a sold-out
    // variant flips back to available.
    addBtn.dataset.label = cfg.cta.label;

    updatePrice(refs, st, cfg);
    updateAvailability(refs, st);
    return refs;
  }

  function bindEvents(refs, prod, cfg, st) {
    if (refs.variantSelect) {
      refs.variantSelect.addEventListener('change', function () {
        var found = prod.variants.filter(function (v) {
          return String(v.id) === refs.variantSelect.value;
        })[0];
        if (found) {
          st.variant = found;
          if (refs.media && found.image) refs.media.src = found.image;
          updatePrice(refs, st, cfg);
          updateAvailability(refs, st);
          track('variant', { variantId: found.id });
        }
      });
    }

    if (refs.qtyWrap) {
      refs.qtyWrap._minus.addEventListener('click', function () {
        setQty(refs, st, st.qty - 1);
      });
      refs.qtyWrap._plus.addEventListener('click', function () {
        setQty(refs, st, st.qty + 1);
      });
      refs.qtyWrap._input.addEventListener('change', function () {
        setQty(refs, st, parseInt(refs.qtyWrap._input.value, 10));
      });
    }

    refs.addBtn.addEventListener('click', function () {
      addToCart(refs, st, cfg, false);
    });
    if (refs.buyBtn) {
      refs.buyBtn.addEventListener('click', function () {
        addToCart(refs, st, cfg, true);
      });
    }
  }

  function setQty(refs, st, value) {
    var q = isNaN(value) || value < 1 ? 1 : value;
    st.qty = q;
    if (refs.qtyWrap) refs.qtyWrap._input.value = String(q);
    track('qty', { variantId: st.variant.id });
  }

  function updatePrice(refs, st, cfg) {
    if (refs.price && cfg.showPrice) {
      refs.price.textContent = formatMoney(st.variant.price);
    }
  }

  function updateAvailability(refs, st) {
    var soldOut = !st.variant.available;
    refs.addBtn.disabled = soldOut || state.addBusy;
    refs.addBtn.textContent = soldOut ? 'Sold out' : refs.addBtn.dataset.label;
    if (refs.buyBtn) refs.buyBtn.disabled = soldOut || state.buyBusy;
  }

  // ---------------------------------------------------------------------------
  // Cart actions
  // ---------------------------------------------------------------------------
  function addToCart(refs, st, cfg, quickBuy) {
    if (!st.variant || !st.variant.available) return;
    var btn = quickBuy ? refs.buyBtn : refs.addBtn;
    if (!btn || btn.classList.contains('is-loading')) return;
    btn.classList.add('is-loading');
    btn.disabled = true;

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: st.variant.id, quantity: st.qty }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('add_failed');
        return r.json();
      })
      .then(function () {
        track(quickBuy ? 'quickbuy' : 'atc', {
          productId: product.id,
          variantId: st.variant.id,
        });
        if (quickBuy) {
          window.location.href = '/checkout';
          return;
        }
        // Refresh the cart total so the free-shipping bar advances, then nudge
        // the theme to open its cart drawer if it listens for these events.
        refreshCart();
        document.dispatchEvent(new CustomEvent('klyna:sticky-cart:added'));
        bubbleCartUpdate();
      })
      .catch(function () {
        /* swallow — keep the storefront resilient */
      })
      .then(function () {
        btn.classList.remove('is-loading');
        btn.disabled = !st.variant.available;
      });
  }

  function refreshCart() {
    fetch('/cart.js', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cart) {
        if (cart && typeof cart.total_price === 'number') {
          cartTotalCents = cart.total_price;
          if (currentRefs) updateFreeShip(currentRefs, settings, cartTotalCents);
        }
      })
      .catch(function () {});
  }

  // ---------------------------------------------------------------------------
  // Free shipping
  // ---------------------------------------------------------------------------
  function updateFreeShip(refs, cfg, totalCents) {
    if (!refs.ship || !cfg.freeShip.enabled || cfg.freeShip.threshold <= 0) return;
    var thresholdCents = Math.round(cfg.freeShip.threshold * 100);
    var pct = thresholdCents ? Math.min(100, (totalCents / thresholdCents) * 100) : 100;
    var remainingCents = Math.max(thresholdCents - totalCents, 0);

    refs.ship._fill.style.width = pct + '%';

    if (remainingCents <= 0) {
      refs.el.classList.add('is-unlocked');
      refs.ship._msg.innerHTML = escapeHtml(cfg.freeShip.successMessage);
      if (!state.freeShipUnlockSent && totalCents > 0) {
        state.freeShipUnlockSent = true;
        track('freeship_unlock', { cartValue: totalCents / 100 });
      }
    } else {
      refs.el.classList.remove('is-unlocked');
      state.freeShipUnlockSent = false;
      var remaining = formatMoney(remainingCents);
      var msg = cfg.freeShip.message.replace('{{remaining}}', '<strong>' + escapeHtml(remaining) + '</strong>');
      refs.ship._msg.innerHTML = msg;
    }
  }

  // ---------------------------------------------------------------------------
  // Visibility (scroll reveal + native ATC observation)
  // ---------------------------------------------------------------------------
  function setupVisibility(el, cfg) {
    if (!cfg.enabled) return;

    if (!cfg.showAfterScroll) {
      reveal(el);
      return;
    }

    var nativeAtc =
      document.querySelector('form[action$="/cart/add"] [type="submit"], button[name="add"], .product-form__submit');

    if (nativeAtc && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) hide(el);
            else reveal(el);
          });
        },
        { rootMargin: '0px 0px -40px 0px' },
      );
      io.observe(nativeAtc);
    } else {
      // Fallback: reveal after the shopper scrolls a screen height.
      var onScroll = function () {
        if (window.scrollY > window.innerHeight * 0.6) reveal(el);
        else hide(el);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  function reveal(el) {
    if (el.hidden) el.hidden = false;
    el.classList.add('is-visible');
    if (!state.impressionSent) {
      state.impressionSent = true;
      track('impression', { productId: product.id });
    }
  }

  function hide(el) {
    el.classList.remove('is-visible');
  }

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------
  function track(event, extra) {
    var body = Object.assign({ event: event }, extra || {});
    var payload = JSON.stringify(body);
    var url = proxyBase + '/track';
    // Prefer sendBeacon so navigation (quick-buy) doesn't cancel the request.
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        return;
      } catch (e) {
        /* fall through to fetch */
      }
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: payload,
    }).catch(function () {});
  }

  // ---------------------------------------------------------------------------
  // AI cart-recovery one-liner (top banner)
  // ---------------------------------------------------------------------------
  function bumpVisitCount() {
    try {
      var key = 'klyna_sc_visits';
      var n = parseInt(window.localStorage.getItem(key) || '0', 10) || 0;
      n += 1;
      window.localStorage.setItem(key, String(n));
      return n;
    } catch (e) {
      return 1;
    }
  }

  function loadRecoverLine() {
    var banner = root.querySelector('[data-klyna-sc-recover]');
    if (!banner) return;
    var visitCount = bumpVisitCount();
    fetch('/cart.js', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cart) {
        if (!cart || !cart.items || !cart.items.length) return null;
        var lines = cart.items.slice(0, 6).map(function (it) {
          return {
            title: it.product_title || it.title || '',
            quantity: it.quantity || 1,
            price: typeof it.price === 'number' ? it.price / 100 : undefined,
          };
        });
        return fetch(proxyBase + '/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            lines: lines,
            cartTotal: (cart.total_price || 0) / 100,
            visitCount: visitCount,
            currency: cart.currency || undefined,
          }),
        });
      })
      .then(function (r) {
        return r && r.ok ? r.json() : null;
      })
      .then(function (body) {
        if (!body || !body.ok || !body.message) return;
        banner.textContent = body.message;
        banner.hidden = false;
      })
      .catch(function () {});
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function pickInitialVariant(prod) {
    var available = prod.variants.filter(function (v) {
      return v.available;
    });
    return available[0] || prod.variants[0];
  }

  function applyTheme(el, cfg) {
    el.style.setProperty('--klyna-sc-cta', cfg.cta.color);
    el.style.setProperty('--klyna-sc-cta-fg', cfg.cta.textColor);
    el.style.setProperty('--klyna-sc-progress', cfg.freeShip.color);
  }

  function bubbleCartUpdate() {
    // Many themes refresh their cart on this PUB-SUB-style event.
    try {
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
    } catch (e) {}
  }

  function elem(tag, cls) {
    var n = document.createElement(tag);
    n.className = cls;
    return n;
  }

  function button(label, aria) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    return b;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Shopify money: amount is in cents. Render with the shop's money_format,
  // falling back to Intl for {{amount}}-style placeholders we can't fill.
  function formatMoney(cents) {
    var amount = (cents / 100).toFixed(2);
    var withCommas = function (decimals) {
      var n = (cents / 100).toFixed(decimals == null ? 2 : decimals);
      var parts = n.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    };
    if (moneyFormat && /\{\{\s*amount/.test(moneyFormat)) {
      return moneyFormat
        .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, withCommas(0))
        .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, amount.replace('.', ','))
        .replace(/\{\{\s*amount\s*\}\}/g, withCommas());
    }
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency }).format(
        cents / 100,
      );
    } catch (e) {
      return '$' + amount;
    }
  }
})();
