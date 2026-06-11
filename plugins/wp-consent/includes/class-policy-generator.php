<?php
/**
 * Cookie Policy generator — killer feature.
 *
 * Reads the site locale and enumerates cookies from active plugins,
 * sends a structured prompt to the configured AI provider, and saves
 * the returned policy as a draft Page in WordPress.
 *
 * @package KlynaConsent
 */

namespace KlynaConsent;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class PolicyGenerator {

	/**
	 * Generate a cookie policy and save as a draft Page.
	 *
	 * @return array{ok:bool, post_id?:int, edit_url?:string, reason?:string, text?:string}
	 */
	public static function generate(): array {
		if ( ! current_user_can( 'manage_options' ) ) {
			return array( 'ok' => false, 'reason' => 'forbidden', 'text' => 'Insufficient permissions.' );
		}

		if ( ! Ai::is_configured() ) {
			return array( 'ok' => false, 'reason' => 'ai_not_configured', 'text' => 'Configure the AI assistant first.' );
		}

		$locale       = self::detect_locale();
		$language     = self::locale_to_language( $locale );
		$site_name    = get_bloginfo( 'name' );
		$site_url     = home_url( '/' );
		$plugins      = self::active_plugin_names();
		$cookies      = self::enumerate_cookies( $plugins );
		$settings     = Plugin::settings();

		$categories_on = array();
		if ( ! empty( $settings['enable_analytics'] ) ) {
			$categories_on[] = 'analytics';
		}
		if ( ! empty( $settings['enable_marketing'] ) ) {
			$categories_on[] = 'marketing';
		}
		if ( ! empty( $settings['enable_preferences'] ) ) {
			$categories_on[] = 'preferences';
		}
		$categories_on[] = 'necessary';

		$prompt = self::build_prompt( $language, $site_name, $site_url, $plugins, $cookies, $categories_on );

		$ai     = new Ai();
		$result = $ai->complete( $prompt, array( 'max_tokens' => 1200, 'temperature' => 0.4 ) );

		if ( empty( $result['ok'] ) || empty( $result['text'] ) ) {
			return array(
				'ok'     => false,
				'reason' => $result['reason'] ?? 'ai_failed',
				'text'   => $result['text'] ?? 'AI did not return a policy.',
			);
		}

		$body = self::format_to_html( (string) $result['text'] );

		$title = sprintf(
			/* translators: %s: site name */
			__( 'Cookie Policy for %s', 'wp-consent' ),
			$site_name
		);

		$post_id = wp_insert_post(
			array(
				'post_title'   => $title,
				'post_content' => $body,
				'post_status'  => 'draft',
				'post_type'    => 'page',
				'post_author'  => get_current_user_id(),
			),
			true
		);

		if ( is_wp_error( $post_id ) ) {
			return array( 'ok' => false, 'reason' => 'insert_failed', 'text' => $post_id->get_error_message() );
		}

		update_post_meta( (int) $post_id, '_wp_consent_generated', 1 );
		update_post_meta( (int) $post_id, '_wp_consent_locale', $locale );

		return array(
			'ok'       => true,
			'post_id'  => (int) $post_id,
			'edit_url' => get_edit_post_link( (int) $post_id, 'raw' ),
		);
	}

	private static function detect_locale(): string {
		$locale = get_locale();
		if ( ! is_string( $locale ) || '' === $locale ) {
			$locale = 'en_US';
		}
		return $locale;
	}

