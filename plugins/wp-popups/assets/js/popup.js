/**
 * Klyna Popups — front-end engine.
 *
 * No build step, no jQuery. Reads the eligible-popup payloads injected by
 * Frontend::enqueue() on `window.KlynaPopups`, evaluates the per-visitor display
 * rules (frequency cap, new vs returning) that must run client-side to stay
 * correct under page caching, wires up triggers (time / scroll / exit / click),
 * renders the popup, records an impression, and posts captures to the REST API.
 */
(function () {
  'use strict';

  var BOOT = window.KlynaPopups;
  if (!BOOT || !Array.isArray(BOOT.popups) || BOOT.popups.length === 0) {
    return;
  }

  // Honor Do Not Track when the site opts in.
  if (BOOT.respectDnt && (navigator.doNotTrack === '1' || window.doNotTrack === '1')) {
    return;
  }

  var root = document.getElementById('klyna-popups-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'klyna-popups-root';
    document.body.appendChild(root);
  }

  var COOKIE_PREFIX = 'klyna_pu_';
  var VISITOR_COOKIE = 'klyna_visitor';
  var openPopupId = null;

  // ---- Cookie helpers -----------------------------------------------------

  function setCookie(name, value, days) {
    var expires = '';
    if (days) {
      var d = new Date();
      d.setTime(d.getTime() + days * 864e5);
      expires = '; expires=' + d.toUTCString();
    }
    document.cookie =
      name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Lax';
  }

  function getCookie(name) {
    var match = document.cookie.match(
      '(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'
    );
    return match ? decodeURIComponent(match[1]) : null;
  }

  // ---- Visitor classification (new vs returning) --------------------------

  var isReturning = !!getCookie(VISITOR_COOKIE);
  // Mark this browser as known for next time (1-year window).
  setCookie(VISITOR_COOKIE, '1', 365);

  function audienceMatches(audience) {
    if (audience === 'new') return !isReturning;
    if (audience === 'returning') return isReturning;
    return true;
  }

  // ---- Frequency cap ------------------------------------------------------

  function frequencyAllows(popup) {
    var key = COOKIE_PREFIX + popup.id;
    var seen = getCookie(key);
    var freq = popup.rules.frequency;

    if (freq === 'always') return true;
    if (freq === 'once') return !seen;
    if (freq === 'session') return !sessionSeen(popup.id);
    // 'days' — cookie presence within the window blocks re-display.
    return !seen;
  }

  function markShown(popup) {
    var key = COOKIE_PREFIX + popup.id;
    var freq = popup.rules.frequency;
    if (freq === 'once') {
      setCookie(key, '1', 3650);
    } else if (freq === 'days') {
      setCookie(key, '1', popup.rules.frequencyDays || BOOT.cookieDays || 7);
    } else if (freq === 'session') {
      markSessionSeen(popup.id);
    }
  }

  function sessionSeen(id) {
    try {
      return window.sessionStorage.getItem(COOKIE_PREFIX + id) === '1';
    } catch (e) {
      return false;
    }
  }

  function markSessionSeen(id) {
    try {
      window.sessionStorage.setItem(COOKIE_PREFIX + id, '1');
    } catch (e) {
      /* sessionStorage unavailable — degrade gracefully. */
    }
  }

  // ---- REST helpers -------------------------------------------------------

  function post(path, body) {
    return fetch(BOOT.restUrl + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': BOOT.nonce,
      },
      body: JSON.stringify(body),
    });
  }

  function recordImpression(popup) {
    post('/impression', { popup_id: popup.id }).catch(function () {});
  }

  // ---- Rendering ----------------------------------------------------------

  function buildPopup(popup) {
    var d = popup.design;

    var overlay = document.createElement('div');
    overlay.className =
      'klyna-pop klyna-pop-' + d.position + ' klyna-pop-theme-' + d.theme + ' klyna-anim-' + d.animation;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', d.headline || 'Subscribe');
    if (!d.showOverlay) {
      overlay.classList.add('klyna-pop-no-overlay');
    }

    var modal = document.createElement('div');
    modal.className = 'klyna-pop-modal';
    modal.style.maxWidth = (parseInt(d.width, 10) || 460) + 'px';

    if (d.imageUrl) {
      var img = document.createElement('img');
      img.className = 'klyna-pop-image';
      img.src = d.imageUrl;
      img.alt = '';
      modal.appendChild(img);
    }

    if (d.showClose) {
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'klyna-pop-close';
      close.setAttribute('aria-label', 'Close');
      close.innerHTML = '&times;';
      close.addEventListener('click', function () {
        dismiss(overlay);
      });
      modal.appendChild(close);
    }

    var content = document.createElement('div');
    content.className = 'klyna-pop-content';

    if (d.headline) {
      var h = document.createElement('h2');
      h.className = 'klyna-pop-headline';
      h.textContent = d.headline;
      content.appendChild(h);
    }
    if (d.subhead) {
      var sub = document.createElement('p');
      sub.className = 'klyna-pop-subhead';
      sub.textContent = d.subhead;
      content.appendChild(sub);
    }

    // Optional rich body from the post editor (already sanitized server-side).
    if (popup.body && popup.body.trim()) {
      var body = document.createElement('div');
      body.className = 'klyna-pop-body';
      body.innerHTML = popup.body;
      content.appendChild(body);
    }

    content.appendChild(buildForm(popup, overlay));
    modal.appendChild(content);
    overlay.appendChild(modal);

    // Dismiss on overlay click (outside the modal) and Escape.
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        dismiss(overlay);
      }
    });

    return overlay;
  }

  function buildForm(popup, overlay) {
    var d = popup.design;
    var form = document.createElement('form');
    form.className = 'klyna-pop-form';
    form.noValidate = true;

    if (d.collectName) {
      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.name = 'name';
      nameInput.className = 'klyna-pop-input';
      nameInput.placeholder = 'Your name';
      nameInput.autocomplete = 'name';
      form.appendChild(nameInput);
    }

    var emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.name = 'email';
    emailInput.required = true;
    emailInput.className = 'klyna-pop-input';
    emailInput.placeholder = 'you@example.com';
    emailInput.autocomplete = 'email';
    form.appendChild(emailInput);

    var button = document.createElement('button');
    button.type = 'submit';
    button.className = 'klyna-pop-button';
    button.textContent = d.buttonLabel || 'Subscribe';
    form.appendChild(button);

    var feedback = document.createElement('p');
    feedback.className = 'klyna-pop-feedback';
    feedback.setAttribute('role', 'status');
    form.appendChild(feedback);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = emailInput.value.trim();
      if (!email || email.indexOf('@') === -1) {
        feedback.textContent = 'Please enter a valid email address.';
        feedback.className = 'klyna-pop-feedback is-error';
        return;
      }
      button.disabled = true;
      button.textContent = '…';
      var payload = {
        popup_id: popup.id,
        email: email,
        page_url: window.location.href,
      };
      if (d.collectName) {
        var nameField = form.querySelector('input[name="name"]');
        if (nameField) {
          payload.name = nameField.value.trim();
        }
      }

      post('/capture', payload)
        .then(function (res) {
          return res.json().then(function (json) {
            return { ok: res.ok, json: json };
          });
        })
        .then(function (r) {
          if (r.ok && r.json && r.json.ok) {
            form.classList.add('is-done');
            feedback.textContent = r.json.message || 'Thanks!';
            feedback.className = 'klyna-pop-feedback is-success';
            setTimeout(function () {
              dismiss(overlay);
            }, 1800);
          } else {
            feedback.textContent =
              (r.json && r.json.message) || 'Something went wrong. Please try again.';
            feedback.className = 'klyna-pop-feedback is-error';
            button.disabled = false;
            button.textContent = d.buttonLabel || 'Subscribe';
          }
        })
        .catch(function () {
          feedback.textContent = 'Network error. Please try again.';
          feedback.className = 'klyna-pop-feedback is-error';
          button.disabled = false;
          button.textContent = d.buttonLabel || 'Subscribe';
        });
    });

    return form;
  }

  function show(popup) {
    if (openPopupId !== null) {
      return; // One popup on screen at a time.
    }
    openPopupId = popup.id;
    var el = buildPopup(popup);
    root.appendChild(el);
    // Force a reflow so the enter animation plays.
    void el.offsetWidth;
    el.classList.add('is-open');
    document.addEventListener('keydown', escClose);
    markShown(popup);
    recordImpression(popup);

    // Focus the first field for accessibility.
    var firstInput = el.querySelector('.klyna-pop-input');
    if (firstInput) {
      firstInput.focus();
    }
  }

  function dismiss(el) {
    el.classList.remove('is-open');
    document.removeEventListener('keydown', escClose);
    openPopupId = null;
    setTimeout(function () {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 260);
  }

  function escClose(e) {
    if (e.key === 'Escape') {
      var open = root.querySelector('.klyna-pop.is-open');
      if (open) {
        dismiss(open);
      }
    }
  }

  // ---- Triggers -----------------------------------------------------------

  function arm(popup) {
    var t = popup.trigger;
    if (t.type === 'time') {
      setTimeout(function () {
        show(popup);
      }, Math.max(0, t.seconds * 1000));
    } else if (t.type === 'scroll') {
      armScroll(popup, t.scroll);
    } else if (t.type === 'exit') {
      armExit(popup);
    } else if (t.type === 'click') {
      armClick(popup, t.selector);
    }
  }

  function armScroll(popup, threshold) {
    var fired = false;
    function onScroll() {
      if (fired) return;
      var doc = document.documentElement;
      var scrolled = (doc.scrollTop + window.innerHeight) / (doc.scrollHeight || 1);
      if (scrolled * 100 >= threshold) {
        fired = true;
        window.removeEventListener('scroll', onScroll);
        show(popup);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function armExit(popup) {
    var fired = false;
    function onLeave(e) {
      if (fired) return;
      // Pointer leaving through the top of the viewport = likely exit.
      if (e.clientY <= 0) {
        fired = true;
        document.removeEventListener('mouseout', onLeave);
        show(popup);
      }
    }
    document.addEventListener('mouseout', onLeave);
  }

  function armClick(popup, selector) {
    if (!selector) return;
    document.addEventListener('click', function (e) {
      var target = e.target;
      while (target && target !== document) {
        if (target.matches && target.matches(selector)) {
          e.preventDefault();
          show(popup);
          return;
        }
        target = target.parentNode;
      }
    });
  }

  // ---- Boot ---------------------------------------------------------------

  BOOT.popups.forEach(function (popup) {
    if (!audienceMatches(popup.rules.audience)) {
      return;
    }
    if (!frequencyAllows(popup)) {
      return;
    }
    arm(popup);
  });
})();
