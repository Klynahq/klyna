/**
 * Klyna Booking — admin bookings list.
 *
 * Fetches bookings from wp-booking/v1/admin/bookings and renders them into the
 * dashboard table. Status changes (confirm / cancel) post back through REST
 * with the wp_rest nonce supplied by `apiFetch`. No jQuery.
 */
( function () {
	'use strict';

	var cfg = window.KlynaBooking || {};
	var i18n = cfg.i18n || {};
	var apiFetch = window.wp && window.wp.apiFetch;

	var root = document.querySelector( '[data-bookings-root]' );
	if ( ! root || ! apiFetch ) {
		return;
	}

	apiFetch.use( apiFetch.createNonceMiddleware( cfg.nonce ) );
	apiFetch.use( apiFetch.createRootURLMiddleware( cfg.apiBase + '/' ) );

	var state = { status: '', paged: 1, pages: 1 };

	var pager = document.querySelector( '[data-pager]' );
	var pagerInfo = document.querySelector( '[data-pager-info]' );

	function esc( value ) {
		var div = document.createElement( 'div' );
		div.textContent = value == null ? '' : String( value );
		return div.innerHTML;
	}

	function statusClass( slug ) {
		return 'klyna-tag klyna-tag--' + slug.replace( 'kb_', '' );
	}

	function render( items ) {
		if ( ! items.length ) {
			root.innerHTML = '<p class="klyna-muted">' + esc( i18n.noResults ) + '</p>';
			return;
		}

		var rows = items
			.map( function ( b ) {
				var actions = '';
				if ( b.status !== 'kb_confirmed' ) {
					actions +=
						'<button type="button" class="button button-primary klyna-act" data-id="' +
						b.id +
						'" data-action="confirmed">' +
						esc( i18n.confirm ) +
						'</button> ';
				}
				if ( b.status !== 'kb_cancelled' ) {
					actions +=
						'<button type="button" class="button klyna-act" data-id="' +
						b.id +
						'" data-action="cancelled">' +
						esc( i18n.cancel ) +
						'</button>';
				}

				var contact =
					esc( b.name ) +
					'<br><span class="klyna-muted">' +
					esc( b.email ) +
					( b.phone ? ' · ' + esc( b.phone ) : '' ) +
					'</span>';

				return (
					'<tr data-row="' +
					b.id +
					'">' +
					'<td>' + esc( b.when ) + '</td>' +
					'<td>' + esc( b.service_title ) + '</td>' +
					'<td>' + contact + '</td>' +
					'<td><span class="' +
					statusClass( b.status ) +
					'">' +
					esc( b.status_label ) +
					'</span></td>' +
					'<td class="klyna-actions">' + actions + '</td>' +
					'</tr>'
				);
			} )
			.join( '' );

		root.innerHTML =
			'<table class="klyna-table"><thead><tr>' +
			'<th>' + esc( wpHead( 'When' ) ) + '</th>' +
			'<th>' + esc( wpHead( 'Service' ) ) + '</th>' +
			'<th>' + esc( wpHead( 'Customer' ) ) + '</th>' +
			'<th>' + esc( wpHead( 'Status' ) ) + '</th>' +
			'<th></th>' +
			'</tr></thead><tbody>' +
			rows +
			'</tbody></table>';

		bindActions();
	}

	// Column headers fall back to English; localized strings live in i18n where
	// provided, but headers are short and safe to inline here.
	function wpHead( label ) {
		var map = {
			When: i18n.colWhen,
			Service: i18n.colService,
			Customer: i18n.colCustomer,
			Status: i18n.colStatus,
		};
		return map[ label ] || label;
	}

	function bindActions() {
		root.querySelectorAll( '.klyna-act' ).forEach( function ( btn ) {
			btn.addEventListener( 'click', function () {
				var id = btn.getAttribute( 'data-id' );
				var action = btn.getAttribute( 'data-action' );
				var rowButtons = btn.closest( 'tr' ).querySelectorAll( '.klyna-act' );
				rowButtons.forEach( function ( b ) {
					b.disabled = true;
				} );
				btn.textContent = i18n.updating;

				apiFetch( {
					path: '/admin/bookings/' + id + '/status',
					method: 'POST',
					data: { status: action },
				} )
					.then( function () {
						load();
					} )
					.catch( function () {
						window.alert( i18n.error );
						rowButtons.forEach( function ( b ) {
							b.disabled = false;
						} );
					} );
			} );
		} );
	}

	function updatePager() {
		if ( ! pager ) {
			return;
		}
		pager.hidden = state.pages <= 1;
		if ( pagerInfo ) {
			pagerInfo.textContent = state.paged + ' / ' + state.pages;
		}
		var prev = pager.querySelector( '[data-prev]' );
		var next = pager.querySelector( '[data-next]' );
		if ( prev ) {
			prev.disabled = state.paged <= 1;
		}
		if ( next ) {
			next.disabled = state.paged >= state.pages;
		}
	}

	function load() {
		root.innerHTML = '<p class="klyna-muted">' + esc( i18n.updating ) + '</p>';
		var query =
			'/admin/bookings?paged=' +
			state.paged +
			( state.status ? '&status=' + encodeURIComponent( state.status ) : '' );

		apiFetch( { path: query } )
			.then( function ( data ) {
				state.pages = data.pages || 1;
				render( data.items || [] );
				updatePager();
			} )
			.catch( function () {
				root.innerHTML = '<p class="klyna-muted">' + esc( i18n.error ) + '</p>';
			} );
	}

	// Filter chips.
	var filters = document.querySelector( '[data-filters]' );
	if ( filters ) {
		filters.querySelectorAll( '.klyna-chip' ).forEach( function ( chip ) {
			chip.addEventListener( 'click', function () {
				filters.querySelectorAll( '.klyna-chip' ).forEach( function ( c ) {
					c.classList.remove( 'is-active' );
				} );
				chip.classList.add( 'is-active' );
				state.status = chip.getAttribute( 'data-status' ) || '';
				state.paged = 1;
				load();
			} );
		} );
	}

	if ( pager ) {
		var prev = pager.querySelector( '[data-prev]' );
		var next = pager.querySelector( '[data-next]' );
		if ( prev ) {
			prev.addEventListener( 'click', function () {
				if ( state.paged > 1 ) {
					state.paged--;
					load();
				}
			} );
		}
		if ( next ) {
			next.addEventListener( 'click', function () {
				if ( state.paged < state.pages ) {
					state.paged++;
					load();
				}
			} );
		}
	}

	load();
} )();
