/* Klyna Back-in-Stock — storefront widget runtime.
 *
 * Vanilla JS, no dependencies, no theme assumptions. For each Klyna block on the
 * page it:
 *   1. Reads the product's variants JSON to know what's in stock.
 *   2. Toggles the widget's visibility to match the selected variant — shown only
 *      when that variant is sold out.
 *   3. Tracks variant selection by watching the URL ?variant= param and common
 *      theme events / form inputs, so it follows the customer without a reload.
 *   4. On submit, POSTs the signup to the app's /api/subscribe endpoint and
 *      swaps the form for the success message.
 */
(function () {
  'use strict';

  function initBlock(root) {
    if (root.__klynaInit) return;
    root.__klynaInit = true;

    var endpoint = root.getAttribute('data-endpoint');
    var shop = root.getAttribute('data-shop');
    var productId = root.getAttribute('data-product-id');
    var productTitle = root.getAttribute('data-product-title');
    var productHandle = root.getAttribute('data-product-handle');
    var successMsg = root.getAttribute('data-success') || "You're on the list.";

    var blockId = root.id.replace('klyna-bis-', '');
    var variants = readVariants(blockId);
    var form = root.querySelector('[data-klyna-bis-form]');
    var msg = root.querySelector('[data-klyna-bis-msg]');
    var submitBtn = root.querySelector('[data-klyna-bis-submit]');

    var currentVariantId = Number(root.getAttribute('data-variant-id')) || null;

    function variantById(id) {
      for (var i = 0; i < variants.length; i++) {
        if (variants[i].id === id) return variants[i];
      }
      return null;
    }

    function syncVisibility() {
      var v = variantById(currentVariantId);
      // If we can't resolve the variant, fall back to keeping current state.
      if (!v) return;
      var soldOut = !v.available;
      if (soldOut) {
        root.removeAttribute('hidden');
      } else {
        root.setAttribute('hidden', '');
      }
    }

    function setVariant(id) {
      if (!id || id === currentVariantId) return;
      currentVariantId = id;
      root.setAttribute('data-variant-id', String(id));
      // Reset the form so a fresh, un-submitted state is shown per variant.
      if (form) form.removeAttribute('hidden');
      if (msg) {
        msg.setAttribute('hidden', '');
        msg.textContent = '';
      }
      syncVisibility();
    }

    // ── Variant tracking ────────────────────────────────────────────────────
    // 1. URL param (most themes update this on variant change).
    function variantFromUrl() {
      try {
        var p = new URLSearchParams(window.location.search).get('variant');
        return p ? Number(p) : null;
      } catch (e) {
        return null;
      }
    }

    var urlVariant = variantFromUrl();
    if (urlVariant) setVariant(urlVariant);
    else syncVisibility();

    // 2. Watch the address bar (Dawn + most themes push state on change).
    var lastSearch = window.location.search;
    setInterval(function () {
      if (window.location.search !== lastSearch) {
        lastSearch = window.location.search;
        var v = variantFromUrl();
        if (v) setVariant(v);
      }
    }, 400);

    // 3. Watch any [name="id"] variant selector in the surrounding form.
    var idInputs = document.querySelectorAll('form[action*="/cart/add"] [name="id"]');
    idInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        var v = Number(input.value);
        if (v) setVariant(v);
      });
    });

    // ── Submit ──────────────────────────────────────────────────────────────
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!form.reportValidity()) return;

        var emailEl = form.querySelector('[name="email"]');
        var phoneEl = form.querySelector('[name="phone"]');
        var consentEl = form.querySelector('[name="consent"]');
        var variant = variantById(currentVariantId);

        var payload = {
          shop: shop,
          productId: productId,
          variantId: String(currentVariantId || ''),
          productTitle: productTitle,
          productHandle: productHandle,
          variantTitle: variant && variant.title !== 'Default Title' ? variant.title : '',
          email: emailEl ? emailEl.value.trim() : '',
          phone: phoneEl ? phoneEl.value.trim() : '',
          consent: consentEl && consentEl.checked ? 'true' : 'false',
          locale: document.documentElement.lang || '',
          sourceUrl: window.location.href,
        };

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.dataset.label = submitBtn.textContent;
          submitBtn.textContent = '…';
        }

        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            return res.json().catch(function () {
              return { ok: res.ok };
            });
          })
          .then(function (data) {
            if (data && data.ok) {
              form.setAttribute('hidden', '');
              showMessage(successMsg, 'success');
            } else {
              restoreButton();
              showMessage((data && data.error) || 'Something went wrong. Please try again.', 'error');
            }
          })
          .catch(function () {
            restoreButton();
            showMessage('Network error. Please try again.', 'error');
          });
      });
    }

    function restoreButton() {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (submitBtn.dataset.label) submitBtn.textContent = submitBtn.dataset.label;
      }
    }

    function showMessage(text, tone) {
      if (!msg) return;
      msg.textContent = text;
      msg.setAttribute('data-tone', tone);
      msg.removeAttribute('hidden');
    }
  }

  function readVariants(blockId) {
    var el = document.querySelector('[data-klyna-bis-variants="' + blockId + '"]');
    if (!el) return [];
    try {
      return JSON.parse(el.textContent) || [];
    } catch (e) {
      return [];
    }
  }

  function initAll() {
    document.querySelectorAll('[data-klyna-bis]').forEach(initBlock);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Theme editor: re-init when a section/block is re-rendered.
  document.addEventListener('shopify:section:load', initAll);
})();
