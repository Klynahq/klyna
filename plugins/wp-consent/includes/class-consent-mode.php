<?php
/**
 * Google Consent Mode v2 — emits the default dataLayer snippet in <head>.
 *
 * The snippet is emitted as early as possible so it precedes any GA/GTM tags.
 * Default state: all consent types denied.
 * After the user accepts/rejects, banner.js fires the update signals.
 *
 * @package KlynaConsent
 */

namespace KlynaConsent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Outputs the Google Consent Mode v2 default dataLayer push in wp_head.
 */
final class ConsentMode {

	public function register(): void {
		$settings = Plugin::settings();
		if ( empty( $settings['google_consent_mode'] ) ) {
			return;
		}
		// Priority 1 — before any GTM/GA snippet (typically added at priority 10+).
		add_action( 'wp_head', array( $this, 'emit_default_snippet' ), 1 );
	}

	/**
	 * Outputs the inline <script> with GCM v2 defaults.
	 */
	public function emit_default_snippet(): void {
		?>
<!-- Klyna Consent: Google Consent Mode v2 defaults -->
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{
	'analytics_storage':      'denied',
	'ad_storage':             'denied',
	'ad_user_data':           'denied',
	'ad_personalization':     'denied',
	'functionality_storage':  'denied',
	'personalization_storage':'denied',
	'wait_for_update':        500
});
gtag('set','ads_data_redaction', true);
gtag('set','url_passthrough', true);
</script>
		<?php
	}
}
