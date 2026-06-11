<?php
/**
 * Services custom post type.
 *
 * A "service" is a bookable offering — a haircut, a consultation, a class.
 * Each one carries a duration (minutes) and a price stored as post meta.
 * Editors manage them like any other post; the front-end form lists the
 * published ones.
 *
 * @package KlynaBooking
 */

namespace KlynaBooking;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Services {

	public const POST_TYPE = 'klyna_service';

	private const META_DURATION = '_klyna_booking_duration';
	private const META_PRICE    = '_klyna_booking_price';
	private const META_CAPACITY = '_klyna_booking_capacity';
	public  const META_AI_CONFIRM = '_klyna_booking_ai_confirm';
	public  const META_AI_PREP    = '_klyna_booking_ai_prep';

	public function register(): void {
		add_action( 'init', array( $this, 'register_post_type' ) );
		add_action( 'init', array( $this, 'register_meta' ) );
		add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
		add_action( 'save_post_' . self::POST_TYPE, array( $this, 'save_meta' ), 10, 2 );
		add_filter( 'manage_' . self::POST_TYPE . '_posts_columns', array( $this, 'columns' ) );
		add_action( 'manage_' . self::POST_TYPE . '_posts_custom_column', array( $this, 'column_value' ), 10, 2 );
	}

