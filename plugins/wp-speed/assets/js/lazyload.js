/**
 * Klyna Speed — lazy-load progressive enhancement.
 *
 * Modern browsers handle loading="lazy" natively, so this script only does
 * work where that attribute is unsupported. It upgrades any element carrying
 * a data-klyna-src placeholder once it scrolls into view, using
 * IntersectionObserver. Pure vanilla JS, no dependencies.
 */
( function () {
	'use strict';

	var supportsNativeLazy = 'loading' in HTMLImageElement.prototype;

	function swap( el ) {
		var src = el.getAttribute( 'data-klyna-src' );
		if ( src ) {
			el.setAttribute( 'src', src );
			el.removeAttribute( 'data-klyna-src' );
		}
		var srcset = el.getAttribute( 'data-klyna-srcset' );
		if ( srcset ) {
			el.setAttribute( 'srcset', srcset );
			el.removeAttribute( 'data-klyna-srcset' );
		}
		el.classList.add( 'klyna-loaded' );
	}

	function run() {
		var nodes = document.querySelectorAll( '[data-klyna-src], [data-klyna-srcset]' );
		if ( ! nodes.length ) {
			return;
		}

		// If the browser lazy-loads natively, just hydrate everything immediately.
		if ( supportsNativeLazy || ! ( 'IntersectionObserver' in window ) ) {
			Array.prototype.forEach.call( nodes, swap );
			return;
		}

		var observer = new IntersectionObserver(
			function ( entries, obs ) {
				entries.forEach( function ( entry ) {
					if ( entry.isIntersecting ) {
						swap( entry.target );
						obs.unobserve( entry.target );
					}
				} );
			},
			{ rootMargin: '200px 0px' }
		);

		Array.prototype.forEach.call( nodes, function ( node ) {
			observer.observe( node );
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', run );
	} else {
		run();
	}
} )();
