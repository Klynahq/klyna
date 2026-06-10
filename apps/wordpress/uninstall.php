<?php
/**
 * Uninstall handler.
 *
 * Runs when the user deletes the plugin from the Plugins screen.
 * We only delete *our* options here; we never touch posts, users, or core tables.
 *
 * @package Klyna
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'klyna_settings' );