	public function register_post_type(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => array(
					'name'               => __( 'Services', 'wp-booking' ),
					'singular_name'      => __( 'Service', 'wp-booking' ),
					'add_new'            => __( 'Add service', 'wp-booking' ),
					'add_new_item'       => __( 'Add new service', 'wp-booking' ),
					'edit_item'          => __( 'Edit service', 'wp-booking' ),
					'new_item'           => __( 'New service', 'wp-booking' ),
					'view_item'          => __( 'View service', 'wp-booking' ),
					'search_items'       => __( 'Search services', 'wp-booking' ),
					'not_found'          => __( 'No services found.', 'wp-booking' ),
					'not_found_in_trash' => __( 'No services found in trash.', 'wp-booking' ),
					'menu_name'          => __( 'Services', 'wp-booking' ),
				),
				'public'              => true,
				'show_in_rest'        => true,
				'has_archive'         => false,
				'exclude_from_search' => true,
				'publicly_queryable'  => true,
				'show_in_menu'        => 'wp-booking',
				'menu_position'       => 26,
				'supports'            => array( 'title', 'editor', 'thumbnail', 'excerpt' ),
				'rewrite'             => array( 'slug' => 'services' ),
			)
		);
	}

	public function register_meta(): void {
		register_post_meta(
			self::POST_TYPE,
			self::META_DURATION,
			array(
				'type'              => 'integer',
				'single'            => true,
				'default'           => 30,
				'show_in_rest'      => true,
				'sanitize_callback' => 'absint',
				'auth_callback'     => static fn() => current_user_can( 'edit_posts' ),
			)
		);
		register_post_meta(
			self::POST_TYPE,
			self::META_PRICE,
			array(
				'type'              => 'number',
				'single'            => true,
				'default'           => 0,
				'show_in_rest'      => true,
				'sanitize_callback' => array( $this, 'sanitize_price' ),
				'auth_callback'     => static fn() => current_user_can( 'edit_posts' ),
			)
		);
		register_post_meta(
			self::POST_TYPE,
			self::META_AI_CONFIRM,
			array(
				'type'              => 'boolean',
				'single'            => true,
				'default'           => false,
				'show_in_rest'      => true,
				'sanitize_callback' => static fn( $v ) => (bool) $v,
				'auth_callback'     => static fn() => current_user_can( 'edit_posts' ),
			)
		);
		register_post_meta(
			self::POST_TYPE,
			self::META_AI_PREP,
			array(
				'type'              => 'string',
				'single'            => true,
				'default'           => '',
				'show_in_rest'      => true,
				'sanitize_callback' => 'sanitize_textarea_field',
				'auth_callback'     => static fn() => current_user_can( 'edit_posts' ),
			)
		);
		register_post_meta(
			self::POST_TYPE,
			self::META_CAPACITY,
			array(
				'type'              => 'integer',
				'single'            => true,
				'default'           => 1,
				'show_in_rest'      => true,
				'sanitize_callback' => 'absint',
				'auth_callback'     => static fn() => current_user_can( 'edit_posts' ),
			)
		);
	}

	public function add_meta_box(): void {
		add_meta_box(
			'klyna-booking-service',
			__( 'Booking details', 'wp-booking' ),
			array( $this, 'render_meta_box' ),
			self::POST_TYPE,
			'side',
			'high'
		);
	}

	public function render_meta_box( \WP_Post $post ): void {
		wp_nonce_field( 'klyna_booking_service_meta', 'klyna_booking_service_nonce' );
		$duration = (int) get_post_meta( $post->ID, self::META_DURATION, true );
		$price    = (float) get_post_meta( $post->ID, self::META_PRICE, true );
		$capacity = (int) get_post_meta( $post->ID, self::META_CAPACITY, true );
		$duration = $duration > 0 ? $duration : 30;
		$capacity = $capacity > 0 ? $capacity : 1;
		$ai_on    = (bool) get_post_meta( $post->ID, self::META_AI_CONFIRM, true );
		$ai_prep  = (string) get_post_meta( $post->ID, self::META_AI_PREP, true );
		?>
		<p>
			<label for="klyna-service-duration"><strong><?php esc_html_e( 'Duration (minutes)', 'wp-booking' ); ?></strong></label><br>
			<input type="number" min="5" step="5" id="klyna-service-duration" name="klyna_service_duration" value="<?php echo esc_attr( (string) $duration ); ?>" class="widefat">
		</p>
		<p>
			<label for="klyna-service-price"><strong><?php esc_html_e( 'Price', 'wp-booking' ); ?></strong></label><br>
			<input type="number" min="0" step="0.01" id="klyna-service-price" name="klyna_service_price" value="<?php echo esc_attr( (string) $price ); ?>" class="widefat">
			<span class="description"><?php esc_html_e( 'Leave 0 for free.', 'wp-booking' ); ?></span>
		</p>
		<p>
			<label for="klyna-service-capacity"><strong><?php esc_html_e( 'Capacity per slot', 'wp-booking' ); ?></strong></label><br>
			<input type="number" min="1" step="1" id="klyna-service-capacity" name="klyna_service_capacity" value="<?php echo esc_attr( (string) $capacity ); ?>" class="widefat">
			<span class="description"><?php esc_html_e( 'How many bookings one slot can hold.', 'wp-booking' ); ?></span>
		</p>
		<hr>
		<p>
			<label class="klyna-toggle">
				<input type="checkbox" name="klyna_service_ai_confirm" value="1" <?php checked( $ai_on ); ?>>
				<strong><?php esc_html_e( 'AI personalized confirmation email', 'wp-booking' ); ?></strong>
			</label>
			<span class="description"><?php esc_html_e( 'When a booking is created, generate an 80-word personalized confirmation mentioning the service + customer. Requires AI assistant configured in Settings.', 'wp-booking' ); ?></span>
		</p>
		<p>
			<label for="klyna-service-ai-prep"><strong><?php esc_html_e( 'What should clients prepare? (optional)', 'wp-booking' ); ?></strong></label><br>
			<textarea id="klyna-service-ai-prep" name="klyna_service_ai_prep" rows="3" class="widefat" placeholder="<?php esc_attr_e( 'e.g. arrive 10 min early, bring photo ID, wash hair the night before', 'wp-booking' ); ?>"><?php echo esc_textarea( $ai_prep ); ?></textarea>
			<span class="description"><?php esc_html_e( 'Optional hints folded into the AI confirmation.', 'wp-booking' ); ?></span>
		</p>
		<?php
	}

	/**
	 * Persist meta from the classic meta box. Gutenberg writes through the
	 * REST meta registration above; this covers the classic editor path and
	 * keeps both consistent.
	 */
	public function save_meta( int $post_id, \WP_Post $post ): void {
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}
		if ( ! isset( $_POST['klyna_booking_service_nonce'] ) ) {
			return;
		}
		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['klyna_booking_service_nonce'] ) ), 'klyna_booking_service_meta' ) ) {
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		if ( isset( $_POST['klyna_service_duration'] ) ) {
			update_post_meta( $post_id, self::META_DURATION, max( 5, absint( wp_unslash( $_POST['klyna_service_duration'] ) ) ) );
		}
		if ( isset( $_POST['klyna_service_price'] ) ) {
			update_post_meta( $post_id, self::META_PRICE, $this->sanitize_price( wp_unslash( $_POST['klyna_service_price'] ) ) );
		}
		if ( isset( $_POST['klyna_service_capacity'] ) ) {
			update_post_meta( $post_id, self::META_CAPACITY, max( 1, absint( wp_unslash( $_POST['klyna_service_capacity'] ) ) ) );
		}
		update_post_meta( $post_id, self::META_AI_CONFIRM, ! empty( $_POST['klyna_service_ai_confirm'] ) );
		if ( isset( $_POST['klyna_service_ai_prep'] ) ) {
			update_post_meta( $post_id, self::META_AI_PREP, sanitize_textarea_field( wp_unslash( $_POST['klyna_service_ai_prep'] ) ) );
		}
	}

	/**
	 * @param string[] $columns
	 * @return string[]
	 */
	public function columns( array $columns ): array {
		$out = array();
		foreach ( $columns as $key => $label ) {
			$out[ $key ] = $label;
			if ( 'title' === $key ) {
				$out['klyna_duration'] = __( 'Duration', 'wp-booking' );
				$out['klyna_price']    = __( 'Price', 'wp-booking' );
			}
		}
		return $out;
	}

	public function column_value( string $column, int $post_id ): void {
		if ( 'klyna_duration' === $column ) {
			$duration = (int) get_post_meta( $post_id, self::META_DURATION, true );
			/* translators: %d: minutes. */
			echo esc_html( sprintf( _n( '%d min', '%d min', $duration, 'wp-booking' ), $duration ) );
		}
		if ( 'klyna_price' === $column ) {
			echo esc_html( self::format_price( (float) get_post_meta( $post_id, self::META_PRICE, true ) ) );
		}
	}

	/**
	 * @param mixed $value
	 */
	public function sanitize_price( $value ): float {
		return round( max( 0.0, (float) $value ), 2 );
	}

	/**
	 * Public read helper. Returns a normalized service record or null.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function get( int $service_id ): ?array {
		$post = get_post( $service_id );
		if ( ! $post || self::POST_TYPE !== $post->post_type || 'publish' !== $post->post_status ) {
			return null;
		}
		$duration = (int) get_post_meta( $service_id, self::META_DURATION, true );
		$capacity = (int) get_post_meta( $service_id, self::META_CAPACITY, true );
		return array(
			'id'         => $service_id,
			'title'      => get_the_title( $post ),
			'duration'   => $duration > 0 ? $duration : 30,
			'price'      => round( (float) get_post_meta( $service_id, self::META_PRICE, true ), 2 ),
			'capacity'   => $capacity > 0 ? $capacity : 1,
			'ai_confirm' => (bool) get_post_meta( $service_id, self::META_AI_CONFIRM, true ),
			'ai_prep'    => (string) get_post_meta( $service_id, self::META_AI_PREP, true ),
		);
	}

	/**
	 * All published services, normalized.
	 *
	 * @return array<int, array<string,mixed>>
	 */
	public static function all(): array {
		$ids = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'orderby'        => 'title',
				'order'          => 'ASC',
				'fields'         => 'ids',
			)
		);
		$out = array();
		foreach ( $ids as $id ) {
			$service = self::get( (int) $id );
			if ( $service ) {
				$out[] = $service;
			}
		}
		return $out;
	}

	public static function format_price( float $price ): string {
		if ( $price <= 0.0 ) {
			return __( 'Free', 'wp-booking' );
		}
		return number_format_i18n( $price, 2 );
	}
}
