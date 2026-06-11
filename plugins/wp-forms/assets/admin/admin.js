/**
 * Klyna Forms — admin builder interactions.
 *
 * Adds, removes, and reorders field rows in the form builder. Reorder uses the
 * native HTML drag-and-drop API; field indices are re-stamped on every change
 * so the parallel `fields[i][...]` POST names stay contiguous. Pure vanilla JS.
 */
( function () {
	'use strict';

	var i18n = ( window.KlynaFormsAdmin && window.KlynaFormsAdmin.i18n ) || {};

	function ready( fn ) {
		if ( document.readyState !== 'loading' ) {
			fn();
		} else {
			document.addEventListener( 'DOMContentLoaded', fn );
		}
	}

	/**
	 * Re-number every field row so input names are fields[0..n].
	 */
	function reindex( container ) {
		var rows = container.querySelectorAll( '.klyna-forms-field-row' );
		rows.forEach( function ( row, index ) {
			row.setAttribute( 'data-index', index );
			row.querySelectorAll( '[name]' ).forEach( function ( input ) {
				input.name = input.name.replace( /fields\[[^\]]*\]/, 'fields[' + index + ']' );
			} );
		} );
	}

	/**
	 * Show or hide the "Options" textarea based on the chosen field type.
	 */
	function syncOptionsVisibility( row ) {
		var type = row.querySelector( '.klyna-forms-field-type' );
		var optionsWrap = row.querySelector( '.klyna-forms-options-wrap' );
		if ( ! type || ! optionsWrap ) {
			return;
		}
		var withOptions = [ 'select', 'radio', 'checkbox' ];
		if ( withOptions.indexOf( type.value ) !== -1 ) {
			optionsWrap.removeAttribute( 'hidden' );
		} else {
			optionsWrap.setAttribute( 'hidden', 'hidden' );
		}
	}

	function bindRow( row, container ) {
		var type = row.querySelector( '.klyna-forms-field-type' );
		if ( type ) {
			type.addEventListener( 'change', function () {
				syncOptionsVisibility( row );
			} );
		}

		var remove = row.querySelector( '.klyna-forms-remove-field' );
		if ( remove ) {
			remove.addEventListener( 'click', function () {
				if ( window.confirm( i18n.confirmDelete || 'Delete this field?' ) ) {
					row.parentNode.removeChild( row );
					reindex( container );
				}
			} );
		}

		bindDrag( row, container );
		syncOptionsVisibility( row );
	}

	var dragged = null;

	function bindDrag( row, container ) {
		var handle = row.querySelector( '.klyna-forms-field-row__handle' );
		if ( ! handle ) {
			return;
		}
		handle.setAttribute( 'draggable', 'true' );

		handle.addEventListener( 'dragstart', function ( e ) {
			dragged = row;
			row.classList.add( 'is-dragging' );
			e.dataTransfer.effectAllowed = 'move';
		} );

		handle.addEventListener( 'dragend', function () {
			if ( dragged ) {
				dragged.classList.remove( 'is-dragging' );
			}
			container.querySelectorAll( '.is-drop-target' ).forEach( function ( n ) {
				n.classList.remove( 'is-drop-target' );
			} );
			dragged = null;
			reindex( container );
		} );

		row.addEventListener( 'dragover', function ( e ) {
			if ( ! dragged || dragged === row ) {
				return;
			}
			e.preventDefault();
			row.classList.add( 'is-drop-target' );
		} );

		row.addEventListener( 'dragleave', function () {
			row.classList.remove( 'is-drop-target' );
		} );

		row.addEventListener( 'drop', function ( e ) {
			e.preventDefault();
			row.classList.remove( 'is-drop-target' );
			if ( ! dragged || dragged === row ) {
				return;
			}
			var rows = Array.prototype.slice.call( container.querySelectorAll( '.klyna-forms-field-row' ) );
			var from = rows.indexOf( dragged );
			var to = rows.indexOf( row );
			if ( from < to ) {
				container.insertBefore( dragged, row.nextSibling );
			} else {
				container.insertBefore( dragged, row );
			}
			reindex( container );
		} );
	}

	function addField( container, template ) {
		var index = container.querySelectorAll( '.klyna-forms-field-row' ).length;
		var html = template.replace( /__INDEX__/g, String( index ) );
		var wrapper = document.createElement( 'div' );
		wrapper.innerHTML = html.trim();
		var row = wrapper.firstChild;
		container.appendChild( row );
		bindRow( row, container );
		var label = row.querySelector( '.klyna-forms-field-label' );
		if ( label ) {
			label.focus();
		}
	}

	ready( function () {
		var container = document.getElementById( 'klyna-forms-fields' );
		var addBtn = document.getElementById( 'klyna-forms-add-field' );
		var templateEl = document.getElementById( 'klyna-forms-field-template' );
		if ( ! container ) {
			return;
		}

		// Bind existing (server-rendered) rows.
		container.querySelectorAll( '.klyna-forms-field-row' ).forEach( function ( row ) {
			bindRow( row, container );
		} );

		if ( addBtn && templateEl ) {
			addBtn.addEventListener( 'click', function () {
				addField( container, templateEl.innerHTML );
			} );
		}

		// Toggle success-action panels (message vs redirect).
		var action = document.querySelector( '.klyna-forms-success-action' );
		var messageBlock = document.querySelector( '.klyna-forms-when-message' );
		var redirectBlock = document.querySelector( '.klyna-forms-when-redirect' );

		function syncSuccess() {
			if ( ! action ) {
				return;
			}
			var isRedirect = action.value === 'redirect';
			if ( messageBlock ) {
				messageBlock.style.display = isRedirect ? 'none' : '';
			}
			if ( redirectBlock ) {
				redirectBlock.style.display = isRedirect ? '' : 'none';
			}
		}

		if ( action ) {
			action.addEventListener( 'change', syncSuccess );
			syncSuccess();
		}
	} );
} )();
