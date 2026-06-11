/*
 * Klyna Urgency — storefront runtime.
 *
 * One small script powers all three blocks (timer, scarcity, social proof).
 * It fetches live config once per page from the app proxy, renders any blocks
 * present in the DOM, and beacons view/click events back for analytics.
 *
 * No dependencies. Defensive throughout — a misconfigured block must never
 * break the merchant's storefront.
 */
(function () {
  'use strict';

  var PROXY = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  // App proxy subpath configured in the Partner dashboard (Apps → App proxy).
  // Defaults to /apps/klyna-urgency — override via the block's data attribute.
  var CONFIG_PATH = '/apps/klyna-urgency/app/api/config';
  var EVENT_PATH = '/apps/klyna-urgency/app/api/event';

  var configPromise = null;

  function fetchConfig() {
    if (configPromise) return configPromise;
    configPromise = fetch(joinPath(PROXY, CONFIG_PATH), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (r) {
        return r.ok ? r.json() : { timers: [], scarcity: [], socialProof: null };
      })
      .catch(function () {
        return { timers: [], scarcity: [], socialProof: null };
      });
    return configPromise;
  }

  function joinPath(root, path) {
    if (root.endsWith('/')) root = root.slice(0, -1);
    return root + path;
  }

  // Fire-and-forget analytics beacon. Uses sendBeacon when available.
  function track(kind, widgetType, ids) {
    var payload = JSON.stringify(
      Object.assign({ kind: kind, widgetType: widgetType }, ids || {})
    );
    var url = joinPath(PROXY, EVENT_PATH);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        return;
      }
    } catch (e) {
      /* fall through to fetch */
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: payload,
      keepalive: true,
    }).catch(function () {});
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function formatRemaining(ms) {
    if (ms < 0) ms = 0;
    var totalSeconds = Math.floor(ms / 1000);
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return { days: days, hours: hours, minutes: minutes, seconds: seconds };
  }

  // ---- Countdown timers ---------------------------------------------------

  function targetMatches(targeting) {
    if (!targeting) return true;
    var scope = targeting.pageScope || 'all';
    var device = targeting.device || 'all';

    var template = (window.Shopify && window.Shopify.template) || pageTypeFromBody();
    var scopeOk =
      scope === 'all' ||
      (scope === 'home' && template === 'index') ||
      (scope === 'products' && template === 'product') ||
      (scope === 'collections' && template === 'collection') ||
      (scope === 'cart' && template === 'cart');

    var isMobile = window.matchMedia && window.matchMedia('(max-width: 749px)').matches;
    var deviceOk =
      device === 'all' || (device === 'mobile' && isMobile) || (device === 'desktop' && !isMobile);

    return scopeOk && deviceOk;
  }

  function pageTypeFromBody() {
    var cls = document.body ? document.body.className : '';
    if (/template-index/.test(cls)) return 'index';
    if (/template-product/.test(cls)) return 'product';
    if (/template-collection/.test(cls)) return 'collection';
    if (/template-cart/.test(cls)) return 'cart';
    return '';
  }

  // Evergreen timers persist a per-visitor deadline in localStorage.
  function evergreenDeadline(id, minutes) {
    var key = 'klyna-urgency:eg:' + id;
    var stored = null;
    try {
      stored = window.localStorage.getItem(key);
    } catch (e) {
      stored = null;
    }
    var now = Date.now();
    if (stored) {
      var ts = parseInt(stored, 10);
      if (!isNaN(ts) && ts > now) return ts;
    }
    var deadline = now + minutes * 60000;
    try {
      window.localStorage.setItem(key, String(deadline));
    } catch (e) {
      /* private mode — fall back to in-memory */
    }
    return deadline;
  }

  function renderTimer(el, cfg) {
    if (!targetMatches(cfg.targeting)) {
      el.style.display = 'none';
      return;
    }

    var deadline;
    if (cfg.style === 'evergreen') {
      deadline = evergreenDeadline(cfg.id, cfg.evergreenMinutes || 60);
    } else if (cfg.style === 'launch') {
      deadline = cfg.startsAt ? new Date(cfg.startsAt).getTime() : 0;
    } else {
      deadline = cfg.endsAt ? new Date(cfg.endsAt).getTime() : 0;
    }

    if (cfg.accentColor) el.style.setProperty('--klyna-accent', cfg.accentColor);

    el.innerHTML =
      '<div class="klyna-timer__head">' +
      '<span class="klyna-timer__headline"></span>' +
      '<span class="klyna-timer__subtext"></span>' +
      '</div>' +
      '<div class="klyna-timer__clock" role="timer" aria-live="off">' +
      unit('days') + sep() + unit('hours') + sep() + unit('minutes') + sep() + unit('seconds') +
      '</div>';

    el.querySelector('.klyna-timer__headline').textContent = cfg.headline || '';
    var sub = el.querySelector('.klyna-timer__subtext');
    if (cfg.subtext) sub.textContent = cfg.subtext;
    else sub.style.display = 'none';

    var clock = el.querySelector('.klyna-timer__clock');
    var fields = {
      days: el.querySelector('[data-k="days"] .klyna-timer__num'),
      hours: el.querySelector('[data-k="hours"] .klyna-timer__num'),
      minutes: el.querySelector('[data-k="minutes"] .klyna-timer__num'),
      seconds: el.querySelector('[data-k="seconds"] .klyna-timer__num'),
    };

    var expired = false;
    function tick() {
      var ms = deadline - Date.now();
      if (ms <= 0 && !expired) {
        expired = true;
        handleExpiry(el, clock, cfg);
        if (timerInterval) clearInterval(timerInterval);
        return;
      }
      var r = formatRemaining(ms);
      // Hide the days field when zero to keep the clock tidy.
      var daysWrap = el.querySelector('[data-k="days"]');
      if (r.days === 0) daysWrap.style.display = 'none';
      else daysWrap.style.display = '';
      fields.days.textContent = pad(r.days);
      fields.hours.textContent = pad(r.hours);
      fields.minutes.textContent = pad(r.minutes);
      fields.seconds.textContent = pad(r.seconds);
    }

    tick();
    var timerInterval = setInterval(tick, 1000);

    el.classList.add('klyna-timer--ready');
    track('view', 'timer', { timerId: cfg.id });
    el.addEventListener('click', function () {
      track('click', 'timer', { timerId: cfg.id });
    });
  }

  function handleExpiry(el, clock, cfg) {
    if (cfg.expireAction === 'keep') {
      // Leave the clock at 00:00:00.
      return;
    }
    if (cfg.expireAction === 'message') {
      clock.outerHTML = '<div class="klyna-timer__expired"></div>';
      el.querySelector('.klyna-timer__expired').textContent =
        cfg.expireMessage || 'This offer has ended.';
      return;
    }
    // Default: hide.
    el.style.display = 'none';
  }

  function unit(key) {
    return (
      '<span class="klyna-timer__unit" data-k="' +
      key +
      '"><span class="klyna-timer__num">00</span>' +
      '<span class="klyna-timer__label">' +
      key +
      '</span></span>'
    );
  }
  function sep() {
    return '<span class="klyna-timer__sep">:</span>';
  }

  // ---- Scarcity badges ----------------------------------------------------

  function renderScarcity(el, config) {
    var productGid = el.getAttribute('data-product-gid') || '';
    var rules = config.scarcity || [];

    // Prefer a product-specific rule; fall back to a store-wide rule (empty gid).
    var rule = null;
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].productGid && rules[i].productGid === productGid) {
        rule = rules[i];
        break;
      }
    }
    if (!rule) {
      for (var j = 0; j < rules.length; j++) {
        if (!rules[j].productGid) {
          rule = rules[j];
          break;
        }
      }
    }
    if (!rule) {
      el.style.display = 'none';
      return;
    }

    // Live inventory comes from the theme via a data attribute the block sets
    // from {{ product.selected_or_first_available_variant.inventory_quantity }}.
    var qty = parseInt(el.getAttribute('data-inventory'), 10);
    if (isNaN(qty)) {
      el.style.display = 'none';
      return;
    }

    if (qty > rule.threshold || qty <= rule.hideAtOrBelow) {
      el.style.display = 'none';
      return;
    }

    if (rule.accentColor) el.style.setProperty('--klyna-accent', rule.accentColor);
    el.textContent = rule.template.replace('{count}', String(qty));
    el.classList.add('klyna-scarcity--ready');
    track('view', 'scarcity', { scarcityId: rule.id });
  }

  // ---- Social-proof popups ------------------------------------------------

  var SYNTHETIC = [
    { name: 'Maya', city: 'Portland', product: 'a best-seller', ago: '3 min ago' },
    { name: 'Liam', city: 'Toronto', product: 'a best-seller', ago: '8 min ago' },
    { name: 'Noah', city: 'Berlin', product: 'a best-seller', ago: '14 min ago' },
    { name: 'Ava', city: 'Sydney', product: 'a best-seller', ago: '21 min ago' },
  ];

  function renderSocialProof(el, config) {
    var sp = config.socialProof;
    if (!sp) {
      el.style.display = 'none';
      return;
    }
    var events = sp.source === 'synthetic' || !sp.events || !sp.events.length ? SYNTHETIC : sp.events;
    if (!events.length) {
      el.style.display = 'none';
      return;
    }

    if (sp.accentColor) el.style.setProperty('--klyna-accent', sp.accentColor);
    el.className = 'klyna-proof klyna-proof--' + (sp.position || 'bottom-left');

    var idx = 0;
    var shownOnce = false;

    function show() {
      var e = events[idx % events.length];
      idx += 1;
      var text = sp.template
        .replace('{name}', e.name)
        .replace('{city}', e.city)
        .replace('{product}', e.product);

      el.innerHTML =
        '<span class="klyna-proof__dot"></span>' +
        '<span class="klyna-proof__body">' +
        '<span class="klyna-proof__text"></span>' +
        '<span class="klyna-proof__ago"></span>' +
        '</span>' +
        '<button class="klyna-proof__close" aria-label="Dismiss">&times;</button>';
      el.querySelector('.klyna-proof__text').textContent = text;
      el.querySelector('.klyna-proof__ago').textContent = e.ago || '';
      el.querySelector('.klyna-proof__close').addEventListener('click', function () {
        el.classList.remove('klyna-proof--visible');
        clearInterval(loop);
      });
      el.classList.add('klyna-proof--visible');
      if (!shownOnce) {
        shownOnce = true;
        track('view', 'proof', {});
      }
      el.addEventListener('click', onClickOnce);

      window.setTimeout(function () {
        el.classList.remove('klyna-proof--visible');
      }, (sp.displaySeconds || 5) * 1000);
    }

    function onClickOnce(ev) {
      if (ev.target && ev.target.className === 'klyna-proof__close') return;
      track('click', 'proof', {});
      el.removeEventListener('click', onClickOnce);
    }

    // First popup after a short delay, then on an interval.
    window.setTimeout(show, 2500);
    var loop = window.setInterval(show, Math.max(4, sp.intervalSeconds || 12) * 1000);
  }

  // ---- Boot ---------------------------------------------------------------

  function boot() {
    var timers = document.querySelectorAll('[data-klyna-timer]');
    var scarcity = document.querySelectorAll('[data-klyna-scarcity]');
    var proof = document.querySelectorAll('[data-klyna-proof]');

    if (!timers.length && !scarcity.length && !proof.length) return;

    fetchConfig().then(function (config) {
      timers.forEach(function (el) {
        var id = el.getAttribute('data-timer-id');
        var cfg = pickTimer(config.timers, id);
        if (cfg) renderTimer(el, cfg);
        else el.style.display = 'none';
      });
      scarcity.forEach(function (el) {
        renderScarcity(el, config);
      });
      proof.forEach(function (el) {
        renderSocialProof(el, config);
      });
    });
  }

  // If the block specifies a timer id, use it; otherwise use the first active.
  function pickTimer(timers, id) {
    if (!timers || !timers.length) return null;
    if (id) {
      for (var i = 0; i < timers.length; i++) {
        if (timers[i].id === id) return timers[i];
      }
    }
    return timers[0];
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
