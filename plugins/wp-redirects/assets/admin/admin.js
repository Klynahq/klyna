/* Klyna Redirects — admin JS (AI suggest + test connection) */
(function () {
  'use strict';

  var boot = window.klynaRedirectsBoot || { restUrl: '', nonce: '' };

  function post(path, body) {
    return fetch(boot.restUrl + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': boot.nonce,
      },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().then(function (j) {
        return { status: r.status, json: j };
      });
    });
  }

  // Suggest target buttons on the 404 monitor.
  document.querySelectorAll('.klyna-suggest-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var form = btn.closest('.klyna-404-row');
      if (!form) {
        return;
      }
      var url = form.getAttribute('data-url') || '';
      var dest = form.querySelector('.klyna-destination');
      var status = form.querySelector('.klyna-suggest-status');
      if (!dest || !url) {
        return;
      }
      btn.disabled = true;
      var prevLabel = btn.textContent;
      btn.textContent = 'Thinking...';
      if (status) {
        status.textContent = '';
      }

      post('ai/suggest', { url: url })
        .then(function (res) {
          var j = res.json || {};
          if (j.ok && !j.none && j.text) {
            dest.value = j.text;
            if (status) {
              status.textContent = j.cached ? '(cached)' : '';
            }
          } else if (j.none) {
            if (status) {
              status.textContent = 'No close match. Pick one manually.';
            }
          } else {
            if (status) {
              status.textContent = (j.reason || 'error') + ': ' + (j.text || '');
            }
          }
        })
        .catch(function (e) {
          if (status) {
            status.textContent = 'Request failed: ' + e.message;
          }
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = prevLabel;
        });
    });
  });

  // Test connection on the settings page.
  var testBtn = document.getElementById('klyna-ai-test');
  if (testBtn) {
    testBtn.addEventListener('click', function () {
      var status = document.getElementById('klyna-ai-test-status');
      testBtn.disabled = true;
      if (status) {
        status.textContent = 'Testing...';
      }
      post('ai/test', {})
        .then(function (res) {
          var j = res.json || {};
          if (j.ok) {
            if (status) {
              status.textContent = 'OK: ' + (j.text || '').slice(0, 80);
            }
          } else {
            if (status) {
              status.textContent = 'Failed: ' + (j.reason || '') + ' ' + (j.text || '');
            }
          }
        })
        .catch(function (e) {
          if (status) {
            status.textContent = 'Request failed: ' + e.message;
          }
        })
        .then(function () {
          testBtn.disabled = false;
        });
    });
  }
})();
