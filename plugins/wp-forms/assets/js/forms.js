/**
 * Klyna Forms — front-end submit handler.
 *
 * Progressive enhancement: the form is a normal POST-capable <form>, but when
 * JS is present we intercept the submit, post JSON to the REST endpoint, and
 * render inline validation errors / success states without a page reload.
 *
 * No jQuery, no build step — plain ES2017 that ships as-is.
 */
( function () {
	'use strict';

	var cfg = window.KlynaForms || {};
	var i18n = cfg.i18n || {};

	function ready( fn ) {
		if ( document.readyState !== 'loading' ) {
			fn();
		} else {
			document.addEventListener( 'DOMContentLoaded', fn );
		}
	}

	function setStatus( form, type, message ) {
		var el = form.querySelector( '.klyna-form__status' );
		if ( ! el ) {
			return;
		}
		el.hidden = false;
		el.className = 'klyna-form__status klyna-form__status--' + type;
		el.innerHTML = message;
	}

	function clearErrors( form ) {
		form.querySelectorAll( '.klyna-form__field-error' ).forEach( function ( n ) {
			n.parentNode.removeChild( n );
		} );
		form.querySelectorAll( '[aria-invalid="true"]' ).forEach( function ( n ) {
			n.removeAttribute( 'aria-invalid' );
		} );
	}

	function showFieldErrors( form, errors ) {
		Object.keys( errors ).forEach( function ( key ) {
			var input = form.querySelector( '[name="fields[' + key + ']"], [name="fields[' + key + '][]"]' );
			if ( ! input ) {
				return;
			}
			input.setAttribute( 'aria-invalid', 'true' );
			var field = input.closest( '.klyna-form__field' );
			if ( ! field ) {
				return;
			}
			var note = document.createElement( 'span' );
			note.className = 'klyna-form__field-error';
			note.textContent = errors[ key ];
			field.appendChild( note );
		} );
	}

	function submit( form ) {
		clearErrors( form );

		var button = form.querySelector( '.klyna-form__submit' );
		var originalLabel = button ? button.textContent : '';
		if ( button ) {
			button.disabled = true;
			button.textContent = i18n.sending || 'Sending…';
		}

		var data = new FormData( form );

		fetch( cfg.endpoint, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': cfg.nonce },
			body: data
		} )
			.then( function ( res ) {
				return res.json().then( function ( body ) {
					return { ok: res.ok, status: res.status, body: body };
				} );
			} )
			.then( function ( result ) {
				var body = result.body || {};

				if ( result.ok && body.success ) {
					if ( body.action === 'redirect' && body.redirect ) {
						window.location.href = body.redirect;
						return;
					}
					form.reset();
					form.style.display = 'none';
					setStatus( form, 'success', body.message || '' );
					// Re-attach a standalone status element above the hidden form.
					var status = form.querySelector( '.klyna-form__status' );
					if ( status ) {
						form.parentNode.insertBefore( status, form );
					}
					return;
				}

				if ( body.errors ) {
					showFieldErrors( form, body.errors );
				}
				setStatus( form, 'error', body.message || i18n.error || 'Something went wrong.' );
			} )
			.catch( function () {
				setStatus( form, 'error', i18n.error || 'Something went wrong.' );
			} )
			.finally( function () {
				if ( button ) {
					button.disabled = false;
					button.textContent = originalLabel;
				}
			} );
	}

	ready( function () {
		var forms = document.querySelectorAll( '.klyna-form' );
		forms.forEach( function ( form ) {
			form.addEventListener( 'submit', function ( e ) {
				e.preventDefault();
				submit( form );
			} );
		} );
	} );
} )();
