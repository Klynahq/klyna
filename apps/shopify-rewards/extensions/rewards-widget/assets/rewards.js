/* Klyna Rewards — storefront widget runtime.
 *
 * Fetches the shopper's loyalty state from the app proxy and renders it into
 * the block. No framework, no dependencies — keeps the theme payload tiny.
 * Each block instance is initialised independently so a theme can place more
 * than one (e.g. header + account page).
 */
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString();
  }

  function render(root, data) {
    var body = root.querySelector('[data-klyna="body"]');
    var titleEl = root.querySelector('[data-klyna="title"]');
    if (!body) return;

    var program = data.program || {};
    if (titleEl && program.programName) {
      titleEl.textContent = root.getAttribute('data-heading') || program.programName;
    }

    if (program.active === false) {
      body.innerHTML = '<p class="klyna-rewards__loading">The rewards program is paused. Check back soon.</p>';
      return;
    }

    // Not logged in, or not yet a member: show the value proposition + sign-in CTA.
    if (!data.enrolled) {
      var perks = (program.tiers || [])
        .map(function (t) {
          return '<li>' + esc(t.name) + ' — ' + esc(t.perkText || (t.threshold + '+ pts')) + '</li>';
        })
        .join('');
      var loggedIn = root.getAttribute('data-logged-in') === 'true';
      body.innerHTML =
        '<p class="klyna-rewards__hint">Earn <strong>' +
        fmt(program.pointsPerDollar) +
        '</strong> point' +
        (program.pointsPerDollar === 1 ? '' : 's') +
        ' for every ' +
        esc(program.currencyCode) +
        ' spent, <strong>' +
        fmt(program.pointsPerSignup) +
        '</strong> for signing up, and <strong>' +
        fmt(program.pointsPerReferral) +
        '</strong> per referral. Redeem <strong>' +
        fmt(program.redeemPoints) +
        '</strong> points for ' +
        esc(program.currencyCode) +
        ' ' +
        fmt(program.redeemValue) +
        ' off.</p>' +
        (perks ? '<ul class="klyna-rewards__perks">' + perks + '</ul>' : '') +
        (loggedIn
          ? ''
          : '<a class="klyna-rewards__cta" href="/account/register">Create an account to start earning →</a>');
      return;
    }

    var m = data.member || {};
    var next = m.nextTier;
    var pct = 100;
    var hint = "You're at the top tier — keep earning!";
    if (next && next.threshold > 0) {
      pct = Math.max(0, Math.min(100, Math.round((m.lifetime / next.threshold) * 100)));
      hint = fmt(next.remaining) + ' more lifetime points to reach ' + esc(next.name) + '.';
    }

    var redeemBlock = '';
    if (m.redeemable > 0) {
      redeemBlock =
        '<div class="klyna-rewards__redeem">You can redeem <strong>' +
        fmt(m.redeemable) +
        '</strong> reward' +
        (m.redeemable === 1 ? '' : 's') +
        ' worth ' +
        esc(program.currencyCode) +
        ' ' +
        fmt(m.redeemable * program.redeemValue) +
        ' off. Ask at checkout or your account page.</div>';
    } else {
      var need = program.redeemPoints - (m.balance % program.redeemPoints);
      redeemBlock =
        '<div class="klyna-rewards__redeem">Earn <strong>' +
        fmt(need) +
        '</strong> more points to unlock ' +
        esc(program.currencyCode) +
        ' ' +
        fmt(program.redeemValue) +
        ' off.</div>';
    }

    var shopUrl = root.getAttribute('data-shop-url') || '';
    var referralUrl = shopUrl + '/?ref=' + encodeURIComponent(m.referralCode);

    body.innerHTML =
      '<div class="klyna-rewards__balance">' +
      '<span class="klyna-rewards__points">' +
      fmt(m.balance) +
      '</span>' +
      '<span class="klyna-rewards__points-label">points available</span>' +
      '</div>' +
      (m.tier
        ? '<div class="klyna-rewards__tier"><span class="klyna-rewards__tier-dot"></span>' +
          esc(m.tier) +
          ' member</div>'
        : '') +
      '<div class="klyna-rewards__progress"><div class="klyna-rewards__progress-bar" style="width:' +
      pct +
      '%"></div></div>' +
      '<p class="klyna-rewards__hint">' +
      hint +
      '</p>' +
      redeemBlock +
      '<p class="klyna-rewards__refer-label">Share your link — give ' +
      fmt(program.refereeDiscountPct) +
      '% off, get ' +
      fmt(program.pointsPerReferral) +
      ' points per referral:</p>' +
      '<div class="klyna-rewards__refer">' +
      '<input type="text" readonly value="' +
      esc(referralUrl) +
      '" data-klyna="referral" />' +
      '<button type="button" class="klyna-rewards__btn" data-klyna="copy">Copy</button>' +
      '</div>';

    var copyBtn = body.querySelector('[data-klyna="copy"]');
    var input = body.querySelector('[data-klyna="referral"]');
    if (copyBtn && input) {
      copyBtn.addEventListener('click', function () {
        input.select();
        var done = function () {
          copyBtn.textContent = 'Copied!';
          setTimeout(function () {
            copyBtn.textContent = 'Copy';
          }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(input.value).then(done, function () {
            document.execCommand('copy');
            done();
          });
        } else {
          document.execCommand('copy');
          done();
        }
      });
    }
  }

  function init(root) {
    var proxy = root.getAttribute('data-proxy');
    var customerId = root.getAttribute('data-customer-id');
    var url = proxy + (customerId ? '?logged_in_customer_id=' + encodeURIComponent(customerId) : '');

    fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        render(root, data);
      })
      .catch(function () {
        var body = root.querySelector('[data-klyna="body"]');
        if (body) {
          body.innerHTML =
            '<p class="klyna-rewards__loading">Rewards are temporarily unavailable. Please try again later.</p>';
        }
      });
  }

  function boot() {
    var nodes = document.querySelectorAll('.klyna-rewards');
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].__klynaInit) {
        nodes[i].__klynaInit = true;
        init(nodes[i]);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Re-init when merchants edit the block in the theme editor.
  document.addEventListener('shopify:section:load', boot);
})();
