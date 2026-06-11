/**
 * Klyna Popups admin glue.
 *
 * No build step — vanilla JS that lives next to the plugin. Two jobs:
 *  1. On the popup editor, show only the trigger fields relevant to the chosen
 *     trigger type (and the frequency-days field only for the "days" cap).
 *  2. Nothing network-bound is required for the static pages, but we keep the
 *     REST config injected by PHP available for future enhancements.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    bindTriggerToggle();
    bindFrequencyToggle();
  });

  /**
   * Show only the trigger config row that matches the selected trigger type.
   */
  function bindTriggerToggle() {
    var select = document.querySelector('select[name="klyna_config[trigger]"]');
    var fields = document.querySelectorAll('.klyna-trigger-field');
    if (!select || !fields.length) return;

    function sync() {
      var value = select.value;
      fields.forEach(function (field) {
        field.style.display = field.getAttribute('data-when') === value ? '' : 'none';
      });
    }

    select.addEventListener('change', sync);
    sync();
  }

  /**
   * Show the "days" input only when the frequency cap is "once every N days".
   */
  function bindFrequencyToggle() {
    var select = document.querySelector('select[name="klyna_config[frequency]"]');
    var days = document.querySelector('.klyna-freq-days');
    if (!select || !days) return;

    function sync() {
      days.style.display = select.value === 'days' ? '' : 'none';
    }

    select.addEventListener('change', sync);
    sync();
  }
})();
