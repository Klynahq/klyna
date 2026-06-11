/**
 * Klyna Reviews — front-end form handler.
 *
 * No build step, no jQuery. Posts the review form to the REST endpoint with a
 * nonce header, surfaces validation/errors inline, and (when the review is
 * auto-approved) drops it into the list without a reload.
 */
(function () {
	'use strict';

	var cfg = window.KLYNA_REVIEWS || {};
	var i18n = cfg.i18n || {};

	function ready(fn) {
		if (document.readyState !== 'loading') {
			fn();
		} else {
			document.addEventListener('DOMContentLoaded', fn);
		}
	}

	ready(function () {
		var forms = document.querySelectorAll('.klyna-reviews__form');
		Array.prototype.forEach.call(forms, bindForm);
		prefillTargetFromUrl();
	});

	/**
	 * If the visitor arrived from a request email (?klyna_review_target=…),
	 * scroll the matching form into view so they land on the right one.
	 */
	function prefillTargetFromUrl() {
		var params = new URLSearchParams(window.location.search);
		var target = params.get('klyna_review_target');
		if (!target) {
			return;
		}
		var form = document.querySelector(
			'.klyna-reviews__form[data-target="' + cssEscape(target) + '"]'
		);
		if (form) {
			form.scrollIntoView({ behavior: 'smooth', block: 'center' });
			var name = form.querySelector('input[name="author"]');
			if (name) {
				name.focus();
			}
		}
	}

	function bindForm(form) {
		form.addEventListener('submit', function (event) {
			event.preventDefault();
			submit(form);
		});
	}

	function submit(form) {
		var button = form.querySelector('.klyna-reviews__submit');
		var notice = form.querySelector('.klyna-reviews__notice');
		var data = collect(form);

		// Client-side guard: rating is required.
		if (!data.rating) {
			setNotice(notice, i18n.error || 'Please choose a rating.', 'error');
			return;
		}

		setBusy(button, true);
		setNotice(notice, '', '');

		fetch(cfg.restUrl, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': cfg.nonce
			},
			body: JSON.stringify(data)
		})
			.then(function (res) {
				return res.json().then(function (json) {
					return { ok: res.ok, body: json };
				});
			})
			.then(function (result) {
				var body = result.body || {};
				if (result.ok && body.ok) {
					form.reset();
					setNotice(notice, body.message || '', 'success');
				} else {
					setNotice(
						notice,
						body.message || i18n.error || 'Something went wrong.',
						'error'
					);
				}
			})
			.catch(function () {
				setNotice(notice, i18n.error || 'Something went wrong.', 'error');
			})
			.finally(function () {
				setBusy(button, false);
			});
	}

	function collect(form) {
		return {
			author: value(form, 'author'),
			email: value(form, 'email'),
			title: value(form, 'title'),
			body: value(form, 'body'),
			target: value(form, 'target') || 'site',
			rating: parseInt(value(form, 'rating'), 10) || 0,
			website: value(form, 'website'), // honeypot
			_wpnonce: value(form, '_wpnonce')
		};
	}

	function value(form, name) {
		var el = form.querySelector('[name="' + name + '"]');
		if (!el) {
			return '';
		}
		if (el.type === 'radio') {
			var checked = form.querySelector('[name="' + name + '"]:checked');
			return checked ? checked.value : '';
		}
		return el.value || '';
	}

	function setBusy(button, busy) {
		if (!button) {
			return;
		}
		button.disabled = busy;
		button.textContent = busy
			? i18n.submitting || 'Submitting…'
			: i18n.submit || 'Submit review';
	}

	function setNotice(el, message, type) {
		if (!el) {
			return;
		}
		el.textContent = message;
		el.className = 'klyna-reviews__notice' + (type ? ' is-' + type : '');
	}

	function cssEscape(str) {
		return String(str).replace(/["\\]/g, '\\$&');
	}
})();
