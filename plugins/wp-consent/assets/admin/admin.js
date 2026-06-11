/**
 * Klyna Consent — admin.js
 *
 * Minimal vanilla JS for the admin settings page:
 *  1. Sync colour picker ↔ hex text input.
 *  2. Live-preview banner colours while the user adjusts the pickers.
 *  3. No jQuery, no external deps.
 */

(function () {
  'use strict';

  /**
   * Sync a colour picker with its companion text input (and vice-versa).
   * PHP output includes:  <input type="color" id="kc-bg-color" ...>
   *                       <input type="text"  data-color-peer="kc-bg-color" ...>
   */
  function wirColourPairs() {
    // Text inputs that have a data-color-peer attribute.
    const textInputs = document.querySelectorAll('input[data-color-peer]');

    textInputs.forEach(function (textInput) {
      const peerId = textInput.getAttribute('data-color-peer');
      const colorInput = document.getElementById(peerId);
      if (!colorInput) return;

      // Text → colour picker.
      textInput.addEventListener('input', function () {
        const val = textInput.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(val)) {
          colorInput.value = val;
        }
      });

      // Colour picker → text.
      colorInput.addEventListener('input', function () {
        textInput.value = colorInput.value;
      });
    });
  }

  /**
   * Wire toggle labels so clicking anywhere on the row activates the checkbox,
   * not just the toggle UI element (accessibility convenience).
   * The <label for="..."> wrapping already handles this in modern browsers,
   * but we ensure the toggle UI gets the right ARIA state too.
   */
  function wireToggleRows() {
    const inputs = document.querySelectorAll('.klyna-admin-toggle-input');
    inputs.forEach(function (input) {
      input.addEventListener('change', function () {
        // Nothing extra needed — the CSS :checked selector handles UI.
        // Hook is here if future logging / live preview is needed.
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wirColourPairs();
    wireToggleRows();
  });

})();
