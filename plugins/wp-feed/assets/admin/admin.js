/**
 * Klyna Product Feed — admin behaviour.
 *
 * Vanilla JS, no jQuery. Talks to the klyna-feed/v1 REST namespace via
 * wp.apiFetch (nonce attached by core). Powers:
 *   - "Regenerate now" on the dashboard.
 *   - "Copy" buttons for the public feed URLs.
 *   - "Scan catalog" on the Feed health page.
 */
( function () {
	'use strict';

	var cfg = window.KLYNA_FEED || {};
	var i18n = cfg.i18n || {};

	function apiFetch( path, options ) {
		options = options || {};
		options.url = cfg.apiBase + path;
		options.headers = Object.assign( { 'X-WP-Nonce': cfg.nonce }, options.headers || {} );
		if ( window.wp && window.wp.apiFetch ) {
			return window.wp.apiFetch( options );
		}
		// Fallback to fetch if wp.apiFetch is unavailable for any reason.
		return fetch( options.url, {
			method: options.method || 'GET',
			headers: options.headers,
			credentials: 'same-origin',
		} ).then( function ( res ) {
			return res.json();
		} );
	}

	function setStatus( el, message, state ) {
		if ( ! el ) {
			return;
		}
		el.textContent = message || '';
		el.className = 'klyna-feed-status' + ( state ? ' is-' + state : '' );
	}

	/* Regenerate ----------------------------------------------------------- */

	function bindRegenerate() {
		var button = document.getElementById( 'klyna-feed-regenerate' );
		var status = document.getElementById( 'klyna-feed-status' );
		if ( ! button ) {
			return;
		}
		button.addEventListener( 'click', function () {
			button.disabled = true;
			button.textContent = i18n.regenerating || 'Regenerating…';
			setStatus( status, '', null );
			apiFetch( '/regenerate', { method: 'POST' } )
				.then( function () {
					setStatus( status, i18n.done || 'Done.', 'success' );
					window.setTimeout( function () {
						window.location.reload();
					}, 700 );
				} )
				.catch( function () {
					setStatus( status, i18n.error || 'Error.', 'error' );
					button.disabled = false;
					button.textContent = i18n.regenerate || 'Regenerate now';
				} );
		} );
	}

	/* Copy buttons --------------------------------------------------------- */

	function bindCopy() {
		var buttons = document.querySelectorAll( '.klyna-feed-copy' );
		Array.prototype.forEach.call( buttons, function ( btn ) {
			btn.addEventListener( 'click', function () {
				var value = btn.getAttribute( 'data-clipboard' ) || '';
				var label = btn.textContent;
				var done = function () {
					btn.textContent = i18n.copied || 'Copied!';
					window.setTimeout( function () {
						btn.textContent = label;
					}, 1400 );
				};
				if ( navigator.clipboard && navigator.clipboard.writeText ) {
					navigator.clipboard.writeText( value ).then( done, done );
				} else {
					var input = btn.parentNode.querySelector( '.klyna-feed-url__input' );
					if ( input ) {
						input.select();
						try {
							document.execCommand( 'copy' );
						} catch ( e ) {} // eslint-disable-line no-empty
						done();
					}
				}
			} );
		} );
	}

	/* Health scan ---------------------------------------------------------- */

	function bindScan() {
		var button = document.getElementById( 'klyna-feed-scan' );
		var status = document.getElementById( 'klyna-feed-scan-status' );
		var output = document.getElementById( 'klyna-feed-health-output' );
		if ( ! button || ! output ) {
			return;
		}
		button.addEventListener( 'click', function () {
			button.disabled = true;
			setStatus( status, i18n.scanning || 'Scanning…', null );
			output.innerHTML = '';
			apiFetch( '/health', { method: 'GET' } )
				.then( function ( data ) {
					setStatus( status, '', null );
					renderHealth( output, data );
				} )
				.catch( function () {
					setStatus( status, i18n.error || 'Error.', 'error' );
				} )
				.then( function () {
					button.disabled = false;
				} );
		} );
	}

	function renderHealth( output, data ) {
		var warnings = ( data && data.warnings ) || [];
		var summary = document.createElement( 'div' );
		summary.className = 'klyna-feed-health-summary';
		summary.innerHTML =
			'<span><strong>' + ( data.item_count || 0 ) + '</strong> items scanned</span>' +
			'<span><strong>' + ( data.warning_count || 0 ) + '</strong> warnings</span>';
		output.appendChild( summary );

		if ( ! warnings.length ) {
			var ok = document.createElement( 'p' );
			ok.className = 'klyna-feed-empty-ok';
			ok.textContent = i18n.noWarnings || 'No issues found.';
			output.appendChild( ok );
			return;
		}

		var table = document.createElement( 'table' );
		table.className = 'klyna-feed-table';
		var thead = document.createElement( 'thead' );
		thead.innerHTML = '<tr><th>Product</th><th>Field</th><th>Issue</th></tr>';
		table.appendChild( thead );
		var tbody = document.createElement( 'tbody' );
		warnings.forEach( function ( w ) {
			var tr = document.createElement( 'tr' );
			tr.appendChild( cell( w.product || ( '#' + w.product_id ) ) );
			var fieldCell = cell( w.field || '' );
			fieldCell.className = 'klyna-feed-field';
			tr.appendChild( fieldCell );
			tr.appendChild( cell( w.message || '' ) );
			tbody.appendChild( tr );
		} );
		table.appendChild( tbody );
		output.appendChild( table );
	}

	function cell( text ) {
		var td = document.createElement( 'td' );
		td.textContent = text;
		return td;
	}

	/* Boot ----------------------------------------------------------------- */

	document.addEventListener( 'DOMContentLoaded', function () {
		bindRegenerate();
		bindCopy();
		bindScan();
	} );
} )();
