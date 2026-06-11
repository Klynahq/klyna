/**
 * Klyna Speed — admin dashboard interactions.
 *
 * Wires the "Purge all cache" button to the REST endpoint and refreshes the
 * stat tiles in place. No jQuery; uses wp.apiFetch with the localized nonce.
 */
( function () {
	'use strict';

	if ( typeof window.KLYNA_SPEED === 'undefined' ) {
		return;
	}

	var cfg = window.KLYNA_SPEED;
	var apiFetch = window.wp && window.wp.apiFetch ? window.wp.apiFetch : null;

	document.addEventListener( 'DOMContentLoaded', function () {
		var purgeBtn = document.getElementById( 'klyna-speed-purge' );
		var status = document.getElementById( 'klyna-speed-status' );
		var filesEl = document.getElementById( 'klyna-speed-files' );
		var sizeEl = document.getElementById( 'klyna-speed-size' );

		if ( ! purgeBtn ) {
			return;
		}

		function setStatus( text, kind ) {
			if ( ! status ) {
				return;
			}
			status.textContent = text;
			status.className = 'klyna-speed-status' + ( kind ? ' is-' + kind : '' );
		}

		function refreshStats() {
			request( cfg.apiBase + '/stats', 'GET' )
				.then( function ( data ) {
					if ( ! data ) {
						return;
					}
					if ( filesEl && typeof data.files !== 'undefined' ) {
						filesEl.textContent = String( data.files );
					}
					if ( sizeEl && data.human_size ) {
						sizeEl.textContent = data.human_size;
					}
				} )
				.catch( function () {
					/* non-fatal */
				} );
		}

		/**
		 * Thin wrapper that prefers wp.apiFetch and falls back to fetch().
		 */
		function request( url, method ) {
			if ( apiFetch ) {
				return apiFetch( {
					url: url,
					method: method,
					headers: { 'X-WP-Nonce': cfg.nonce }
				} );
			}
			return fetch( url, {
				method: method,
				credentials: 'same-origin',
				headers: {
					'X-WP-Nonce': cfg.nonce,
					'Content-Type': 'application/json'
				}
			} ).then( function ( res ) {
				if ( ! res.ok ) {
					throw new Error( 'HTTP ' + res.status );
				}
				return res.json();
			} );
		}

		purgeBtn.addEventListener( 'click', function ( evt ) {
			evt.preventDefault();
			purgeBtn.disabled = true;
			setStatus( cfg.i18n.purging, '' );

			request( cfg.apiBase + '/purge', 'POST' )
				.then( function ( data ) {
					setStatus( ( data && data.message ) || cfg.i18n.purged, 'success' );
					refreshStats();
				} )
				.catch( function () {
					setStatus( cfg.i18n.failed, 'error' );
				} )
				.finally( function () {
					purgeBtn.disabled = false;
				} );
		} );
	} );
} )();