	private static function locale_to_language( string $locale ): string {
		// Map common WP locales to human language names.
		$map = array(
			'en_US' => 'English (US)',
			'en_GB' => 'English (UK)',
			'en_CA' => 'English (Canada)',
			'en_AU' => 'English (Australia)',
			'de_DE' => 'German',
			'de_AT' => 'German (Austria)',
			'de_CH' => 'German (Switzerland)',
			'fr_FR' => 'French',
			'fr_CA' => 'French (Canada)',
			'fr_BE' => 'French (Belgium)',
			'es_ES' => 'Spanish (Spain)',
			'es_MX' => 'Spanish (Mexico)',
			'es_AR' => 'Spanish (Argentina)',
			'it_IT' => 'Italian',
			'pt_PT' => 'Portuguese (Portugal)',
			'pt_BR' => 'Portuguese (Brazil)',
			'nl_NL' => 'Dutch',
			'nl_BE' => 'Dutch (Belgium)',
			'pl_PL' => 'Polish',
			'sv_SE' => 'Swedish',
			'da_DK' => 'Danish',
			'fi'    => 'Finnish',
			'nb_NO' => 'Norwegian',
			'cs_CZ' => 'Czech',
			'sk_SK' => 'Slovak',
			'ro_RO' => 'Romanian',
			'hu_HU' => 'Hungarian',
			'el'    => 'Greek',
			'bg_BG' => 'Bulgarian',
			'hr'    => 'Croatian',
			'sl_SI' => 'Slovenian',
			'lt_LT' => 'Lithuanian',
			'lv'    => 'Latvian',
			'et'    => 'Estonian',
			'ja'    => 'Japanese',
			'ko_KR' => 'Korean',
			'zh_CN' => 'Chinese (Simplified)',
			'zh_TW' => 'Chinese (Traditional)',
			'ru_RU' => 'Russian',
			'uk'    => 'Ukrainian',
			'tr_TR' => 'Turkish',
			'ar'    => 'Arabic',
			'he_IL' => 'Hebrew',
		);
		if ( isset( $map[ $locale ] ) ) {
			return $map[ $locale ];
		}
		// Fallback: take prefix before underscore.
		$prefix = strtolower( substr( $locale, 0, 2 ) );
		$prefix_map = array(
			'en' => 'English', 'de' => 'German', 'fr' => 'French',
			'es' => 'Spanish', 'it' => 'Italian', 'pt' => 'Portuguese',
			'nl' => 'Dutch', 'pl' => 'Polish', 'sv' => 'Swedish',
			'da' => 'Danish', 'fi' => 'Finnish', 'no' => 'Norwegian',
			'nb' => 'Norwegian', 'cs' => 'Czech', 'sk' => 'Slovak',
			'ro' => 'Romanian', 'hu' => 'Hungarian', 'el' => 'Greek',
			'bg' => 'Bulgarian', 'hr' => 'Croatian', 'sl' => 'Slovenian',
			'lt' => 'Lithuanian', 'lv' => 'Latvian', 'et' => 'Estonian',
			'ja' => 'Japanese', 'ko' => 'Korean', 'zh' => 'Chinese',
			'ru' => 'Russian', 'uk' => 'Ukrainian', 'tr' => 'Turkish',
			'ar' => 'Arabic', 'he' => 'Hebrew',
		);
		return $prefix_map[ $prefix ] ?? 'English';
	}

	/**
	 * @return string[] Display names of active plugins.
	 */
	private static function active_plugin_names(): array {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$all    = get_plugins();
		$active = (array) get_option( 'active_plugins', array() );
		$names  = array();
		foreach ( $active as $file ) {
			if ( isset( $all[ $file ]['Name'] ) ) {
				$names[] = (string) $all[ $file ]['Name'];
			}
		}
		// Network-active plugins.
		if ( is_multisite() ) {
			$net = (array) get_site_option( 'active_sitewide_plugins', array() );
			foreach ( array_keys( $net ) as $file ) {
				if ( isset( $all[ $file ]['Name'] ) ) {
					$names[] = (string) $all[ $file ]['Name'];
				}
			}
		}
		return array_values( array_unique( $names ) );
	}

