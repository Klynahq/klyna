/* Klyna Redirects — minimal admin JS */
(function () {
  'use strict';

  // Confirm on delete forms that don't have onclick already
  document.querySelectorAll('.klyna-link-danger').forEach(function (btn) {
    if (!btn.dataset.confirmed) {
      btn.dataset.confirmed = '1';
    }
  });
})();
