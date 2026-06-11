/**
 * Klyna Tables — front-end runtime.
 *
 * Progressive enhancement over a plain <table>: client-side search, click-to-sort
 * columns, and pagination. Zero dependencies (no jQuery). Each .klyna-table-wrap
 * is enhanced independently and reads its behaviour from data-* attributes.
 */
( function () {
	'use strict';

	var i18n = window.KlynaTablesI18n || {};

	function t( key, fallback ) {
		return typeof i18n[ key ] === 'string' ? i18n[ key ] : fallback;
	}

	function format( str ) {
		var args = Array.prototype.slice.call( arguments, 1 );
		var i = 0;
		return str.replace( /%(\d+\$)?s/g, function ( _m, pos ) {
			var idx = pos ? parseInt( pos, 10 ) - 1 : i++;
			return args[ idx ] !== undefined ? args[ idx ] : '';
		} );
	}

	/**
	 * Enhance a single table wrapper.
	 */
	function enhance( wrap ) {
		if ( wrap.dataset.klynaReady === '1' ) {
			return;
		}
		wrap.dataset.klynaReady = '1';

		var table = wrap.querySelector( 'table.klyna-table' );
		if ( ! table ) {
			return;
		}

		var tbody = table.tBodies[ 0 ];
		if ( ! tbody ) {
			return;
		}

		var allRows = Array.prototype.slice.call( tbody.rows );
		var filtered = allRows.slice();

		var doSort = wrap.dataset.sort === '1';
		var doSearch = wrap.dataset.search === '1';
		var doPaginate = wrap.dataset.paginate === '1';
		var perPage = Math.max( 1, parseInt( wrap.dataset.perPage, 10 ) || 10 );

		var state = {
			page: 1,
			sortCol: -1,
			sortDir: 1,
			query: ''
		};

		var searchInput = wrap.querySelector( '.klyna-table-search-input' );
		var countEl = wrap.querySelector( '.klyna-table-count' );
		var pager = wrap.querySelector( '.klyna-table-pager' );
		var headers = Array.prototype.slice.call( table.tHead ? table.tHead.rows[ 0 ].cells : [] );

		// --- Search -----------------------------------------------------------
		function applySearch() {
			var q = state.query.trim().toLowerCase();
			if ( ! q ) {
				filtered = allRows.slice();
				return;
			}
			filtered = allRows.filter( function ( row ) {
				return row.textContent.toLowerCase().indexOf( q ) !== -1;
			} );
		}

		// --- Sort -------------------------------------------------------------
		function sortKey( row, col ) {
			var cell = row.cells[ col ];
			if ( ! cell ) {
				return '';
			}
			var raw = cell.getAttribute( 'data-sort' );
			return raw !== null ? raw : cell.textContent;
		}

		function applySort() {
			if ( state.sortCol < 0 ) {
				return;
			}
			var col = state.sortCol;
			var dir = state.sortDir;
			var type = headers[ col ] ? headers[ col ].getAttribute( 'data-type' ) : 'text';

			filtered.sort( function ( a, b ) {
				var av = sortKey( a, col );
				var bv = sortKey( b, col );
				if ( type === 'number' ) {
					var an = parseFloat( av );
					var bn = parseFloat( bv );
					an = isNaN( an ) ? -Infinity : an;
					bn = isNaN( bn ) ? -Infinity : bn;
					return ( an - bn ) * dir;
				}
				return av.localeCompare( bv, undefined, { numeric: true, sensitivity: 'base' } ) * dir;
			} );
		}

		function updateSortIndicators() {
			headers.forEach( function ( th, i ) {
				if ( ! th.hasAttribute( 'aria-sort' ) ) {
					return;
				}
				if ( i === state.sortCol ) {
					th.setAttribute( 'aria-sort', state.sortDir === 1 ? 'ascending' : 'descending' );
				} else {
					th.setAttribute( 'aria-sort', 'none' );
				}
			} );
		}

		// --- Render -----------------------------------------------------------
		function render() {
			applySearch();
			applySort();

			var total = allRows.length;
			var visible = filtered;
			var pageRows = visible;

			if ( doPaginate ) {
				var pages = Math.max( 1, Math.ceil( visible.length / perPage ) );
				if ( state.page > pages ) {
					state.page = pages;
				}
				var start = ( state.page - 1 ) * perPage;
				pageRows = visible.slice( start, start + perPage );
				renderPager( pages );
			}

			// Detach all, then reattach the visible page in order.
			allRows.forEach( function ( row ) {
				if ( row.parentNode === tbody ) {
					tbody.removeChild( row );
				}
			} );
			pageRows.forEach( function ( row ) {
				tbody.appendChild( row );
			} );

			renderEmptyState( visible.length );

			if ( countEl ) {
				countEl.textContent = format( t( 'showing', 'Showing %1$s of %2$s' ), String( visible.length ), String( total ) );
			}
		}

		function renderEmptyState( visibleCount ) {
			var existing = wrap.querySelector( '.klyna-table-noresults' );
			if ( visibleCount === 0 ) {
				if ( ! existing ) {
					var p = document.createElement( 'p' );
					p.className = 'klyna-table-noresults';
					p.textContent = t( 'noResults', 'No matching rows.' );
					table.parentNode.insertBefore( p, table.nextSibling );
				}
			} else if ( existing ) {
				existing.parentNode.removeChild( existing );
			}
		}

		// --- Pager ------------------------------------------------------------
		function renderPager( pages ) {
			if ( ! pager ) {
				return;
			}
			pager.innerHTML = '';
			if ( pages <= 1 ) {
				return;
			}

			var prev = makePageButton( t( 'prev', 'Previous' ), state.page - 1, state.page === 1 );
			pager.appendChild( prev );

			var range = pageRange( state.page, pages );
			range.forEach( function ( p ) {
				if ( p === '…' ) {
					var gap = document.createElement( 'span' );
					gap.className = 'klyna-page-gap';
					gap.textContent = '…';
					pager.appendChild( gap );
					return;
				}
				var btn = makePageButton( String( p ), p, false, p === state.page );
				pager.appendChild( btn );
			} );

			var next = makePageButton( t( 'next', 'Next' ), state.page + 1, state.page === pages );
			pager.appendChild( next );
		}

		function makePageButton( label, page, disabled, current ) {
			var btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'klyna-page-btn' + ( current ? ' is-current' : '' );
			btn.textContent = label;
			if ( disabled ) {
				btn.disabled = true;
			}
			if ( current ) {
				btn.setAttribute( 'aria-current', 'page' );
			}
			btn.addEventListener( 'click', function () {
				if ( disabled || page < 1 ) {
					return;
				}
				state.page = page;
				render();
			} );
			return btn;
		}

		function pageRange( current, total ) {
			var delta = 1;
			var range = [];
			var last;
			for ( var i = 1; i <= total; i++ ) {
				if ( i === 1 || i === total || ( i >= current - delta && i <= current + delta ) ) {
					if ( last && i - last > 1 ) {
						range.push( '…' );
					}
					range.push( i );
					last = i;
				}
			}
			return range;
		}

		// --- Wire up ----------------------------------------------------------
		if ( doSearch && searchInput ) {
			var debounce;
			searchInput.addEventListener( 'input', function () {
				clearTimeout( debounce );
				debounce = setTimeout( function () {
					state.query = searchInput.value;
					state.page = 1;
					render();
				}, 120 );
			} );
		}

		if ( doSort ) {
			headers.forEach( function ( th, i ) {
				if ( ! th.hasAttribute( 'aria-sort' ) ) {
					return;
				}
				function trigger() {
					if ( state.sortCol === i ) {
						state.sortDir = -state.sortDir;
					} else {
						state.sortCol = i;
						state.sortDir = 1;
					}
					state.page = 1;
					updateSortIndicators();
					render();
				}
				th.addEventListener( 'click', trigger );
				th.addEventListener( 'keydown', function ( e ) {
					if ( e.key === 'Enter' || e.key === ' ' ) {
						e.preventDefault();
						trigger();
					}
				} );
			} );
		}

		render();
	}

	function init() {
		var wraps = document.querySelectorAll( '.klyna-table-wrap' );
		Array.prototype.forEach.call( wraps, enhance );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

	// Re-scan when blocks are injected late (e.g. AJAX, editor preview).
	window.KlynaTables = { init: init, enhance: enhance };
}() );
