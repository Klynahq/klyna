/**
 * Klyna Reviews — admin moderation queue.
 *
 * No build step — vanilla JS that talks to the REST endpoints registered by
 * Rest::register_routes(). Renders the pending queue and wires the
 * approve / unapprove / delete actions through wp.apiFetch (which injects the
 * X-WP-Nonce header automatically).
 */
(function () {
	'use strict';

	var cfg = window.KLYNA_REVIEWS_ADMIN || {};
	var i18n = cfg.i18n || {};

	function ready(fn) {
		if (document.readyState !== 'loading') {
			fn();
		} else {
			document.addEventListener('DOMContentLoaded', fn);
		}
	}

	ready(function () {
		var root = document.getElementById('klyna-reviews-queue');
		if (!root || !window.wp || !window.wp.apiFetch) {
			return;
		}
		load(root);
	});

	function load(root) {
		root.innerHTML =
			'<p class="klyna-reviews-queue__loading">' +
			esc(i18n.loading || 'Loading…') +
			'</p>';

		window.wp
			.apiFetch({ path: '/klyna-reviews/v1/moderation?page=1' })
			.then(function (res) {
				render(root, res && res.items ? res.items : []);
			})
			.catch(function () {
				root.innerHTML =
					'<p class="klyna-reviews-queue__empty">' +
					esc(i18n.error || 'Could not load the queue.') +
					'</p>';
			});
	}

	function render(root, items) {
		if (!items.length) {
			root.innerHTML =
				'<p class="klyna-reviews-queue__empty">' +
				esc(i18n.empty || 'Nothing waiting for moderation.') +
				'</p>';
			return;
		}

		root.innerHTML = '';
		items.forEach(function (item) {
			root.appendChild(card(item));
		});
	}

	function card(item) {
		var el = document.createElement('div');
		el.className = 'klyna-reviews-queue__item';
		el.dataset.id = item.id;

		var head = document.createElement('div');
		head.className = 'klyna-reviews-queue__head';

		var stars = document.createElement('span');
		stars.className = 'klyna-reviews-queue__stars';
		stars.setAttribute('aria-label', item.rating + ' / 5');
		stars.textContent = renderStars(item.rating);
		head.appendChild(stars);

		if (item.title) {
			var title = document.createElement('span');
			title.className = 'klyna-reviews-queue__title';
			title.textContent = item.title;
			head.appendChild(title);
		}

		var target = document.createElement('span');
		target.className = 'klyna-reviews-queue__target';
		target.textContent = item.target || 'site';
		head.appendChild(target);

		el.appendChild(head);

		var body = document.createElement('p');
		body.className = 'klyna-reviews-queue__body';
		body.textContent = item.body || '';
		el.appendChild(body);

		var meta = document.createElement('p');
		meta.className = 'klyna-reviews-queue__meta';
		var who = document.createElement('strong');
		who.textContent = item.author || '';
		meta.appendChild(who);
		if (item.email) {
			meta.appendChild(document.createTextNode(' · '));
			var mail = document.createElement('a');
			mail.href = 'mailto:' + item.email;
			mail.textContent = item.email;
			meta.appendChild(mail);
		}
		meta.appendChild(document.createTextNode(' · ' + formatDate(item.date)));
		el.appendChild(meta);

		var actions = document.createElement('div');
		actions.className = 'klyna-reviews-queue__actions';
		actions.appendChild(
			button(i18n.approve || 'Approve', 'approve', 'approve', item.id, el)
		);
		actions.appendChild(
			button(i18n.delete || 'Delete', 'delete', 'delete', item.id, el)
		);
		el.appendChild(actions);

		return el;
	}

	function button(label, variant, action, id, card) {
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'klyna-reviews-btn klyna-reviews-btn--' + variant;
		btn.textContent = label;
		btn.addEventListener('click', function () {
			if (action === 'delete' && i18n.confirm && !window.confirm(i18n.confirm)) {
				return;
			}
			moderate(id, action, card, btn);
		});
		return btn;
	}

	function moderate(id, action, card, btn) {
		var buttons = card.querySelectorAll('button');
		Array.prototype.forEach.call(buttons, function (b) {
			b.disabled = true;
		});

		window.wp
			.apiFetch({
				path: '/klyna-reviews/v1/moderation/' + encodeURIComponent(id),
				method: 'POST',
				data: { action: action }
			})
			.then(function () {
				card.style.transition = 'opacity 0.2s ease';
				card.style.opacity = '0';
				setTimeout(function () {
					var root = card.parentNode;
					card.remove();
					if (root && !root.querySelector('.klyna-reviews-queue__item')) {
						root.innerHTML =
							'<p class="klyna-reviews-queue__empty">' +
							esc(i18n.empty || 'Nothing waiting for moderation.') +
							'</p>';
					}
				}, 200);
			})
			.catch(function () {
				Array.prototype.forEach.call(buttons, function (b) {
					b.disabled = false;
				});
				window.alert(i18n.error || 'Something went wrong.');
			});
	}

	function renderStars(rating) {
		var n = Math.max(0, Math.min(5, parseInt(rating, 10) || 0));
		var out = '';
		for (var i = 0; i < 5; i++) {
			out += i < n ? '★' : '☆';
		}
		return out;
	}

	function formatDate(iso) {
		if (!iso) {
			return '';
		}
		var d = new Date(iso);
		if (isNaN(d.getTime())) {
			return iso;
		}
		return d.toLocaleDateString();
	}

	function esc(str) {
		var div = document.createElement('div');
		div.textContent = String(str);
		return div.innerHTML;
	}
})();
