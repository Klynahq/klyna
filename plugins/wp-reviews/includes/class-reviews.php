<?php
/**
 * Review storage + data layer.
 *
 * Reviews are stored as a custom post type (`klyna_review`) so they inherit
 * WordPress's editorial UX (list table, search, trash, capabilities) for free.
 * Rating + reviewer fields live in post meta. A lightweight custom table
 * (`{$prefix}klyna_review_index`) caches the per-target aggregate so the front
 * end and JSON-LD never run an expensive meta query on every request.
 *
 * Status maps to post_status: `pending` → moderation queue, `publish` → live.
 *
 * @package KlynaReviews
 */

namespace KlynaReviews;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Reviews {

	public const POST_TYPE = 'klyna_review';

	public const META_RATING   = '_klyna_rating';
	public const META_AUTHOR   = '_klyna_author';
	public const META_EMAIL    = '_klyna_email';
	public const META_TARGET   = '_klyna_target';
	public const META_TITLE    = '_klyna_review_title';
	public const META_IP_HASH  = '_klyna_ip_hash';

	public function register(): void {
		add_action( 'init', array( $this, 'register_post_type' ) );
		add_action( 'init', array( $this, 'maybe_upgrade_table' ) );

		// Keep the aggregate index in sync with the post lifecycle.
		add_action( 'transition_post_status', array( $this, 'on_status_change' ), 10, 3 );
		add_action( 'before_delete_post', array( $this, 'on_delete' ) );
		add_action( 'save_post_' . self::POST_TYPE, array( $this, 'reindex_on_save' ), 20 );
	}

	/* ---------------------------------------------------------------------
	 * Post type
	 * ------------------------------------------------------------------- */

