/**
 * Klyna Booking — front-end booking flow.
 *
 * Vanilla JS, no jQuery. Drives the multi-step form: service -> date -> slot
 * -> details -> done. All persistence goes through the wp-booking/v1 REST API
 * with a nonce. Each [data-klyna-booking] root on the page gets its own
 * controller, so multiple forms can coexist.
 */
( function () {
	'use strict';

	var boot = window.klynaBookingBoot || {};
	var i18n = boot.i18n || {};

	function api( path, options ) {
		options = options || {};
		var headers = options.headers || {};
		headers[ 'X-WP-Nonce' ] = boot.nonce;
		if ( options.body ) {
			headers[ 'Content-Type' ] = 'application/json';
		}
		return fetch( boot.apiBase + path, {
			method: options.method || 'GET',
			headers: headers,
			credentials: 'same-origin',
			body: options.body ? JSON.stringify( options.body ) : undefined,
		} ).then( function ( res ) {
			return res.json().then( function ( data ) {
				if ( ! res.ok ) {
					var err = new Error( ( data && data.message ) || i18n.genericErr );
					err.data = data;
					throw err;
				}
				return data;
			} );
		} );
	}

	function el( tag, attrs, children ) {
		var node = document.createElement( tag );
		attrs = attrs || {};
		Object.keys( attrs ).forEach( function ( key ) {
			if ( key === 'class' ) {
				node.className = attrs[ key ];
			} else if ( key === 'text' ) {
				node.textContent = attrs[ key ];
			} else if ( key === 'html' ) {
				node.innerHTML = attrs[ key ];
			} else if ( key.indexOf( 'data-' ) === 0 || key === 'type' || key === 'value' || key === 'disabled' ) {
				if ( attrs[ key ] === true ) {
					node.setAttribute( key, '' );
				} else if ( attrs[ key ] !== false ) {
					node.setAttribute( key, attrs[ key ] );
				}
			} else {
				node.setAttribute( key, attrs[ key ] );
			}
		} );
		( children || [] ).forEach( function ( child ) {
			if ( child ) {
				node.appendChild( child );
			}
		} );
		return node;
	}

	function formatDateLabel( iso ) {
		var parts = iso.split( '-' );
		var d = new Date( Date.UTC( +parts[ 0 ], +parts[ 1 ] - 1, +parts[ 2 ] ) );
		try {
			return d.toLocaleDateString( undefined, {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				timeZone: 'UTC',
			} );
		} catch ( e ) {
			return iso;
		}
	}

	function Controller( root ) {
		this.root = root;
		this.state = { service: null, date: null, slot: null };
		this.panels = {};
		this.steps = {};
		var self = this;

		root.querySelectorAll( '[data-panel]' ).forEach( function ( panel ) {
			self.panels[ panel.getAttribute( 'data-panel' ) ] = panel;
		} );
		root.querySelectorAll( '[data-step]' ).forEach( function ( step ) {
			self.steps[ step.getAttribute( 'data-step' ) ] = step;
		} );

		this.bind();

		var preselect = parseInt( root.getAttribute( 'data-preselect' ), 10 );
		if ( preselect ) {
			var btn = root.querySelector( '[data-service="' + preselect + '"]' );
			if ( btn ) {
				btn.click();
			}
		}
	}

	Controller.prototype.show = function ( name ) {
		Object.keys( this.panels ).forEach( function ( key ) {
			this.panels[ key ].hidden = key !== name;
		}, this );
		Object.keys( this.steps ).forEach( function ( key ) {
			this.steps[ key ].classList.toggle( 'is-active', key === name );
		}, this );
	};

	Controller.prototype.bind = function () {
		var self = this;

		this.root.querySelectorAll( '[data-service]' ).forEach( function ( btn ) {
			btn.addEventListener( 'click', function () {
				self.root.querySelectorAll( '[data-service]' ).forEach( function ( b ) {
					b.classList.remove( 'is-selected' );
				} );
				btn.classList.add( 'is-selected' );
				self.state.service = {
					id: parseInt( btn.getAttribute( 'data-service' ), 10 ),
					name: btn.querySelector( '.klyna-booking__service-name' ).textContent,
				};
				self.state.slot = null;
				self.loadDates();
				self.show( 'time' );
			} );
		} );

		this.root.querySelectorAll( '[data-back]' ).forEach( function ( btn ) {
			btn.addEventListener( 'click', function () {
				self.show( btn.getAttribute( 'data-back' ) );
			} );
		} );

		var form = this.root.querySelector( '[data-form]' );
		if ( form ) {
			form.addEventListener( 'submit', function ( e ) {
				e.preventDefault();
				self.submit( form );
			} );
		}
	};

	Controller.prototype.loadDates = function () {
		var self = this;
		var wrap = this.root.querySelector( '[data-dates]' );
		var slots = this.root.querySelector( '[data-slots]' );
		wrap.innerHTML = '';
		slots.innerHTML = '<p class="klyna-booking__hint">' + ( i18n.pickDate || '' ) + '</p>';

		api( '/services' ).then( function ( data ) {
			var dates = data.dates || [];
			if ( ! dates.length ) {
				wrap.appendChild( el( 'p', { class: 'klyna-booking__hint', text: i18n.noSlots } ) );
				return;
			}
			dates.forEach( function ( iso ) {
				var btn = el( 'button', {
					type: 'button',
					class: 'klyna-booking__date',
					'data-date': iso,
					text: formatDateLabel( iso ),
				} );
				btn.addEventListener( 'click', function () {
					wrap.querySelectorAll( '.klyna-booking__date' ).forEach( function ( b ) {
						b.classList.remove( 'is-selected' );
					} );
					btn.classList.add( 'is-selected' );
					self.state.date = iso;
					self.loadSlots( iso );
				} );
				wrap.appendChild( btn );
			} );
		} );
	};

	Controller.prototype.loadSlots = function ( iso ) {
		var self = this;
		var slots = this.root.querySelector( '[data-slots]' );
		slots.innerHTML = '<p class="klyna-booking__hint">' + ( i18n.loading || '' ) + '</p>';

		api( '/slots?service=' + this.state.service.id + '&date=' + encodeURIComponent( iso ) )
			.then( function ( data ) {
				slots.innerHTML = '';
				if ( ! data.slots || ! data.slots.length ) {
					slots.appendChild( el( 'p', { class: 'klyna-booking__hint', text: i18n.noSlots } ) );
					return;
				}
				data.slots.forEach( function ( slot ) {
					var btn = el( 'button', {
						type: 'button',
						class: 'klyna-booking__slot',
						text: slot.label,
					} );
					btn.addEventListener( 'click', function () {
						self.state.slot = slot;
						self.openDetails();
					} );
					slots.appendChild( btn );
				} );
			} )
			.catch( function () {
				slots.innerHTML = '';
				slots.appendChild( el( 'p', { class: 'klyna-booking__hint', text: i18n.genericErr } ) );
			} );
	};

	Controller.prototype.openDetails = function () {
		var summary = this.root.querySelector( '[data-summary]' );
		if ( summary ) {
			summary.textContent =
				this.state.service.name +
				' · ' +
				formatDateLabel( this.state.date ) +
				' · ' +
				this.state.slot.label;
		}
		this.show( 'details' );
	};

	Controller.prototype.submit = function ( form ) {
		var self = this;
		var errBox = this.root.querySelector( '[data-error]' );
		var submit = form.querySelector( '.klyna-booking__submit' );
		var submitLabel = submit.getAttribute( 'data-label' ) || submit.textContent;
		errBox.hidden = true;

		var payload = {
			service_id: this.state.service.id,
			start: this.state.slot.start,
			name: form.name.value.trim(),
			email: form.email.value.trim(),
			phone: form.phone.value.trim(),
			notes: form.notes.value.trim(),
		};

		if ( ! payload.name || ! payload.email ) {
			errBox.textContent = i18n.genericErr;
			errBox.hidden = false;
			return;
		}

		submit.disabled = true;
		submit.textContent = i18n.submitting || '…';

		api( '/bookings', { method: 'POST', body: payload } )
			.then( function ( data ) {
				self.root.querySelector( '[data-done-title]' ).textContent = data.when || '';
				self.root.querySelector( '[data-done-message]' ).textContent = data.message || '';
				self.show( 'done' );
			} )
			.catch( function ( err ) {
				errBox.textContent = err.message || i18n.genericErr;
				errBox.hidden = false;
				submit.disabled = false;
				submit.textContent = submitLabel;
			} );
	};

	function init() {
		document.querySelectorAll( '[data-klyna-booking]' ).forEach( function ( root ) {
			// Capture each submit button's original label for restore-on-error.
			var submit = root.querySelector( '.klyna-booking__submit' );
			if ( submit ) {
				submit.setAttribute( 'data-label', submit.textContent );
			}
			new Controller( root );
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
