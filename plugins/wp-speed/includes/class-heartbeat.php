<?php
/**
 * WordPress Heartbeat throttling.
 *
 * The Heartbeat API polls admin-ajax.php on a fixed interval, which adds up to
 * real CPU on busy dashboards and shared hosts. This subsystem lets the site
 * owner slow it down, restrict it to the post editor, or switch it off entirely.
 *
 *  - "default" — leave WordPress's behaviour untouched.
 *  - "slow"    — widen the interval to 60s everywhere.
 *  - "editor"  — disable Heartbeat except on the post editor screens.
 *  - "off"     — deregister the Heartbeat script entirely.
 *
 * @package KlynaSpeed
 */

namespace KlynaSpeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Heartbeat {

	public function register(): void {
		$mode = (string) Plugin::get( 'heartbeat_mode', 'slow' );

		if ( 'default' === $mode ) {
			return;
		}

		if ( 'off' === $mode ) {
			add_action( 'init', array( $this, 'disable_everywhere' ), 1 );
			return;
		}

		if ( 'editor' === $mode ) {
			add_action( 'init', array( $this, 'disable_outside_editor' ), 1 );
		}

		// "slow" (and "editor") widen the interval.
		add_filter( 'heartbeat_settings', array( $this, 'widen_interval' ) );
	}

	/**
	 * Deregister the Heartbeat script everywhere.
	 */
	public function disable_everywhere(): void {
		wp_deregister_script( 'heartbeat' );
	}

	/**
	 * Disable Heartbeat unless we're on a post edit screen.
	 */
	public function disable_outside_editor(): void {
		global $pagenow;
		$editor_screens = array( 'post.php', 'post-new.php' );
		if ( ! is_admin() || ! in_array( (string) $pagenow, $editor_screens, true ) ) {
			wp_deregister_script( 'heartbeat' );
		}
	}

	/**
	 * Slow the polling interval to 60 seconds.
	 *
	 * @param array<string,mixed> $settings Heartbeat settings.
	 * @return array<string,mixed>
	 */
	public function widen_interval( $settings ): array {
		$settings = is_array( $settings ) ? $settings : array();
		$settings['interval'] = 60;
		return $settings;
	}
}
