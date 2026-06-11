/**
 * Klyna Tables — admin app.
 *
 * A small vanilla-JS controller for #klyna-tables-app. Two views:
 *   - list:  every table with row/column counts + shortcode + actions
 *   - edit:  the grid builder (add/remove/reorder columns & rows, types,
 *            CSV import, per-table feature overrides)
 *
 * Talks to the klyna-tables/v1 REST API via wp.apiFetch (nonce auto-attached).
 */
( function () {
	'use strict';

	var cfg = window.KlynaTablesAdmin || {};
	var apiFetch = window.wp && window.wp.apiFetch;
	var __ = ( window.wp && window.wp.i18n && window.wp.i18n.__ ) || function ( s ) { return s; };
	var strings = cfg.strings || {};
	var root = document.getElementById( 'klyna-tables-app' );

	if ( ! root || ! apiFetch ) {
		return;
	}

	apiFetch.use( apiFetch.createNonceMiddleware( cfg.nonce ) );

	var COLUMN_TYPES = [ 'text', 'number', 'link', 'image', 'html' ];
	var ALIGNS = [ 'left', 'center', 'right' ];

	var state = {
		view: 'list',
		tables: [],
		current: null,
		dirty: false,
		message: ''
	};

	// --- API helpers ----------------------------------------------------------
	function api( path, options ) {
		options = options || {};
		options.path = cfg.apiBase.replace( /^https?:\/\/[^/]+/, '' ) + path;
		return apiFetch( options );
	}

	function loadList() {
		return api( '/tables' ).then( function ( tables ) {
			state.tables = tables || [];
			state.view = 'list';
			render();
		} );
	}

	function openTable( id ) {
		return api( '/tables/' + id ).then( function ( table ) {
			state.current = table;
			state.dirty = false;
			state.view = 'edit';
			render();
		} );
	}

	// --- DOM helpers ----------------------------------------------------------
	function h( tag, attrs, children ) {
		var node = document.createElement( tag );
		attrs = attrs || {};
		Object.keys( attrs ).forEach( function ( key ) {
			if ( key === 'class' ) {
				node.className = attrs[ key ];
			} else if ( key === 'text' ) {
				node.textContent = attrs[ key ];
			} else if ( key === 'html' ) {
				node.innerHTML = attrs[ key ];
			} else if ( key.indexOf( 'on' ) === 0 ) {
				node.addEventListener( key.slice( 2 ).toLowerCase(), attrs[ key ] );
			} else if ( attrs[ key ] !== null && attrs[ key ] !== undefined && attrs[ key ] !== false ) {
				node.setAttribute( key, attrs[ key ] );
			}
		} );
		( children || [] ).forEach( function ( child ) {
			if ( child === null || child === undefined || child === false ) {
				return;
			}
			node.appendChild( typeof child === 'string' ? document.createTextNode( child ) : child );
		} );
		return node;
	}

	function flash( msg ) {
		state.message = msg;
		var bar = root.querySelector( '.klyna-flash' );
		if ( bar ) {
			bar.textContent = msg;
			bar.classList.add( 'is-visible' );
			clearTimeout( bar._timer );
			bar._timer = setTimeout( function () {
				bar.classList.remove( 'is-visible' );
			}, 2400 );
		}
	}

	// --- List view ------------------------------------------------------------
	function renderList() {
		var head = h( 'div', { class: 'klyna-list-head' }, [
			h( 'div', { class: 'klyna-newtable' }, [
				h( 'input', {
					type: 'text',
					class: 'klyna-input',
					placeholder: __( 'New table name…', 'wp-tables' ),
					id: 'klyna-new-title'
				} ),
				h( 'button', {
					class: 'button button-primary',
					onClick: function () {
						var input = document.getElementById( 'klyna-new-title' );
						var title = input.value.trim() || __( 'Untitled table', 'wp-tables' );
						api( '/tables', { method: 'POST', data: { title: title } } ).then( function ( table ) {
							state.current = table;
							state.view = 'edit';
							state.dirty = false;
							render();
						} );
					}
				}, [ __( 'Create table', 'wp-tables' ) ] )
			] )
		] );

		var rows = state.tables.map( function ( table ) {
			return h( 'tr', {}, [
				h( 'td', {}, [
					h( 'a', {
						href: '#',
						class: 'klyna-table-name',
						onClick: function ( e ) {
							e.preventDefault();
							openTable( table.id );
						}
					}, [ table.title ] )
				] ),
				h( 'td', { class: 'klyna-num' }, [ String( table.rows ) ] ),
				h( 'td', { class: 'klyna-num' }, [ String( table.columns ) ] ),
				h( 'td', {}, [ h( 'span', { class: 'klyna-badge klyna-badge-' + table.source }, [ table.source ] ) ] ),
				h( 'td', {}, [
					h( 'code', { class: 'klyna-shortcode', title: __( 'Click to copy', 'wp-tables' ), onClick: function () {
						copy( table.shortcode );
					} }, [ table.shortcode ] )
				] ),
				h( 'td', { class: 'klyna-actions' }, [
					h( 'button', { class: 'button-link', onClick: function () { openTable( table.id ); } }, [ __( 'Edit', 'wp-tables' ) ] ),
					h( 'button', { class: 'button-link klyna-danger', onClick: function () { deleteTable( table.id ); } }, [ __( 'Delete', 'wp-tables' ) ] )
				] )
			] );
		} );

		var table = state.tables.length
			? h( 'table', { class: 'widefat klyna-list-table' }, [
				h( 'thead', {}, [ h( 'tr', {}, [
					h( 'th', {}, [ __( 'Table', 'wp-tables' ) ] ),
					h( 'th', { class: 'klyna-num' }, [ __( 'Rows', 'wp-tables' ) ] ),
					h( 'th', { class: 'klyna-num' }, [ __( 'Cols', 'wp-tables' ) ] ),
					h( 'th', {}, [ __( 'Source', 'wp-tables' ) ] ),
					h( 'th', {}, [ __( 'Shortcode', 'wp-tables' ) ] ),
					h( 'th', {}, [ __( 'Actions', 'wp-tables' ) ] )
				] ) ] ),
				h( 'tbody', {}, rows )
			] )
			: h( 'div', { class: 'klyna-empty' }, [
				h( 'p', {}, [ __( 'No tables yet. Create your first one above, then drop its shortcode into any post or page.', 'wp-tables' ) ] )
			] );

		return [ head, table ];
	}

	function deleteTable( id ) {
		if ( ! window.confirm( strings.confirmDelete || __( 'Delete this table?', 'wp-tables' ) ) ) {
			return;
		}
		api( '/tables/' + id, { method: 'DELETE' } ).then( loadList );
	}

	// --- Edit view ------------------------------------------------------------
	function renderEdit() {
		var table = state.current;
		var data = table.data;
		var config = table.config || {};

		var titleRow = h( 'div', { class: 'klyna-edit-head' }, [
			h( 'button', { class: 'button klyna-back', onClick: function () {
				if ( state.dirty && ! window.confirm( __( 'Discard unsaved changes?', 'wp-tables' ) ) ) {
					return;
				}
				loadList();
			} }, [ '← ' + __( 'All tables', 'wp-tables' ) ] ),
			h( 'input', {
				type: 'text',
				class: 'klyna-input klyna-title-input',
				value: table.title,
				onInput: function ( e ) {
					table.title = e.target.value;
					state.dirty = true;
				}
			} ),
			h( 'button', { class: 'button button-primary', onClick: saveTable }, [ __( 'Save table', 'wp-tables' ) ] )
		] );

		var toolbar = h( 'div', { class: 'klyna-builder-toolbar' }, [
			h( 'button', { class: 'button', onClick: addColumn }, [ '+ ' + __( 'Column', 'wp-tables' ) ] ),
			h( 'button', { class: 'button', onClick: addRow }, [ '+ ' + __( 'Row', 'wp-tables' ) ] ),
			h( 'button', { class: 'button', onClick: toggleCsv }, [ __( 'Import CSV', 'wp-tables' ) ] ),
			h( 'span', { class: 'klyna-grid-meta' }, [
				data.columns.length + ' ' + __( 'cols', 'wp-tables' ) + ' · ' + data.rows.length + ' ' + __( 'rows', 'wp-tables' )
			] )
		] );

		var grid = buildGrid( data );
		var csvPanel = buildCsvPanel( table );
		var configPanel = buildConfigPanel( config );
		var insightPanel = buildInsightPanel( table );

		return [ titleRow, toolbar, csvPanel, grid, configPanel, insightPanel ];
	}

	function buildInsightPanel( table ) {
		var insight = table.insight || { text: '', updated: 0, enabled: false };
		var statusEl = h( 'span', { class: 'klyna-ai-status', id: 'klyna-ai-status' }, [] );
		var textEl   = h( 'p', { class: 'klyna-ai-text', id: 'klyna-ai-text' }, [ insight.text || __( 'No insight yet. Click "Generate insight" to summarize this table with AI.', 'wp-tables' ) ] );

		var toggle = h( 'label', { class: 'klyna-ai-toggle' }, [
			h( 'input', {
				type: 'checkbox',
				checked: insight.enabled ? 'checked' : null,
				onChange: function ( e ) {
					var enabled = !! e.target.checked;
					api( '/tables/' + table.id + '/insight-toggle', { method: 'POST', data: { enabled: enabled } } )
						.then( function ( r ) {
							table.insight = table.insight || {};
							table.insight.enabled = !! r.enabled;
							flash( enabled ? __( 'Insight will show on the front-end.', 'wp-tables' ) : __( 'Insight hidden on the front-end.', 'wp-tables' ) );
						} )
						.catch( function () { flash( __( 'Could not save toggle.', 'wp-tables' ) ); } );
				}
			} ),
			' ' + __( 'Show this insight at the top of the front-end table', 'wp-tables' )
		] );

		var generateBtn = h( 'button', {
			class: 'button button-primary',
			onClick: function () {
				var btn = document.getElementById( 'klyna-ai-generate' );
				if ( btn ) { btn.disabled = true; btn.textContent = __( 'Generating…', 'wp-tables' ); }
				document.getElementById( 'klyna-ai-status' ).textContent = '';
				api( '/tables/' + table.id + '/insight', { method: 'POST' } )
					.then( function ( r ) {
						if ( r && r.insight ) {
							table.insight = table.insight || {};
							table.insight.text = r.insight;
							table.insight.updated = Math.floor( Date.now() / 1000 );
							var t = document.getElementById( 'klyna-ai-text' );
							if ( t ) { t.textContent = r.insight; }
							flash( __( 'Insight generated.', 'wp-tables' ) );
						}
					} )
					.catch( function ( err ) {
						var msg = ( err && err.message ) ? err.message : __( 'Failed to generate insight.', 'wp-tables' );
						document.getElementById( 'klyna-ai-status' ).textContent = msg;
					} )
					.finally( function () {
						var b = document.getElementById( 'klyna-ai-generate' );
						if ( b ) { b.disabled = false; b.textContent = __( 'Generate insight', 'wp-tables' ); }
					} );
			},
			id: 'klyna-ai-generate'
		}, [ __( 'Generate insight', 'wp-tables' ) ] );

		var clearBtn = h( 'button', {
			class: 'button',
			onClick: function () {
				if ( ! window.confirm( __( 'Remove the saved insight?', 'wp-tables' ) ) ) { return; }
				api( '/tables/' + table.id + '/insight', { method: 'DELETE' } )
					.then( function () {
						table.insight = { text: '', updated: 0, enabled: false };
						render();
						flash( __( 'Insight cleared.', 'wp-tables' ) );
					} );
			}
		}, [ __( 'Clear', 'wp-tables' ) ] );

		return h( 'div', { class: 'klyna-ai-panel' }, [
			h( 'h3', {}, [ __( 'AI insight', 'wp-tables' ) ] ),
			h( 'p', { class: 'description' }, [ __( 'Generate a single-paragraph plain-English summary of this table. Requires an AI provider configured in Klyna Tables → Settings.', 'wp-tables' ) ] ),
			h( 'div', { class: 'klyna-ai-actions' }, [ generateBtn, ' ', clearBtn, ' ', statusEl ] ),
			textEl,
			h( 'div', { class: 'klyna-ai-toggle-wrap' }, [ toggle ] )
		] );
	}

	function buildGrid( data ) {
		// Header row: per-column label + type + align + delete.
		var headCells = data.columns.map( function ( col, ci ) {
			return h( 'th', { class: 'klyna-col-cell' }, [
				h( 'input', {
					type: 'text',
					class: 'klyna-input klyna-col-label',
					value: col.label,
					onInput: function ( e ) { col.label = e.target.value; state.dirty = true; }
				} ),
				h( 'div', { class: 'klyna-col-controls' }, [
					selectControl( COLUMN_TYPES, col.type, function ( v ) { col.type = v; state.dirty = true; } ),
					selectControl( ALIGNS, col.align, function ( v ) { col.align = v; state.dirty = true; } ),
					h( 'button', { class: 'klyna-icon-btn', title: __( 'Move left', 'wp-tables' ), onClick: function () { moveColumn( ci, -1 ); } }, [ '◄' ] ),
					h( 'button', { class: 'klyna-icon-btn', title: __( 'Move right', 'wp-tables' ), onClick: function () { moveColumn( ci, 1 ); } }, [ '►' ] ),
					h( 'button', { class: 'klyna-icon-btn klyna-danger', title: __( 'Delete column', 'wp-tables' ), onClick: function () { removeColumn( ci ); } }, [ '×' ] )
				] )
			] );
		} );

		var bodyRows = data.rows.map( function ( row, ri ) {
			var cells = data.columns.map( function ( col, ci ) {
				return h( 'td', {}, [
					h( 'input', {
						type: 'text',
						class: 'klyna-input klyna-cell',
						value: row[ ci ] !== undefined ? row[ ci ] : '',
						placeholder: cellPlaceholder( col.type ),
						onInput: function ( e ) { row[ ci ] = e.target.value; state.dirty = true; }
					} )
				] );
			} );
			cells.push( h( 'td', { class: 'klyna-row-actions' }, [
				h( 'button', { class: 'klyna-icon-btn klyna-danger', title: __( 'Delete row', 'wp-tables' ), onClick: function () { removeRow( ri ); } }, [ '×' ] )
			] ) );
			return h( 'tr', {}, cells );
		} );

		headCells.push( h( 'th', { class: 'klyna-row-actions-head' }, [] ) );

		return h( 'div', { class: 'klyna-grid-scroll' }, [
			h( 'table', { class: 'klyna-builder-grid' }, [
				h( 'thead', {}, [ h( 'tr', {}, headCells ) ] ),
				h( 'tbody', {}, bodyRows.length ? bodyRows : [ h( 'tr', {}, [ h( 'td', { colspan: data.columns.length + 1, class: 'klyna-empty-row' }, [ __( 'No rows. Add one above.', 'wp-tables' ) ] ) ] ) ] )
			] )
		] );
	}

	function cellPlaceholder( type ) {
		if ( type === 'link' ) { return 'https://… | Label'; }
		if ( type === 'image' ) { return 'https://…/img.jpg'; }
		if ( type === 'number' ) { return '0'; }
		return '';
	}

	function buildCsvPanel( table ) {
		var panel = h( 'div', { class: 'klyna-csv-panel', id: 'klyna-csv-panel', hidden: 'hidden' }, [
			h( 'h3', {}, [ __( 'Import CSV', 'wp-tables' ) ] ),
			h( 'p', { class: 'description' }, [ __( 'Paste CSV or upload a .csv file. This replaces the current grid.', 'wp-tables' ) ] ),
			h( 'div', { class: 'klyna-csv-row' }, [
				h( 'label', { class: 'klyna-check' }, [
					h( 'input', { type: 'checkbox', id: 'klyna-csv-header', checked: 'checked' } ),
					' ' + __( 'First row is a header', 'wp-tables' )
				] ),
				h( 'input', { type: 'file', accept: '.csv,text/csv', id: 'klyna-csv-file', onChange: onCsvFile } )
			] ),
			h( 'textarea', { class: 'klyna-csv-text', id: 'klyna-csv-text', rows: 6, placeholder: 'name,price\nWidget,9.99' } ),
			h( 'div', {}, [
				h( 'button', { class: 'button button-primary', onClick: function () { importCsv( table ); } }, [ __( 'Import', 'wp-tables' ) ] )
			] )
		] );
		return panel;
	}

	function buildConfigPanel( config ) {
		function boolControl( key, label ) {
			var val = config[ key ];
			return h( 'label', { class: 'klyna-check' }, [
				select3( val, function ( v ) { config[ key ] = v; state.dirty = true; } ),
				' ' + label
			] );
		}
		return h( 'div', { class: 'klyna-config-panel' }, [
			h( 'h3', {}, [ __( 'This table’s features', 'wp-tables' ) ] ),
			h( 'p', { class: 'description' }, [ __( '“Default” inherits the global setting. Override per table here.', 'wp-tables' ) ] ),
			h( 'div', { class: 'klyna-config-grid' }, [
				boolControl( 'enable_search', __( 'Search box', 'wp-tables' ) ),
				boolControl( 'enable_sort', __( 'Sortable columns', 'wp-tables' ) ),
				boolControl( 'enable_pagination', __( 'Pagination', 'wp-tables' ) ),
				boolControl( 'responsive_stack', __( 'Mobile stacking', 'wp-tables' ) ),
				boolControl( 'striped', __( 'Striped rows', 'wp-tables' ) ),
				h( 'label', { class: 'klyna-check klyna-rpp' }, [
					__( 'Rows per page', 'wp-tables' ) + ' ',
					h( 'input', {
						type: 'number',
						min: 1,
						max: 500,
						class: 'klyna-input klyna-rpp-input',
						value: config.rows_per_page !== null && config.rows_per_page !== undefined ? config.rows_per_page : '',
						placeholder: __( 'default', 'wp-tables' ),
						onInput: function ( e ) {
							var v = e.target.value.trim();
							config.rows_per_page = v === '' ? null : parseInt( v, 10 );
							state.dirty = true;
						}
					} )
				] )
			] )
		] );
	}

	// Tri-state select: Default / On / Off mapped to null / true / false.
	function select3( value, onChange ) {
		var opts = [
			{ v: '', label: __( 'Default', 'wp-tables' ) },
			{ v: '1', label: __( 'On', 'wp-tables' ) },
			{ v: '0', label: __( 'Off', 'wp-tables' ) }
		];
		var current = value === true ? '1' : ( value === false ? '0' : '' );
		var sel = h( 'select', { class: 'klyna-select', onChange: function ( e ) {
			var v = e.target.value;
			onChange( v === '' ? null : v === '1' );
		} }, opts.map( function ( o ) {
			return h( 'option', { value: o.v, selected: o.v === current ? 'selected' : null }, [ o.label ] );
		} ) );
		return sel;
	}

	function selectControl( values, current, onChange ) {
		return h( 'select', { class: 'klyna-select', onChange: function ( e ) { onChange( e.target.value ); } },
			values.map( function ( v ) {
				return h( 'option', { value: v, selected: v === current ? 'selected' : null }, [ v ] );
			} )
		);
	}

	// --- Mutations ------------------------------------------------------------
	function addColumn() {
		var data = state.current.data;
		var n = data.columns.length + 1;
		data.columns.push( { key: 'col_' + n, label: __( 'Column', 'wp-tables' ) + ' ' + n, type: 'text', align: 'left' } );
		data.rows.forEach( function ( row ) { row.push( '' ); } );
		state.dirty = true;
		render();
	}

	function removeColumn( ci ) {
		var data = state.current.data;
		data.columns.splice( ci, 1 );
		data.rows.forEach( function ( row ) { row.splice( ci, 1 ); } );
		state.dirty = true;
		render();
	}

	function moveColumn( ci, dir ) {
		var data = state.current.data;
		var to = ci + dir;
		if ( to < 0 || to >= data.columns.length ) { return; }
		var tmp = data.columns[ ci ]; data.columns[ ci ] = data.columns[ to ]; data.columns[ to ] = tmp;
		data.rows.forEach( function ( row ) {
			var c = row[ ci ]; row[ ci ] = row[ to ]; row[ to ] = c;
		} );
		state.dirty = true;
		render();
	}

	function addRow() {
		var data = state.current.data;
		data.rows.push( data.columns.map( function () { return ''; } ) );
		state.dirty = true;
		render();
	}

	function removeRow( ri ) {
		state.current.data.rows.splice( ri, 1 );
		state.dirty = true;
		render();
	}

	function toggleCsv() {
		var panel = document.getElementById( 'klyna-csv-panel' );
		if ( panel ) {
			if ( panel.hasAttribute( 'hidden' ) ) {
				panel.removeAttribute( 'hidden' );
			} else {
				panel.setAttribute( 'hidden', 'hidden' );
			}
		}
	}

	function onCsvFile( e ) {
		var file = e.target.files && e.target.files[ 0 ];
		if ( ! file ) { return; }
		var reader = new FileReader();
		reader.onload = function () {
			document.getElementById( 'klyna-csv-text' ).value = String( reader.result );
		};
		reader.readAsText( file );
	}

	function importCsv( table ) {
		var csv = document.getElementById( 'klyna-csv-text' ).value;
		if ( ! csv.trim() ) { return; }
		var hasHeader = document.getElementById( 'klyna-csv-header' ).checked;
		api( '/tables/' + table.id + '/import-csv', {
			method: 'POST',
			data: { csv: csv, has_header: hasHeader, delimiter: ',' }
		} ).then( function ( updated ) {
			state.current = updated;
			state.dirty = false;
			flash( strings.importDone || __( 'CSV imported.', 'wp-tables' ) );
			render();
		} );
	}

	function saveTable() {
		var table = state.current;
		flash( strings.saving || __( 'Saving…', 'wp-tables' ) );
		api( '/tables/' + table.id, {
			method: 'POST',
			data: { title: table.title, data: table.data, config: table.config }
		} ).then( function ( updated ) {
			state.current = updated;
			state.dirty = false;
			flash( strings.saved || __( 'Saved.', 'wp-tables' ) );
			render();
		} );
	}

	// --- Utils ----------------------------------------------------------------
	function copy( text ) {
		if ( navigator.clipboard && navigator.clipboard.writeText ) {
			navigator.clipboard.writeText( text ).then( function () {
				flash( strings.copied || __( 'Copied.', 'wp-tables' ) );
			} );
		} else {
			var ta = document.createElement( 'textarea' );
			ta.value = text;
			document.body.appendChild( ta );
			ta.select();
			try { document.execCommand( 'copy' ); flash( strings.copied || __( 'Copied.', 'wp-tables' ) ); } catch ( err ) {}
			document.body.removeChild( ta );
		}
	}

	// --- Render orchestrator --------------------------------------------------
	function render() {
		root.innerHTML = '';
		root.appendChild( h( 'div', { class: 'klyna-flash' }, [] ) );
		var body = state.view === 'edit' ? renderEdit() : renderList();
		body.forEach( function ( node ) { root.appendChild( node ); } );
		if ( state.message ) {
			flash( state.message );
			state.message = '';
		}
	}

	// --- Boot -----------------------------------------------------------------
	loadList().catch( function () {
		root.innerHTML = '';
		root.appendChild( h( 'div', { class: 'notice notice-error' }, [
			h( 'p', {}, [ __( 'Could not load tables. Reload the page to try again.', 'wp-tables' ) ] )
		] ) );
	} );
}() );
