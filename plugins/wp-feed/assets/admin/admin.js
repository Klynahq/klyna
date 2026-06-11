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

	/* AI test button ------------------------------------------------------- */

	function bindAiTest() {
		var btn = document.getElementById( 'klyna-feed-ai-test' );
		var status = document.getElementById( 'klyna-feed-ai-test-status' );
		if ( ! btn || ! status ) { return; }
		btn.addEventListener( 'click', function () {
			btn.disabled = true;
			status.textContent = 'Testing…';
			wp.apiFetch( {
				path: '/klyna-feed/v1/ai/test',
				method: 'POST',
				headers: { 'X-WP-Nonce': KLYNA_FEED.nonce },
			} ).then( function ( res ) {
				btn.disabled = false;
				if ( res && res.ok ) {
					status.textContent = 'OK · ' + ( res.text || '' );
				} else {
					status.textContent = 'Failed: ' + ( ( res && res.text ) || ( res && res.reason ) || 'unknown' );
				}
			} ).catch( function ( err ) {
				btn.disabled = false;
				status.textContent = 'Error: ' + ( err && err.message ? err.message : 'request failed' );
			} );
		} );
	}

	/* Title variants page ------------------------------------------------- */

	function bindTitles() {
		var root = document.getElementById( 'klyna-feed-titles-root' );
		var table = document.getElementById( 'klyna-feed-titles-table' );
		var btn = document.getElementById( 'klyna-feed-titles-run' );
		var status = document.getElementById( 'klyna-feed-titles-status' );
		if ( ! root || ! table ) { return; }

		var products = [];
		try { products = JSON.parse( root.getAttribute( 'data-products' ) || '[]' ); }
		catch ( e ) { products = []; }

		var byId = {};
		products.forEach( function ( p ) { byId[ p.id ] = p; } );

		function render() {
			if ( ! products.length ) {
				table.innerHTML = '';
				return;
			}
			var html = '<table class="widefat striped klyna-feed-titles-table"><thead><tr>' +
				'<th>Product</th>' +
				'<th>Google (70)</th>' +
				'<th>Meta (60)</th>' +
				'<th>Pinterest (50)</th>' +
				'</tr></thead><tbody>';
			products.forEach( function ( p ) {
				html += '<tr data-id="' + p.id + '">' +
					'<td><strong>' + escapeHtml( p.name ) + '</strong>' +
					( p.edit_link ? ' · <a href="' + p.edit_link + '">edit</a>' : '' ) +
					'</td>' +
					variantCell( p.variants && p.variants.google, 70 ) +
					variantCell( p.variants && p.variants.meta, 60 ) +
					variantCell( p.variants && p.variants.pinterest, 50 ) +
					'</tr>';
			} );
			html += '</tbody></table>';
			table.innerHTML = html;
		}

		function variantCell( text, max ) {
			var t = text || '';
			var len = t.length;
			var cls = len > max ? 'klyna-feed-over' : '';
			return '<td><div class="' + cls + '">' + escapeHtml( t || '—' ) +
				'</div><small>' + len + ' / ' + max + '</small></td>';
		}

		function escapeHtml( s ) {
			return String( s ).replace( /[&<>"']/g, function ( c ) {
				return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ];
			} );
		}

		function runOne( id ) {
			return wp.apiFetch( {
				path: '/klyna-feed/v1/titles/optimize',
				method: 'POST',
				headers: { 'X-WP-Nonce': KLYNA_FEED.nonce },
				data: { product_id: id },
			} ).then( function ( res ) {
				if ( res && res.variants && byId[ id ] ) {
					byId[ id ].variants = res.variants;
				}
				render();
				return res;
			} );
		}

		function runAll() {
			if ( ! products.length ) { return; }
			btn.disabled = true;
			var done = 0;
			var total = products.length;
			status.textContent = 'Optimizing 0 / ' + total + '…';
			var chain = Promise.resolve();
			products.forEach( function ( p ) {
				chain = chain.then( function () {
					return runOne( p.id ).then( function () {
						done += 1;
						status.textContent = 'Optimizing ' + done + ' / ' + total + '…';
					} ).catch( function () {
						done += 1;
						status.textContent = 'Optimizing ' + done + ' / ' + total + '… (1 error)';
					} );
				} );
			} );
			chain.then( function () {
				btn.disabled = false;
				status.textContent = 'Done.';
				var url = new URL( window.location.href );
				url.searchParams.delete( 'run' );
				url.searchParams.set( 'klyna_feed_optimized', String( total ) );
				window.history.replaceState( {}, '', url.toString() );
			} );
		}

		if ( btn ) { btn.addEventListener( 'click', runAll ); }
		render();

		if ( root.getAttribute( 'data-autorun' ) === '1' && products.length ) {
			runAll();
		}
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		bindRegenerate();
		bindCopy();
		bindScan();
		bindAiTest();
		bindTitles();
	} );
} )();
