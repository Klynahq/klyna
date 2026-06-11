/**
 * Klyna Consent — banner.js
 *
 * Responsibilities:
 *  1. Read/write the klyna_consent cookie (JSON, 365-day, SameSite=Lax).
 *  2. Show/hide the banner based on existing consent state + geo flag.
 *  3. Handle Accept All / Reject All / Manage Preferences from the banner.
 *  4. Drive the preferences modal (focus trap, Escape, toggles).
 *  5. Update Google Consent Mode v2 signals via dataLayer.push.
 *  6. Unblock <script data-klyna-category="..."> tags after consent.
 *  7. Show/hide the floating "Cookie settings" re-open button.
 *
 * No jQuery. No external dependencies.
 * Config injected by PHP via KlynaConsentConfig (wp_localize_script).
 */

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  const cfg = window.KlynaConsentConfig || {};
  const COOKIE_NAME = cfg.cookieName || 'klyna_consent';
  const COOKIE_DAYS = cfg.cookieDays || 365;

  // ── Cookie helpers ───────────────────────────────────────────────────────────

  /**
   * Write a JSON cookie with SameSite=Lax.
   * @param {string} name
   * @param {object} value
   * @param {number} days
   */
  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    const json = JSON.stringify(value);
    document.cookie =
      encodeURIComponent(name) +
      '=' +
      encodeURIComponent(json) +
      '; expires=' +
      expires +
      '; path=/; SameSite=Lax';
  }

  /**
   * Read and JSON-parse a cookie. Returns null if missing or unparseable.
   * @param {string} name
   * @returns {object|null}
   */
  function getCookie(name) {
    const key = encodeURIComponent(name) + '=';
    const pairs = document.cookie.split(';');
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i].trim();
      if (pair.indexOf(key) === 0) {
        try {
          return JSON.parse(decodeURIComponent(pair.slice(key.length)));
        } catch (_) {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Consent object shape:
   * {
   *   necessary: true,      // always true
   *   analytics: boolean,
   *   marketing: boolean,
   *   preferences: boolean,
   *   ts: number            // unix ms when last saved
   * }
   */

  /**
   * Returns the saved consent object or null if not yet set.
   * @returns {object|null}
   */
  function getSavedConsent() {
    return getCookie(COOKIE_NAME);
  }

  /**
   * Save consent and fire all downstream effects.
   * @param {object} consent
   */
  function saveConsent(consent) {
    consent.necessary = true;
    consent.ts = Date.now();
    setCookie(COOKIE_NAME, consent, COOKIE_DAYS);
    updateGCM(consent);
    unblockScripts(consent);
    hideBanner();
    showReopenButton();
  }

  // ── Google Consent Mode v2 ──────────────────────────────────────────────────

  /**
   * Push a GCM v2 'update' command to dataLayer.
   * Called after the user makes a consent choice.
   * @param {object} consent
   */
  function updateGCM(consent) {
    if (!cfg.googleConsentMode) return;

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }

    gtag('consent', 'update', {
      analytics_storage:       consent.analytics    ? 'granted' : 'denied',
      ad_storage:              consent.marketing    ? 'granted' : 'denied',
      ad_user_data:            consent.marketing    ? 'granted' : 'denied',
      ad_personalization:      consent.marketing    ? 'granted' : 'denied',
      functionality_storage:   consent.preferences  ? 'granted' : 'denied',
      personalization_storage: consent.preferences  ? 'granted' : 'denied',
    });
  }

  /**
   * If the page already has a saved consent cookie, push GCM update signals
   * immediately so GA/GTM scripts that fire on DOMContentLoaded respect them.
   */
  function restoreGCMFromCookie() {
    if (!cfg.googleConsentMode) return;
    const consent = getSavedConsent();
    if (consent) {
      updateGCM(consent);
    }
  }

  // ── Script unblocking ────────────────────────────────────────────────────────

  /**
   * Re-execute <script type="text/plain" data-klyna-category="..."> tags
   * whose category has just been granted.
   * @param {object} consent
   */
  function unblockScripts(consent) {
    const blocked = document.querySelectorAll(
      'script[type="text/plain"][data-klyna-category]'
    );

    blocked.forEach(function (originalScript) {
      const category = originalScript.getAttribute('data-klyna-category');
      if (!consent[category]) return; // Still denied.

      const clone = document.createElement('script');

      // Copy attributes except type (we want it to execute).
      Array.from(originalScript.attributes).forEach(function (attr) {
        if (attr.name !== 'type') {
          clone.setAttribute(attr.name, attr.value);
        }
      });

      // Copy inline content.
      if (originalScript.textContent) {
        clone.textContent = originalScript.textContent;
      }

      // Mark as unblocked so we don't double-run.
      originalScript.setAttribute('data-klyna-unblocked', '1');
      originalScript.setAttribute('type', 'text/javascript');

      originalScript.parentNode.replaceChild(clone, originalScript);
    });
  }

  // ── Banner visibility ────────────────────────────────────────────────────────

  function showBanner() {
    const banner = document.getElementById('klyna-consent-banner');
    if (!banner) return;
    banner.hidden = false;
    banner.removeAttribute('aria-hidden');
    // Focus first button for keyboard users.
    const firstBtn = banner.querySelector('button');
    if (firstBtn) firstBtn.focus();
  }

  function hideBanner() {
    const banner = document.getElementById('klyna-consent-banner');
    if (banner) {
      banner.hidden = true;
      banner.setAttribute('aria-hidden', 'true');
    }
  }

  function showReopenButton() {
    const btn = document.getElementById('klyna-consent-reopen');
    if (btn) btn.hidden = false;
  }

  function hideReopenButton() {
    const btn = document.getElementById('klyna-consent-reopen');
    if (btn) btn.hidden = true;
  }

  // ── Modal ────────────────────────────────────────────────────────────────────

  /** All focusable elements inside the modal box. */
  function getFocusableInModal() {
    const box = document.querySelector('.klyna-consent-modal__box');
    if (!box) return [];
    return Array.from(
      box.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }

  function trapFocus(e) {
    const focusable = getFocusableInModal();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    if (e.key === 'Escape') {
      closeModal();
    }
  }

  /**
   * Populate modal toggles from existing consent (or all-off if first visit).
   * @param {object|null} consent
   */
  function populateModalToggles(consent) {
    const checkboxes = document.querySelectorAll('.klyna-toggle__input[data-category]');
    checkboxes.forEach(function (cb) {
      const cat = cb.getAttribute('data-category');
      cb.checked = consent ? !!consent[cat] : false;
    });
  }

  function openModal() {
    const modal = document.getElementById('klyna-consent-modal');
    if (!modal) return;
    hideReopenButton();
    populateModalToggles(getSavedConsent());
    modal.hidden = false;
    modal.setAttribute('aria-modal', 'true');
    document.body.style.overflow = 'hidden';

    // Focus the modal box.
    const box = modal.querySelector('.klyna-consent-modal__box');
    if (box) box.focus();

    document.addEventListener('keydown', trapFocus);
  }

  function closeModal() {
    const modal = document.getElementById('klyna-consent-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', trapFocus);

    // Return focus to the button that opened the modal.
    const trigger = document.getElementById('klyna-consent-manage')
      || document.getElementById('klyna-consent-reopen');
    if (trigger) trigger.focus();

    // Re-show reopen button if consent was already given.
    if (getSavedConsent()) showReopenButton();
  }

  // ── Consent actions ──────────────────────────────────────────────────────────

  function acceptAll() {
    saveConsent({
      necessary:   true,
      analytics:   !!cfg.enableAnalytics,
      marketing:   !!cfg.enableMarketing,
      preferences: !!cfg.enablePreferences,
    });
    closeModal();
  }

  function rejectAll() {
    saveConsent({
      necessary:   true,
      analytics:   false,
      marketing:   false,
      preferences: false,
    });
    closeModal();
  }

  function savePreferences() {
    const consent = {
      necessary:   true,
      analytics:   false,
      marketing:   false,
      preferences: false,
    };
    const checkboxes = document.querySelectorAll('.klyna-toggle__input[data-category]');
    checkboxes.forEach(function (cb) {
      const cat = cb.getAttribute('data-category');
      if (cat && cb.checked) consent[cat] = true;
    });
    saveConsent(consent);
    closeModal();
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  function wireEvents() {
    // Banner buttons.
    const banner = document.getElementById('klyna-consent-banner');
    if (banner) {
      banner.addEventListener('click', function (e) {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        switch (btn.getAttribute('data-action')) {
          case 'accept-all': acceptAll(); break;
          case 'reject-all': rejectAll(); break;
          case 'open-modal': openModal(); break;
        }
      });
    }

    // Modal buttons.
    const modal = document.getElementById('klyna-consent-modal');
    if (modal) {
      // Delegate button clicks inside modal box.
      const box = modal.querySelector('.klyna-consent-modal__box');
      if (box) {
        box.addEventListener('click', function (e) {
          const btn = e.target.closest('button[data-action], button#klyna-modal-close');
          if (!btn) return;
          const action = btn.getAttribute('data-action') || btn.id;
          switch (action) {
            case 'save-preferences':   savePreferences(); break;
            case 'accept-all-modal':   acceptAll(); break;
            case 'klyna-modal-close':  closeModal(); break;
          }
        });
      }

      // Click on backdrop → close.
      const backdrop = modal.querySelector('.klyna-consent-modal__backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', closeModal);
      }
    }

    // Floating re-open button.
    const reopen = document.getElementById('klyna-consent-reopen');
    if (reopen) {
      reopen.addEventListener('click', openModal);
    }
  }

  // ── Apply CSS custom properties from config ──────────────────────────────────

  function applyThemeVars() {
    const root = document.documentElement;
    if (cfg.bgColor)     root.style.setProperty('--kc-bg',      cfg.bgColor);
    if (cfg.textColor)   root.style.setProperty('--kc-text',    cfg.textColor);
    if (cfg.accentColor) root.style.setProperty('--kc-accent',  cfg.accentColor);
  }

  // ── Initialise ───────────────────────────────────────────────────────────────

  function init() {
    applyThemeVars();
    restoreGCMFromCookie();

    const existing = getSavedConsent();

    if (existing) {
      // Consent already recorded — unblock applicable scripts and show re-open btn.
      unblockScripts(existing);
      showReopenButton();
    } else if (cfg.showBanner !== false) {
      // No consent yet and geo check passed — show banner.
      showBanner();
    }

    wireEvents();
  }

  // Run after DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
