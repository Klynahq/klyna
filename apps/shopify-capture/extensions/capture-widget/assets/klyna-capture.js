/*
 * Klyna Capture — storefront runtime.
 *
 * Loaded by the theme app embed. Fetches active campaigns from the app over the
 * signed App Proxy, evaluates each popup's targeting + trigger, then renders the
 * matching popup (email / SMS / email+SMS / spin-to-win). On opt-in it posts to
 * the capture endpoint, reveals the discount code, and logs analytics events.
 *
 * No dependencies. ~10kb. Respects a per-visitor re-show cooldown via
 * localStorage so the same person isn't nagged on every visit.
 */
(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-klyna-capture]');
  if (!script) return;

  var PROXY = (script.getAttribute('data-proxy-base') || '/apps/klyna-capture').replace(/\/$/, '');
  var PAGE_TYPE = script.getAttribute('data-page-type') || '';
  var AUDIENCE = script.getAttribute('data-customer') === 'returning' ? 'returning' : 'new';
  var POSITION = script.getAttribute('data-position') || 'center';
  var RESPECT_FREQ = script.getAttribute('data-respect-frequency') !== 'false';

  var STORAGE_PREFIX = 'klyna_capture_';
  var DEVICE = window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop';

  // ---- helpers -----------------------------------------------------------

  function storeKey(id) {
    return STORAGE_PREFIX + id;
  }

  function seenRecently(popup) {
    if (!RESPECT_FREQ || !popup.frequencyDays) return false;
    try {
      var raw = window.localStorage.getItem(storeKey(popup.id));
      if (!raw) return false;
      var last = parseInt(raw, 10);
      if (isNaN(last)) return false;
      var elapsedDays = (Date.now() - last) / 86400000;
      return elapsedDays < popup.frequencyDays;
    } catch (e) {
      return false;
    }
  }

  function markSeen(popup) {
    try {
      window.localStorage.setItem(storeKey(popup.id), String(Date.now()));
    } catch (e) {
      /* private mode — ignore */
    }
  }

  function pageMatches(target) {
    if (target === 'all') return true;
    if (target === 'home') return PAGE_TYPE === 'index';
    if (target === 'product') return PAGE_TYPE === 'product';
    if (target === 'collection') return PAGE_TYPE === 'collection' || PAGE_TYPE === 'list-collections';
    if (target === 'cart') return PAGE_TYPE === 'cart';
    return true;
  }

  function targetingMatches(popup) {
    if (!pageMatches(popup.targetPages)) return false;
    if (popup.targetDevice !== 'all' && popup.targetDevice !== DEVICE) return false;
    if (popup.targetAudience !== 'all' && popup.targetAudience !== AUDIENCE) return false;
    return true;
  }

  function post(path, data) {
    var body = new URLSearchParams();
    Object.keys(data).forEach(function (k) {
      if (data[k] !== undefined && data[k] !== null) body.append(k, data[k]);
    });
    return fetch(PROXY + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).then(function (r) {
      return r.json();
    });
  }

  function logEvent(popup, type) {
    post('/event', { type: type, popupId: popup.id, device: DEVICE, pageUrl: location.pathname }).catch(
      function () {},
    );
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'style') node.setAttribute('style', attrs[k]);
        else if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Weighted random pick for the spin-to-win wheel.
  function pickSegment(wheel) {
    var total = wheel.reduce(function (s, seg) {
      return s + Math.max(0, seg.weight || 0);
    }, 0);
    if (total <= 0) return wheel[0];
    var roll = Math.random() * total;
    for (var i = 0; i < wheel.length; i++) {
      roll -= Math.max(0, wheel[i].weight || 0);
      if (roll <= 0) return wheel[i];
    }
    return wheel[wheel.length - 1];
  }

  // ---- rendering ---------------------------------------------------------

  var openPopupId = null;

  function render(popup) {
    if (openPopupId) return; // one at a time
    openPopupId = popup.id;

    var accent = popup.accentColor || '#7c5cff';
    var overlay = el('div', { class: 'klyna-cap-overlay', 'data-position': POSITION });
    var card = el('div', { class: 'klyna-cap-card', role: 'dialog', 'aria-modal': 'true' });
    overlay.style.setProperty('--klyna-accent', accent);

    function close(logDismiss) {
      if (logDismiss) logEvent(popup, 'dismiss');
      overlay.classList.add('klyna-cap-closing');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        openPopupId = null;
      }, 180);
    }

    var closeBtn = el('button', { class: 'klyna-cap-close', 'aria-label': 'Close', type: 'button' }, ['×']);
    closeBtn.addEventListener('click', function () {
      markSeen(popup);
      close(true);
    });
    card.appendChild(closeBtn);

    var isSpin = popup.format === 'spin_to_win';
    var collectsEmail = popup.format === 'email' || popup.format === 'email_sms' || isSpin;
    var collectsPhone = popup.format === 'sms' || popup.format === 'email_sms';

    card.appendChild(el('h2', { class: 'klyna-cap-headline' }, [popup.headline || '']));
    if (popup.body) card.appendChild(el('p', { class: 'klyna-cap-body' }, [popup.body]));

    var wheelEl = null;
    var wonSegment = null;
    if (isSpin && popup.wheel && popup.wheel.length) {
      wheelEl = el('div', { class: 'klyna-cap-wheel' });
      wheelEl.style.background = conicGradient(popup.wheel);
      card.appendChild(wheelEl);
    }

    var form = el('form', { class: 'klyna-cap-form', novalidate: 'novalidate' });
    var emailInput = null;
    var phoneInput = null;

    if (collectsEmail) {
      emailInput = el('input', {
        type: 'email',
        name: 'email',
        placeholder: 'you@email.com',
        autocomplete: 'email',
        required: 'required',
      });
      form.appendChild(emailInput);
    }
    if (collectsPhone) {
      phoneInput = el('input', {
        type: 'tel',
        name: 'phone',
        placeholder: '+1 555 000 0000',
        autocomplete: 'tel',
      });
      form.appendChild(phoneInput);
    }

    var submitBtn = el('button', { type: 'submit', class: 'klyna-cap-submit' }, [
      isSpin ? 'Spin to win' : popup.buttonLabel || 'Subscribe',
    ]);
    form.appendChild(submitBtn);

    var msg = el('p', { class: 'klyna-cap-msg' });
    form.appendChild(msg);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = emailInput ? emailInput.value.trim() : '';
      var phone = phoneInput ? phoneInput.value.trim() : '';

      if (collectsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.textContent = 'Please enter a valid email.';
        msg.className = 'klyna-cap-msg klyna-cap-msg--err';
        return;
      }
      if (popup.format === 'sms' && !/^\+?[0-9]{7,15}$/.test(phone.replace(/[\s()-]/g, ''))) {
        msg.textContent = 'Please enter a valid phone number.';
        msg.className = 'klyna-cap-msg klyna-cap-msg--err';
        return;
      }

      submitBtn.disabled = true;

      // Spin first (visual), then submit.
      var proceed = function () {
        post('/capture', {
          popupId: popup.id,
          email: email,
          phone: phone,
          emailConsent: collectsEmail ? 'true' : 'false',
          smsConsent: collectsPhone ? 'true' : 'false',
          pageUrl: location.pathname,
          device: DEVICE,
          audience: AUDIENCE,
          wonCode: wonSegment ? wonSegment.discountCode : '',
          wonLabel: wonSegment ? wonSegment.label : '',
        })
          .then(function (res) {
            if (!res || !res.ok) {
              msg.textContent = (res && res.error) || 'Something went wrong. Try again.';
              msg.className = 'klyna-cap-msg klyna-cap-msg--err';
              submitBtn.disabled = false;
              return;
            }
            markSeen(popup);
            showSuccess(card, form, popup, res, accent);
          })
          .catch(function () {
            msg.textContent = 'Network error. Please try again.';
            msg.className = 'klyna-cap-msg klyna-cap-msg--err';
            submitBtn.disabled = false;
          });
      };

      if (isSpin && wheelEl) {
        wonSegment = pickSegment(popup.wheel);
        spin(wheelEl, popup.wheel, wonSegment, proceed);
      } else {
        proceed();
      }
    });

    card.appendChild(form);
    card.appendChild(
      el('p', { class: 'klyna-cap-fine' }, ['By subscribing you agree to receive marketing messages.']),
    );

    overlay.appendChild(card);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        markSeen(popup);
        close(true);
      }
    });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape' && openPopupId === popup.id) {
        markSeen(popup);
        close(true);
        document.removeEventListener('keydown', escHandler);
      }
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      overlay.classList.add('klyna-cap-open');
    });
    logEvent(popup, 'impression');
  }

  function showSuccess(card, form, popup, res, accent) {
    form.style.display = 'none';
    var wrap = el('div', { class: 'klyna-cap-success' });
    wrap.appendChild(el('div', { class: 'klyna-cap-check', style: 'color:' + accent }, ['✓']));
    wrap.appendChild(el('p', { class: 'klyna-cap-success-msg' }, [res.message || popup.successMessage || 'You\'re in!']));
    if (res.prizeLabel) {
      wrap.appendChild(el('p', { class: 'klyna-cap-prize' }, ['You won: ' + res.prizeLabel]));
    }
    if (res.code) {
      var codeBox = el('button', { type: 'button', class: 'klyna-cap-code', title: 'Copy code' }, [res.code]);
      codeBox.addEventListener('click', function () {
        try {
          navigator.clipboard.writeText(res.code);
          codeBox.textContent = 'Copied!';
          setTimeout(function () {
            codeBox.textContent = res.code;
          }, 1500);
        } catch (e) {
          /* ignore */
        }
      });
      wrap.appendChild(codeBox);
    }
    card.appendChild(wrap);
  }

  function conicGradient(wheel) {
    var total = wheel.reduce(function (s, seg) {
      return s + Math.max(0, seg.weight || 0);
    }, 0) || 1;
    var acc = 0;
    var stops = wheel.map(function (seg) {
      var start = (acc / total) * 360;
      acc += Math.max(0, seg.weight || 0);
      var end = (acc / total) * 360;
      return (seg.color || '#7c5cff') + ' ' + start + 'deg ' + end + 'deg';
    });
    return 'conic-gradient(' + stops.join(', ') + ')';
  }

  function spin(wheelEl, wheel, won, done) {
    var total = wheel.reduce(function (s, seg) {
      return s + Math.max(0, seg.weight || 0);
    }, 0) || 1;
    // Find the center angle of the winning segment.
    var acc = 0;
    var centerDeg = 0;
    for (var i = 0; i < wheel.length; i++) {
      var w = Math.max(0, wheel[i].weight || 0);
      if (wheel[i] === won) {
        centerDeg = ((acc + w / 2) / total) * 360;
        break;
      }
      acc += w;
    }
    var spins = 5 * 360;
    var finalRotation = spins + (360 - centerDeg);
    wheelEl.style.transition = 'transform 3.2s cubic-bezier(0.16, 1, 0.3, 1)';
    wheelEl.style.transform = 'rotate(' + finalRotation + 'deg)';
    setTimeout(done, 3300);
  }

  // ---- trigger wiring ----------------------------------------------------

  function arm(popup) {
    if (seenRecently(popup) || !targetingMatches(popup)) return;
    var fired = false;
    var fire = function () {
      if (fired || openPopupId) return;
      fired = true;
      cleanup();
      render(popup);
    };
    var cleanup = function () {};

    if (popup.trigger === 'time') {
      var t = setTimeout(fire, Math.max(0, popup.triggerSeconds || 0) * 1000);
      cleanup = function () {
        clearTimeout(t);
      };
    } else if (popup.trigger === 'scroll') {
      var onScroll = function () {
        var doc = document.documentElement;
        var scrolled = (doc.scrollTop || document.body.scrollTop);
        var height = doc.scrollHeight - doc.clientHeight;
        var pct = height > 0 ? (scrolled / height) * 100 : 0;
        if (pct >= (popup.triggerScroll || 40)) fire();
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      cleanup = function () {
        window.removeEventListener('scroll', onScroll);
      };
    } else if (popup.trigger === 'exit_intent') {
      if (DEVICE === 'mobile') {
        // Mobile: fast upward scroll near the top acts as exit intent.
        var lastY = window.scrollY;
        var onMove = function () {
          if (window.scrollY < lastY - 40 && window.scrollY < 150) fire();
          lastY = window.scrollY;
        };
        window.addEventListener('scroll', onMove, { passive: true });
        cleanup = function () {
          window.removeEventListener('scroll', onMove);
        };
      } else {
        var onLeave = function (e) {
          if (e.clientY <= 0) fire();
        };
        document.addEventListener('mouseout', onLeave);
        cleanup = function () {
          document.removeEventListener('mouseout', onLeave);
        };
      }
    }
  }

  // ---- boot --------------------------------------------------------------

  function boot() {
    fetch(PROXY + '/config', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.ok ? r.json() : { popups: [] };
      })
      .then(function (data) {
        var popups = (data && data.popups) || [];
        // Arm only the first eligible popup to avoid stacking modals.
        for (var i = 0; i < popups.length; i++) {
          var p = popups[i];
          if (!seenRecently(p) && targetingMatches(p)) {
            arm(p);
            break;
          }
        }
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