	public static function register_post_type(): void {
		$labels = array(
			'name'               => __( 'Reviews', 'wp-reviews' ),
			'singular_name'      => __( 'Review', 'wp-reviews' ),
			'menu_name'          => __( 'Reviews', 'wp-reviews' ),
			'add_new'            => __( 'Add review', 'wp-reviews' ),
			'add_new_item'       => __( 'Add review', 'wp-reviews' ),
			'edit_item'          => __( 'Edit review', 'wp-reviews' ),
			'new_item'           => __( 'New review', 'wp-reviews' ),
			'view_item'          => __( 'View review', 'wp-reviews' ),
			'search_items'       => __( 'Search reviews', 'wp-reviews' ),
			'not_found'          => __( 'No reviews found.', 'wp-reviews' ),
			'not_found_in_trash' => __( 'No reviews found in Trash.', 'wp-reviews' ),
		);

		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => $labels,
				'public'              => false,
				'show_ui'             => true,
				'show_in_menu'        => false, // Mounted under the Klyna Reviews menu.
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'publicly_queryable'  => false,
				'has_archive'         => false,
				'hierarchical'        => false,
				'supports'            => array( 'editor' ),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
			)
		);
	}

	/* ---------------------------------------------------------------------
	 * Custom aggregate table
	 * ------------------------------------------------------------------- */

	public static function table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'klyna_review_index';
	}

	/**
	 * Create / upgrade the aggregate index table via dbDelta.
	 */
	public static function install_table(): void {
		global $wpdb;

		$table   = self::table_name();
		$charset = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE {$table} (
			target_key varchar(191) NOT NULL,
			review_count bigint(20) unsigned NOT NULL DEFAULT 0,
			rating_sum bigint(20) unsigned NOT NULL DEFAULT 0,
			rating_avg decimal(3,2) NOT NULL DEFAULT 0.00,
			updated_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
			PRIMARY KEY  (target_key)
		) {$charset};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );

		update_option( 'klyna_reviews_db_version', KLYNA_REVIEWS_VERSION );
	}

	/**
	 * Run the table installer when the stored DB version is stale.
	 */
	public function maybe_upgrade_table(): void {
		if ( get_option( 'klyna_reviews_db_version' ) !== KLYNA_REVIEWS_VERSION ) {
			self::install_table();
		}
	}

	/* ---------------------------------------------------------------------
	 * Writes
	 * ------------------------------------------------------------------- */

	/**
	 * Insert a new review.
	 *
	 * @param array{
	 *   author:string, email:string, rating:int, title:string,
	 *   body:string, target:string, ip_hash:string, status:string
	 * } $data Already-sanitized payload.
	 * @return int|\WP_Error Review post ID or error.
	 */
	public function create( array $data ) {
		$status = ( 'publish' === $data['status'] ) ? 'publish' : 'pending';

		$post_id = wp_insert_post(
			array(
				'post_type'    => self::POST_TYPE,
				'post_status'  => $status,
				'post_title'   => $data['title'] !== '' ? $data['title'] : $data['author'],
				'post_content' => $data['body'],
				'post_author'  => 0,
			),
			true
		);

		if ( is_wp_error( $post_id ) ) {
			return $post_id;
		}

		update_post_meta( $post_id, self::META_RATING, (int) $data['rating'] );
		update_post_meta( $post_id, self::META_AUTHOR, $data['author'] );
		update_post_meta( $post_id, self::META_EMAIL, $data['email'] );
		update_post_meta( $post_id, self::META_TARGET, $data['target'] );
		update_post_meta( $post_id, self::META_TITLE, $data['title'] );
		update_post_meta( $post_id, self::META_IP_HASH, $data['ip_hash'] );

		$this->reindex_target( $data['target'] );

		return (int) $post_id;
	}

	/**
	 * Move a review between the moderation queue and live.
	 *
	 * @param int    $review_id Review post ID.
	 * @param string $status    `approved`/`publish` or `pending`.
	 * @return bool
	 */
	public function set_status( int $review_id, string $status ): bool {
		$post = get_post( $review_id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return false;
		}
		$new = in_array( $status, array( 'approved', 'publish' ), true ) ? 'publish' : 'pending';
		$res = wp_update_post(
			array(
				'ID'          => $review_id,
				'post_status' => $new,
			),
			true
		);
		return ! is_wp_error( $res );
	}

	/* ---------------------------------------------------------------------
	 * Reads
	 * ------------------------------------------------------------------- */

	/**
	 * Approved reviews for a target, newest first.
	 *
	 * @param string $target   Target key (e.g. post ID, product slug, or 'site').
	 * @param int    $per_page Items per page.
	 * @param int    $page     1-based page index.
	 * @return array<int, array<string,mixed>>
	 */
	public function get_for_target( string $target, int $per_page = 10, int $page = 1 ): array {
		$query = new \WP_Query(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => max( 1, $per_page ),
				'paged'          => max( 1, $page ),
				'orderby'        => 'date',
				'order'          => 'DESC',
				'meta_key'       => self::META_TARGET,
				'meta_value'     => $target,
				'no_found_rows'  => false,
			)
		);

		$out = array();
		foreach ( $query->posts as $post ) {
			$out[] = $this->to_array( $post );
		}
		return $out;
	}

	/**
	 * Aggregate (count + average) for a target, served from the index table.
	 *
	 * @param string $target Target key.
	 * @return array{count:int, average:float}
	 */
	public function aggregate( string $target ): array {
		global $wpdb;

		$table = self::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT review_count, rating_avg FROM {$table} WHERE target_key = %s", $target ),
			ARRAY_A
		);

		if ( ! $row ) {
			return array(
				'count'   => 0,
				'average' => 0.0,
			);
		}

		return array(
			'count'   => (int) $row['review_count'],
			'average' => (float) $row['rating_avg'],
		);
	}

	/**
	 * Count reviews currently awaiting moderation.
	 */
	public function pending_count(): int {
		$counts = wp_count_posts( self::POST_TYPE );
		return isset( $counts->pending ) ? (int) $counts->pending : 0;
	}

	/**
	 * Normalize a review post into a render-ready array.
	 *
	 * @param \WP_Post $post Review post.
	 * @return array<string,mixed>
	 */
	public function to_array( \WP_Post $post ): array {
		return array(
			'id'      => (int) $post->ID,
			'author'  => (string) get_post_meta( $post->ID, self::META_AUTHOR, true ),
			'rating'  => (int) get_post_meta( $post->ID, self::META_RATING, true ),
			'title'   => (string) get_post_meta( $post->ID, self::META_TITLE, true ),
			'body'    => (string) $post->post_content,
			'target'  => (string) get_post_meta( $post->ID, self::META_TARGET, true ),
			'date'    => get_the_date( DATE_W3C, $post ),
			'status'  => 'publish' === $post->post_status ? 'approved' : 'pending',
		);
	}

	/* ---------------------------------------------------------------------
	 * Index maintenance
	 * ------------------------------------------------------------------- */

	/**
	 * Recompute and persist the aggregate for a single target.
	 *
	 * @param string $target Target key.
	 */
	public function reindex_target( string $target ): void {
		global $wpdb;

		if ( '' === $target ) {
			return;
		}

		$ids = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'meta_key'       => self::META_TARGET,
				'meta_value'     => $target,
			)
		);

		$count = 0;
		$sum   = 0;
		foreach ( $ids as $id ) {
			$rating = (int) get_post_meta( $id, self::META_RATING, true );
			if ( $rating > 0 ) {
				$count++;
				$sum += $rating;
			}
		}

		$avg   = $count > 0 ? round( $sum / $count, 2 ) : 0.0;
		$table = self::table_name();

		if ( 0 === $count ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->delete( $table, array( 'target_key' => $target ), array( '%s' ) );
			return;
		}

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->replace(
			$table,
			array(
				'target_key'   => $target,
				'review_count' => $count,
				'rating_sum'   => $sum,
				'rating_avg'   => $avg,
				'updated_at'   => current_time( 'mysql' ),
			),
			array( '%s', '%d', '%d', '%f', '%s' )
		);
	}

	/**
	 * Re-index whenever a review post's status flips to/from publish.
	 *
	 * @param string   $new_status New status.
	 * @param string   $old_status Old status.
	 * @param \WP_Post $post       The post.
	 */
	public function on_status_change( string $new_status, string $old_status, \WP_Post $post ): void {
		if ( self::POST_TYPE !== $post->post_type ) {
			return;
		}
		if ( $new_status === $old_status ) {
			return;
		}
		$target = (string) get_post_meta( $post->ID, self::META_TARGET, true );
		$this->reindex_target( $target );
	}

	/**
	 * Re-index after a review is edited in the admin.
	 *
	 * @param int $post_id Review post ID.
	 */
	public function reindex_on_save( int $post_id ): void {
		if ( wp_is_post_revision( $post_id ) ) {
			return;
		}
		$target = (string) get_post_meta( $post_id, self::META_TARGET, true );
		$this->reindex_target( $target );
	}

	/**
	 * Re-index after a review is permanently deleted.
	 *
	 * @param int $post_id Review post ID.
	 */
	public function on_delete( int $post_id ): void {
		$post = get_post( $post_id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return;
		}
		$target = (string) get_post_meta( $post_id, self::META_TARGET, true );
		// The post still exists at this hook, so exclude it from the recount.
		add_action(
			'deleted_post',
			function () use ( $target ) {
				$this->reindex_target( $target );
			},
			10,
			0
		);
	}
}
