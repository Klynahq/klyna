/*
 * Klyna Wishlist — storefront engine.
 *
 * Powers both the heart buttons (data-klyna-wishlist) and the floating
 * launcher (data-klyna-launcher) added by the Theme App Extension.
 *
 * Strategy:
 *   • Guest saves land in localStorage instantly for a zero-latency toggle.
 *   • Every change is mirrored to the server through the App Proxy
 *     (/apps/wishlist/api) so logged-in lists follow the customer across
 *     devices and the admin reports stay live.
 *   • On first load we MERGE the local cache into the server list once, so a
 *     guest who later logs in keeps everything they saved.
 *
 * No framework, no build step — this file ships as-is to the theme.
 */
(function () {
  'use strict';

  var LS_ITEMS = 'klyna_wishlist_items';
  var LS_GUEST = 'klyna_wishlist_guest';
  var MERGED_FLAG = 'klyna_wishlist_merged';

  var config = (window.KlynaWishlist && window.KlynaWishlist.config) || {};
  var apiBase = config.apiBase || '/apps/wishlist/api';

  function guestId() {
    try {
      var v = localStorage.getItem(LS_GUEST);
      if (!v) {
        v = 'g' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(LS_GUEST, v);
      }
      return v;
    } catch (e) {
      return '';
    }
  }

  function readLocal() {
    try {
      return JSON.parse(localStorage.getItem(LS_ITEMS) || '[]');
    } catch (e) {
      return [];
    }
  }

  function writeLocal(items) {
    try {
      localStorage.setItem(LS_ITEMS, JSON.stringify(items));
    } catch (e) {
      /* storage full / disabled — server copy still wins */
    }
  }

  function hasItem(items, productId) {
    return items.some(function (i) {
      return i.productId === productId;
    });
  }

  function apiUrl() {
    // Append the guest id so the server can find the right list. The proxy
    // already injects logged_in_customer_id for authenticated shoppers.
    var sep = apiBase.indexOf('?') === -1 ? '?' : '&';
    return apiBase + sep + 'guest=' + encodeURIComponent(guestId());
  }

  function post(body) {
    return fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ guest: guestId() }, body)),
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  // ---- UI sync -----------------------------------------------------------

  function renderButtons(items) {
    var buttons = document.querySelectorAll('[data-klyna-wishlist]');
    buttons.forEach(function (btn) {
      var pid = btn.getAttribute('data-product-id');
      var saved = hasItem(items, pid);
      btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
      btn.classList.toggle('is-saved', saved);
      var label = btn.querySelector('.klyna-wishlist-toggle__label');
      if (label) {
        label.textContent = saved
          ? label.getAttribute('data-label-saved') || 'Saved'
          : label.getAttribute('data-label-add') || 'Save';
      }
    });
  }

  function renderCount(items) {
    var badges = document.querySelectorAll('[data-klyna-count]');
    badges.forEach(function (badge) {
      var n = items.length;
      badge.textContent = String(n);
      if (n > 0) {
        badge.removeAttribute('hidden');
      } else {
        badge.setAttribute('hidden', '');
      }
    });
  }

  function render(items) {
    renderButtons(items);
    renderCount(items);
  }

  // ---- Toggle handler ----------------------------------------------------

  function toggle(btn) {
    var productId = btn.getAttribute('data-product-id');
    var variantId = btn.getAttribute('data-variant-id') || null;
    var handle = btn.getAttribute('data-product-handle') || '';
    var items = readLocal();
    var saved = hasItem(items, productId);

    if (saved) {
      items = items.filter(function (i) {
        return i.productId !== productId;
      });
      writeLocal(items);
      render(items);
      post({ action: 'remove', productId: productId, variantId: variantId });
    } else {
      items = items.concat([
        { productId: productId, variantId: variantId, handle: handle },
      ]);
      writeLocal(items);
      render(items);
      btn.classList.add('klyna-pop');
      setTimeout(function () {
        btn.classList.remove('klyna-pop');
      }, 300);
      post({ action: 'add', productId: productId, variantId: variantId });
    }
  }

  function bind() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-klyna-wishlist]');
      if (!btn) return;
      e.preventDefault();
      toggle(btn);
    });
  }

  // ---- Boot --------------------------------------------------------------

  function syncFromServer() {
    fetch(apiUrl(), { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.items)) return;
        var serverItems = data.items.map(function (i) {
          return {
            productId: i.productId,
            variantId: i.variantId || null,
            handle: i.handle || '',
          };
        });
        // First load: merge any local-only saves up to the server once.
        var merged = localStorage.getItem(MERGED_FLAG);
        var local = readLocal();
        if (!merged && local.length) {
          var missing = local.filter(function (l) {
            return !hasItem(serverItems, l.productId);
          });
          if (missing.length) {
            post({ action: 'merge', items: missing });
            serverItems = serverItems.concat(missing);
          }
        }
        try {
          localStorage.setItem(MERGED_FLAG, '1');
        } catch (e) {
          /* ignore */
        }
        writeLocal(serverItems);
        render(serverItems);
      })
      .catch(function () {
        // Offline / proxy unreachable — fall back to the local cache.
        render(readLocal());
      });
  }

  function init() {
    bind();
    render(readLocal());
    syncFromServer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
