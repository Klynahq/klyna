/**
 * Klyna Analytics — front-end beacon.
 *
 * A ~1 KB cookieless tracker. Sends one pageview per page load (and per
 * History API navigation) to the REST collector. No cookies, no localStorage,
 * no fingerprinting, no third-party requests. Honors Do-Not-Track / GPC.
 *
 * Exposes a tiny global `wpAnalytics(eventName)` for custom events.
 */
(function () {
  'use strict';

  var cfg = window.KlynaAnalytics || {};
  if (!cfg.endpoint) {
    return;
  }

  // Defense-in-depth: bail client-side too if the visitor opted out.
  function optedOut() {
    if (!cfg.respectDnt) {
      return false;
    }
    var nav = window.navigator || {};
    var dnt =
      nav.doNotTrack || window.doNotTrack || nav.msDoNotTrack || null;
    if (dnt === '1' || dnt === 'yes') {
      return true;
    }
    if (nav.globalPrivacyControl === true) {
      return true;
    }
    return false;
  }

  if (optedOut()) {
    return;
  }

  function send(event) {
    var payload = {
      path: location.pathname || '/',
      ref: document.referrer || '',
      event: event || 'pageview',
    };

    var body = JSON.stringify(payload);

    // sendBeacon is fire-and-forget and survives page unload. The nonce rides
    // in the URL because sendBeacon cannot set custom headers.
    var url =
      cfg.endpoint + (cfg.endpoint.indexOf('?') === -1 ? '?' : '&') +
      '_wpnonce=' + encodeURIComponent(cfg.nonce || '');

    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) {
          return;
        }
      } catch (e) {
        /* fall through to fetch */
      }
    }

    // Fallback for browsers without sendBeacon.
    try {
      fetch(cfg.endpoint, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': cfg.nonce || '',
        },
        body: body,
        credentials: 'same-origin',
      }).catch(function () {});
    } catch (e2) {
      /* give up silently — analytics must never break a page */
    }
  }

  // Track the initial pageview once the document is ready.
  function trackPageview() {
    send('pageview');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    trackPageview();
  } else {
    window.addEventListener('DOMContentLoaded', trackPageview, { once: true });
  }

  // SPA / History API support — count client-side route changes as pageviews.
  var lastPath = location.pathname;
  function onRouteChange() {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      send('pageview');
    }
  }
  window.addEventListener('popstate', onRouteChange);
  var origPush = history.pushState;
  if (typeof origPush === 'function') {
    history.pushState = function () {
      origPush.apply(this, arguments);
      onRouteChange();
    };
  }

  // Public API for custom events: wpAnalytics('signup').
  window.wpAnalytics = function (event) {
    if (typeof event !== 'string' || !event) {
      return;
    }
    send(event.toLowerCase());
  };
})();