	/**
	 * Best-effort enumeration of cookies set by active plugins.
	 * Uses known signatures + the current request's cookie jar.
	 *
	 * @param string[] $plugin_names
	 * @return array<int,array{name:string, purpose:string, category:string}>
	 */
	private static function enumerate_cookies( array $plugin_names ): array {
		$cookies = array();

		// Always-present WordPress / consent cookies.
		$cookies[] = array(
			'name'     => 'wp_consent_choice',
			'purpose'  => 'Stores the visitor consent decision (necessary / analytics / marketing / preferences).',
			'category' => 'necessary',
		);
		$cookies[] = array(
			'name'     => 'wordpress_logged_in_*',
			'purpose'  => 'WordPress core authentication cookie set when a user logs in.',
			'category' => 'necessary',
		);
		$cookies[] = array(
			'name'     => 'wp-settings-*',
			'purpose'  => 'WordPress core cookie storing admin UI preferences for logged-in users.',
			'category' => 'preferences',
		);

		// Signature map: plugin display name (substring, case-insensitive) -> cookies.
		$sig = array(
			'WooCommerce' => array(
				array( 'woocommerce_cart_hash', 'Tracks the contents of the shopping cart.', 'necessary' ),
				array( 'woocommerce_items_in_cart', 'Tracks the contents of the shopping cart.', 'necessary' ),
				array( 'wp_woocommerce_session_*', 'Identifies the cart session for guest checkout.', 'necessary' ),
			),
			'Easy Digital Downloads' => array(
				array( 'edd_items_in_cart', 'Tracks items in the EDD shopping cart.', 'necessary' ),
			),
			'Yoast SEO' => array(),
			'Google Analytics' => array(
				array( '_ga', 'Google Analytics — distinguishes unique visitors.', 'analytics' ),
				array( '_ga_*', 'Google Analytics 4 — session state for a specific property.', 'analytics' ),
				array( '_gid', 'Google Analytics — distinguishes users for 24 hours.', 'analytics' ),
			),
			'MonsterInsights' => array(
				array( '_ga', 'Google Analytics — distinguishes unique visitors.', 'analytics' ),
				array( '_ga_*', 'Google Analytics 4 — session state.', 'analytics' ),
			),
			'GA4' => array(
				array( '_ga', 'Google Analytics 4 client identifier.', 'analytics' ),
				array( '_ga_*', 'Google Analytics 4 session state.', 'analytics' ),
			),
			'Matomo' => array(
				array( '_pk_id.*', 'Matomo — stores a unique visitor ID.', 'analytics' ),
				array( '_pk_ses.*', 'Matomo — short-lived session cookie.', 'analytics' ),
			),
			'Facebook' => array(
				array( '_fbp', 'Meta Pixel — identifies browsers for ad delivery.', 'marketing' ),
			),
			'Meta Pixel' => array(
				array( '_fbp', 'Meta Pixel — identifies browsers for ad delivery.', 'marketing' ),
			),
			'TikTok' => array(
				array( '_ttp', 'TikTok Pixel — tracks ad conversions.', 'marketing' ),
			),
			'HubSpot' => array(
				array( '__hssc', 'HubSpot — session tracking.', 'analytics' ),
				array( '__hstc', 'HubSpot — long-term visitor tracking.', 'analytics' ),
				array( 'hubspotutk', 'HubSpot — visitor identifier for lead attribution.', 'marketing' ),
			),
			'Hotjar' => array(
				array( '_hjSession*', 'Hotjar — session state for behavioural analytics.', 'analytics' ),
			),
			'Cloudflare' => array(
				array( '__cf_bm', 'Cloudflare bot management cookie.', 'necessary' ),
			),
			'Akismet' => array(
				array( 'akm_mobile', 'Akismet — remembers the mobile view choice.', 'preferences' ),
			),
			'Contact Form 7' => array(),
			'Gravity Forms' => array(
				array( 'gf_*', 'Gravity Forms — tracks form session state.', 'necessary' ),
			),
			'WPML' => array(
				array( 'wpml_*', 'WPML — stores the visitor language choice.', 'preferences' ),
			),
			'Polylang' => array(
				array( 'pll_language', 'Polylang — stores the visitor language choice.', 'preferences' ),
			),
		);

		$haystack = strtolower( implode( ' | ', $plugin_names ) );
		foreach ( $sig as $needle => $list ) {
			if ( '' === $needle || empty( $list ) ) {
				continue;
			}
			if ( strpos( $haystack, strtolower( $needle ) ) !== false ) {
				foreach ( $list as $row ) {
					$cookies[] = array(
						'name'     => (string) $row[0],
						'purpose'  => (string) $row[1],
						'category' => (string) $row[2],
					);
				}
			}
		}

		// Live cookies on the current request (best-effort observation).
		if ( ! empty( $_COOKIE ) && is_array( $_COOKIE ) ) {
			$known = array();
			foreach ( $cookies as $c ) {
				$known[] = strtolower( str_replace( '*', '', $c['name'] ) );
			}
			foreach ( array_keys( $_COOKIE ) as $name ) {
				$name = (string) $name;
				if ( '' === $name ) {
					continue;
				}
				$lower = strtolower( $name );
				$skip  = false;
				foreach ( $known as $k ) {
					if ( '' !== $k && strpos( $lower, $k ) === 0 ) {
						$skip = true;
						break;
					}
				}
				if ( $skip ) {
					continue;
				}
				$cookies[] = array(
					'name'     => sanitize_text_field( $name ),
					'purpose'  => 'Detected on this site; purpose not in the built-in catalogue.',
					'category' => 'necessary',
				);
			}
		}

		// De-dupe by name.
		$seen = array();
		$out  = array();
		foreach ( $cookies as $c ) {
			$k = strtolower( $c['name'] );
			if ( isset( $seen[ $k ] ) ) {
				continue;
			}
			$seen[ $k ] = true;
			$out[]      = $c;
		}
		return $out;
	}

