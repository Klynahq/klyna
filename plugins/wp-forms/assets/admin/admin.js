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

/* AI assistant + reply drafts (added by AI auto-reply feature). */
( function () {
	var data = window.KlynaFormsAdmin || {};
	if ( ! data.restUrl ) { return; }
	var i18n = data.i18n || {};

	function rest( path, body ) {
		return fetch( data.restUrl + path, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': data.nonce
			},
			body: JSON.stringify( body || {} )
		} ).then( function ( r ) {
			return r.json().then( function ( j ) { return { status: r.status, body: j }; } );
		} );
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		var testBtn = document.getElementById( 'klyna-forms-ai-test' );
		var testOut = document.getElementById( 'klyna-forms-ai-test-result' );
		if ( testBtn && testOut ) {
			testBtn.addEventListener( 'click', function () {
				testOut.textContent = i18n.testing || 'Testing...';
				rest( 'ai/test', {} ).then( function ( res ) {
					if ( res.body && res.body.ok ) {
						testOut.textContent = ( i18n.testOk || 'OK' ) + ' ' + ( res.body.text || '' );
					} else {
						testOut.textContent = ( i18n.testFail || 'Failed:' ) + ' ' + ( ( res.body && ( res.body.text || res.body.reason ) ) || 'unknown' );
					}
				} ).catch( function ( e ) {
					testOut.textContent = ( i18n.testFail || 'Failed:' ) + ' ' + e.message;
				} );
			} );
		}

		var blocks = document.querySelectorAll( '.klyna-forms-reply' );
		blocks.forEach( function ( block ) {
			var entryId = parseInt( block.getAttribute( 'data-entry-id' ), 10 );
			var replyIdAttr = block.getAttribute( 'data-reply-id' );
			var replyId = replyIdAttr ? parseInt( replyIdAttr, 10 ) : 0;
			var toEl   = block.querySelector( '.klyna-forms-reply__to' );
			var subjEl = block.querySelector( '.klyna-forms-reply__subject' );
			var bodyEl = block.querySelector( '.klyna-forms-reply__body-text' );
			var statusEl = block.querySelector( '.klyna-forms-reply__status' );
			var genBtn  = block.querySelector( '.klyna-forms-reply__generate' );
			var saveBtn = block.querySelector( '.klyna-forms-reply__save' );
			var sendBtn = block.querySelector( '.klyna-forms-reply__send' );

			function setStatus( msg ) { if ( statusEl ) { statusEl.textContent = msg || ''; } }

			if ( genBtn ) {
				genBtn.addEventListener( 'click', function () {
					setStatus( i18n.generating || 'Generating...' );
					rest( 'replies/generate', { entry_id: entryId } ).then( function ( res ) {
						if ( res.body && res.body.ok ) {
							if ( bodyEl ) { bodyEl.value = res.body.text || ''; }
							if ( res.body.reply_id ) {
								replyId = parseInt( res.body.reply_id, 10 );
								block.setAttribute( 'data-reply-id', String( replyId ) );
								if ( saveBtn ) { saveBtn.disabled = false; }
								if ( sendBtn ) { sendBtn.disabled = false; }
							}
							setStatus( i18n.saved || 'Saved.' );
						} else {
							setStatus( ( res.body && ( res.body.text || res.body.reason ) ) || 'error' );
						}
					} ).catch( function ( e ) { setStatus( e.message ); } );
				} );
			}

			if ( saveBtn ) {
				saveBtn.addEventListener( 'click', function () {
					if ( ! replyId ) { return; }
					rest( 'replies/' + replyId, {
						to_email: toEl ? toEl.value : '',
						subject: subjEl ? subjEl.value : '',
						body: bodyEl ? bodyEl.value : ''
					} ).then( function ( res ) {
						setStatus( ( res.body && res.body.ok ) ? ( i18n.saved || 'Saved.' ) : 'error' );
					} ).catch( function ( e ) { setStatus( e.message ); } );
				} );
			}

			if ( sendBtn ) {
				sendBtn.addEventListener( 'click', function () {
					if ( ! replyId ) { return; }
					setStatus( i18n.sending || 'Sending...' );
					// Save first, then send.
					rest( 'replies/' + replyId, {
						to_email: toEl ? toEl.value : '',
						subject: subjEl ? subjEl.value : '',
						body: bodyEl ? bodyEl.value : ''
					} ).then( function () {
						return rest( 'replies/' + replyId + '/send', {} );
					} ).then( function ( res ) {
						if ( res.body && res.body.ok ) {
							setStatus( i18n.sent || 'Sent.' );
							if ( sendBtn ) { sendBtn.disabled = true; }
						} else {
							setStatus( ( res.body && ( res.body.text || res.body.reason ) ) || 'error' );
						}
					} ).catch( function ( e ) { setStatus( e.message ); } );
				} );
			}
		} );
	} );
} )();
