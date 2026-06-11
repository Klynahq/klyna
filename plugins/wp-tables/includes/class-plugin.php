<?php
/**
 * Klyna Tables plugin bootstrap.
 *
 * @package KlynaTables
 */

namespace KlynaTables;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Plugin orchestrator. Wires hook subscribers on `plugins_loaded`.
 */
final class Plugin {

	/**
	 * Boot every subsystem.
	 */
	public function boot(): void {
		load_plugin_textdomain( 'wp-tables', false, dirname( plugin_basename( KLYNA_TABLES_PLUGIN_FILE ) ) . '/languages' );

		( new Table_Store() )->register();
		( new Rest() )->register();
		( new Shortcode() )->register();
		( new Block() )->register();

		if ( is_admin() ) {
			( new Admin() )->register();
		}
	}

	/**
	 * Settings accessor used by all submodules.
	 *
	 * @return array<string,mixed>
	 */
	public static function settings(): array {
		$settings = get_option( KLYNA_TABLES_OPTION_KEY, array() );
		$settings = is_array( $settings ) ? $settings : array();
		return wp_parse_args( $settings, self::defaults() );
	}

	/**
	 * Hard defaults — applied on read so a partial option never breaks render.
	 *
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return array(
			'default_rows_per_page' => 10,
			'enable_search'         => true,
			'enable_sort'           => true,
			'enable_pagination'     => true,
			'responsive_stack'      => true,
			'striped'               => true,
			'accent'                => '#7c5cff',
			'woo_columns'           => array( 'image', 'title', 'price', 'cart' ),
			'ai_provider'           => 'off',
			'ai_api_key'            => '',
			'ai_model'              => '',
			'ai_endpoint'           => '',
			'ai_daily_cap'          => 100,
		);
	}
}