	/**
	 * @param array<int,array{name:string,purpose:string,category:string}> $cookies
	 * @param string[] $plugins
	 * @param string[] $categories_on
	 */
	private static function build_prompt(
		string $language,
		string $site_name,
		string $site_url,
		array $plugins,
		array $cookies,
		array $categories_on
	): string {
		$cookie_lines = array();
		foreach ( $cookies as $c ) {
			$cookie_lines[] = '- ' . $c['name'] . ' (' . $c['category'] . '): ' . $c['purpose'];
		}
		$cookie_block = $cookie_lines ? implode( "\n", $cookie_lines ) : '(no specific cookies detected)';

		$plugin_block = $plugins ? implode( ', ', array_slice( $plugins, 0, 25 ) ) : '(none reported)';
		$cat_block    = implode( ', ', array_unique( $categories_on ) );

		return implode(
			"\n",
			array(
				'Write a GDPR-compliant cookie policy of approximately 300 words for the website below.',
				'',
				'OUTPUT LANGUAGE: ' . $language . ' (translate every sentence into this language, including section headings).',
				'',
				'SITE NAME: ' . $site_name,
				'SITE URL: ' . $site_url,
				'ACTIVE PLUGINS: ' . $plugin_block,
				'ENABLED COOKIE CATEGORIES: ' . $cat_block,
				'',
				'COOKIES IN USE:',
				$cookie_block,
				'',
				'STRUCTURE — produce exactly these three sections, in this order, each as an H2 heading translated into the output language:',
				'1. What are cookies — short plain-language definition.',
				'2. Categories — describe each enabled category (necessary, analytics, marketing, preferences) and list the specific cookies above that belong to it, as a bullet list with name and purpose.',
				'3. How to disable — explain the in-banner "Manage Preferences" option and link to common browser settings (Chrome, Firefox, Safari, Edge) as plain text.',
				'',
				'RULES:',
				'- Use HTML only: <h2>, <p>, <ul>, <li>, <strong>. No <html>, <body>, no markdown, no code fences.',
				'- Do not invent cookies that are not in the list.',
				'- Do not promise specific retention periods unless they are universally known.',
				'- Do not include legal disclaimers about consulting a lawyer.',
				'- Total length: target 300 words.',
				'- Start directly with the first <h2>. No preamble.',
			)
		);
	}

	/**
	 * Lightly post-process AI output: strip code fences, ensure paragraphs.
	 */
	private static function format_to_html( string $raw ): string {
		$raw = trim( $raw );
		// Strip ``` fences if present.
		$raw = (string) preg_replace( '/^```[a-zA-Z]*\s*/m', '', $raw );
		$raw = (string) preg_replace( '/```\s*$/m', '', $raw );
		// Allow only a safe subset of HTML.
		$allowed = array(
			'h2'     => array(),
			'h3'     => array(),
			'p'      => array(),
			'ul'     => array(),
			'ol'     => array(),
			'li'     => array(),
			'strong' => array(),
			'em'     => array(),
			'a'      => array( 'href' => array(), 'rel' => array(), 'target' => array() ),
			'br'     => array(),
		);
		return wp_kses( $raw, $allowed );
	}
}
