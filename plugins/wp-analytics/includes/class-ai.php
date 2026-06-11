<?php
/**
 * Klyna AI client — provider-agnostic text generation.
 *
 * All providers are free-tier compatible:
 *  - OpenRouter (`:free` model variants, indefinite)
 *  - Groq (generous free tier)
 *  - Google Gemini (1500 req/day free)
 *  - Cloudflare Workers AI (10K req/day free)
 *  - Ollama (self-hosted, unlimited)
 *
 * The unified interface returns plain text suggestions; provider details
 * are encapsulated. Caching + a daily budget cap protect quotas.
 *
 * @package Klyna
 */

namespace KlynaAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Ai {

	private const CACHE_PREFIX = 'wp_analytics_ai_cache_';
	private const CACHE_TTL    = DAY_IN_SECONDS;
	private const DAILY_KEY    = 'wp_analytics_ai_count_today';
	private const SYSTEM_PROMPT = "You are an expert SEO writer helping improve a blog post. Output ONLY the requested content with no preamble, explanation, or markdown code fences. Match the post's existing voice. Be specific and factual; never invent statistics or quotes.";

	public static function default_settings(): array {
		return array(
			'ai_provider'        => 'openrouter',
			'ai_model'           => 'meta-llama/llama-3.3-70b-instruct:free',
			'ai_api_key'         => '',
			'ai_endpoint'        => '', // for ollama / custom
			'ai_daily_cap'       => 100,
		);
	}

	public static function provider_catalog(): array {
		return array(
			'openrouter' => array(
				'label'          => 'OpenRouter (free models)',
				'docs'           => 'https://openrouter.ai/keys',
				'default_model'  => 'meta-llama/llama-3.3-70b-instruct:free',
				'models'         => array(
					'meta-llama/llama-3.3-70b-instruct:free' => 'Llama 3.3 70B (free)',
					'deepseek/deepseek-r1:free'              => 'DeepSeek R1 (free)',
					'google/gemini-2.0-flash-exp:free'       => 'Gemini 2.0 Flash (free)',
					'meta-llama/llama-3.1-405b-instruct:free'=> 'Llama 3.1 405B (free)',
					'mistralai/mistral-small-3.1-24b-instruct:free' => 'Mistral Small 3.1 (free)',
				),
				'requires'       => array( 'ai_api_key' ),
			),
			'groq' => array(
				'label'          => 'Groq (fast & free)',
				'docs'           => 'https://console.groq.com/keys',
				'default_model'  => 'llama-3.3-70b-versatile',
				'models'         => array(
					'llama-3.3-70b-versatile' => 'Llama 3.3 70B Versatile',
					'llama-3.1-8b-instant'    => 'Llama 3.1 8B Instant',
					'mixtral-8x7b-32768'      => 'Mixtral 8x7B',
				),
				'requires'       => array( 'ai_api_key' ),
			),
			'gemini' => array(
				'label'          => 'Google Gemini',
				'docs'           => 'https://aistudio.google.com/apikey',
				'default_model'  => 'gemini-2.0-flash',
				'models'         => array(
					'gemini-2.0-flash'      => 'Gemini 2.0 Flash',
					'gemini-1.5-flash'      => 'Gemini 1.5 Flash',
					'gemini-1.5-flash-8b'   => 'Gemini 1.5 Flash 8B',
				),
				'requires'       => array( 'ai_api_key' ),
			),
			'cloudflare' => array(
				'label'          => 'Cloudflare Workers AI',
				'docs'           => 'https://dash.cloudflare.com/profile/api-tokens',
				'default_model'  => '@cf/meta/llama-3.1-8b-instruct',
				'models'         => array(
					'@cf/meta/llama-3.1-8b-instruct'   => 'Llama 3.1 8B',
					'@cf/meta/llama-3.3-70b-instruct-fp8-fast' => 'Llama 3.3 70B Fast',
					'@cf/mistral/mistral-7b-instruct-v0.1' => 'Mistral 7B',
				),
				// account_id stored in ai_endpoint
				'requires'       => array( 'ai_api_key', 'ai_endpoint' ),
				'endpoint_label' => 'Cloudflare Account ID',
			),
			'ollama' => array(
				'label'          => 'Ollama (self-hosted)',
				'docs'           => 'https://ollama.com',
				'default_model'  => 'llama3.2',
				'models'         => array(
					'llama3.2'    => 'Llama 3.2',
					'llama3.1'    => 'Llama 3.1',
					'qwen2.5'     => 'Qwen 2.5',
					'mistral'     => 'Mistral',
					'phi3'        => 'Phi-3',
				),
				'requires'       => array( 'ai_endpoint' ),
				'endpoint_label' => 'Ollama URL (e.g. http://localhost:11434)',
			),
		);
	}

	/**
	 * Generate a text completion.
	 * Returns ['ok' => bool, 'text' => string, 'reason'? => string, 'cached'? => bool].
	 */
	public function complete( string $user_prompt, array $opts = array() ): array {
		$settings = array_merge( self::default_settings(), Plugin::settings() );
		$provider = $settings['ai_provider'];
		$model    = $opts['model'] ?? $settings['ai_model'];
		$key      = $settings['ai_api_key'];
		$endpoint = $settings['ai_endpoint'];
		$temperature = $opts['temperature'] ?? 0.6;
		$max_tokens  = $opts['max_tokens']  ?? 600;

		// 1. cache lookup
		$cache_key = self::CACHE_PREFIX . md5( $provider . '|' . $model . '|' . $user_prompt );
		$cached    = get_transient( $cache_key );
		if ( false !== $cached && is_string( $cached ) ) {
			return array( 'ok' => true, 'text' => $cached, 'cached' => true );
		}

		// 2. daily budget gate
		$today = gmdate( 'Y-m-d' );
		$used  = (array) get_option( self::DAILY_KEY, array() );
		$used_today = isset( $used['date'] ) && $used['date'] === $today ? (int) $used['count'] : 0;
		$cap   = max( 1, (int) $settings['ai_daily_cap'] );
		if ( $used_today >= $cap ) {
			return array(
				'ok'     => false,
				'reason' => 'daily_cap_reached',
				'text'   => "Daily AI suggestion cap reached ($used_today / $cap). Resets at 00:00 UTC.",
			);
		}

		// 3. provider call
		$result = $this->call_provider( $provider, $model, $key, $endpoint, $user_prompt, $temperature, $max_tokens );

		if ( ! empty( $result['ok'] ) ) {
			set_transient( $cache_key, $result['text'], self::CACHE_TTL );
			update_option(
				self::DAILY_KEY,
				array( 'date' => $today, 'count' => $used_today + 1 ),
				false
			);
		}
		return $result;
	}

	private function call_provider(
		string $provider,
		string $model,
		string $api_key,
		string $endpoint,
		string $user_prompt,
		float $temperature,
		int $max_tokens
	): array {
		switch ( $provider ) {
			case 'openrouter':
				return $this->openai_compatible(
					'https://openrouter.ai/api/v1/chat/completions',
					$api_key,
					$model,
					$user_prompt,
					$temperature,
					$max_tokens,
					array(
						'HTTP-Referer' => home_url( '/' ),
						'X-Title'      => 'WP Analytics',
					)
				);

			case 'groq':
				return $this->openai_compatible(
					'https://api.groq.com/openai/v1/chat/completions',
					$api_key,
					$model,
					$user_prompt,
					$temperature,
					$max_tokens
				);

			case 'gemini':
				return $this->gemini(
					$api_key,
					$model,
					$user_prompt,
					$temperature,
					$max_tokens
				);

			case 'cloudflare':
				// $endpoint stores the Cloudflare account ID
				return $this->cloudflare(
					$api_key,
					$endpoint,
					$model,
					$user_prompt,
					$temperature,
					$max_tokens
				);

			case 'ollama':
				return $this->ollama(
					$endpoint ?: 'http://localhost:11434',
					$model,
					$user_prompt,
					$temperature,
					$max_tokens
				);

			default:
				return array( 'ok' => false, 'reason' => 'unknown_provider', 'text' => '' );
		}
	}

	/** OpenAI-compatible chat completions (OpenRouter, Groq, others). */
	private function openai_compatible(
		string $url,
		string $api_key,
		string $model,
		string $prompt,
		float $temp,
		int $max_tokens,
		array $extra_headers = array()
	): array {
		if ( '' === $api_key ) {
			return array( 'ok' => false, 'reason' => 'missing_api_key', 'text' => 'API key not set in WP Analytics Settings.' );
		}
		$headers = array_merge(
			array(
				'Authorization' => 'Bearer ' . $api_key,
				'Content-Type'  => 'application/json',
			),
			$extra_headers
		);
		$body = wp_json_encode(
			array(
				'model'       => $model,
				'temperature' => $temp,
				'max_tokens'  => $max_tokens,
				'messages'    => array(
					array( 'role' => 'system', 'content' => self::SYSTEM_PROMPT ),
					array( 'role' => 'user', 'content' => $prompt ),
				),
			)
		);
		$resp = wp_remote_post(
			$url,
			array(
				'timeout' => 30,
				'headers' => $headers,
				'body'    => $body,
			)
		);
		if ( is_wp_error( $resp ) ) {
			return array( 'ok' => false, 'reason' => 'http_error', 'text' => $resp->get_error_message() );
		}
		$code = wp_remote_retrieve_response_code( $resp );
		$json = json_decode( wp_remote_retrieve_body( $resp ), true );
		if ( 200 !== $code ) {
			$msg = $json['error']['message'] ?? wp_remote_retrieve_body( $resp );
			return array( 'ok' => false, 'reason' => 'api_error_' . $code, 'text' => $msg );
		}
		$text = $json['choices'][0]['message']['content'] ?? '';
		return array( 'ok' => true, 'text' => trim( $text ) );
	}

	private function gemini( string $api_key, string $model, string $prompt, float $temp, int $max_tokens ): array {
		if ( '' === $api_key ) {
			return array( 'ok' => false, 'reason' => 'missing_api_key', 'text' => 'API key not set in WP Analytics Settings.' );
		}
		$url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode( $model ) . ':generateContent?key=' . rawurlencode( $api_key );
		$body = wp_json_encode(
			array(
				'systemInstruction' => array(
					'parts' => array( array( 'text' => self::SYSTEM_PROMPT ) ),
				),
				'contents' => array(
					array(
						'role'  => 'user',
						'parts' => array( array( 'text' => $prompt ) ),
					),
				),
				'generationConfig' => array(
					'temperature'     => $temp,
					'maxOutputTokens' => $max_tokens,
				),
			)
		);
		$resp = wp_remote_post(
			$url,
			array(
				'timeout' => 30,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => $body,
			)
		);
		if ( is_wp_error( $resp ) ) {
			return array( 'ok' => false, 'reason' => 'http_error', 'text' => $resp->get_error_message() );
		}
		$code = wp_remote_retrieve_response_code( $resp );
		$json = json_decode( wp_remote_retrieve_body( $resp ), true );
		if ( 200 !== $code ) {
			$msg = $json['error']['message'] ?? wp_remote_retrieve_body( $resp );
			return array( 'ok' => false, 'reason' => 'api_error_' . $code, 'text' => $msg );
		}
		$text = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
		return array( 'ok' => true, 'text' => trim( $text ) );
	}

	private function cloudflare( string $api_key, string $account_id, string $model, string $prompt, float $temp, int $max_tokens ): array {
		if ( '' === $api_key || '' === $account_id ) {
			return array( 'ok' => false, 'reason' => 'missing_credentials', 'text' => 'Cloudflare API key + Account ID required.' );
		}
		$url = sprintf( 'https://api.cloudflare.com/client/v4/accounts/%s/ai/run/%s', rawurlencode( $account_id ), $model );
		$body = wp_json_encode(
			array(
				'messages' => array(
					array( 'role' => 'system', 'content' => self::SYSTEM_PROMPT ),
					array( 'role' => 'user', 'content' => $prompt ),
				),
				'temperature' => $temp,
				'max_tokens'  => $max_tokens,
			)
		);
		$resp = wp_remote_post(
			$url,
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $api_key,
					'Content-Type'  => 'application/json',
				),
				'body' => $body,
			)
		);
		if ( is_wp_error( $resp ) ) {
			return array( 'ok' => false, 'reason' => 'http_error', 'text' => $resp->get_error_message() );
		}
		$code = wp_remote_retrieve_response_code( $resp );
		$json = json_decode( wp_remote_retrieve_body( $resp ), true );
		if ( 200 !== $code || empty( $json['success'] ) ) {
			$msg = $json['errors'][0]['message'] ?? wp_remote_retrieve_body( $resp );
			return array( 'ok' => false, 'reason' => 'api_error_' . $code, 'text' => $msg );
		}
		$text = $json['result']['response'] ?? '';
		return array( 'ok' => true, 'text' => trim( $text ) );
	}

	private function ollama( string $endpoint, string $model, string $prompt, float $temp, int $max_tokens ): array {
		$url = rtrim( $endpoint, '/' ) . '/api/chat';
		$body = wp_json_encode(
			array(
				'model'    => $model,
				'stream'   => false,
				'messages' => array(
					array( 'role' => 'system', 'content' => self::SYSTEM_PROMPT ),
					array( 'role' => 'user',   'content' => $prompt ),
				),
				'options'  => array(
					'temperature' => $temp,
					'num_predict' => $max_tokens,
				),
			)
		);
		$resp = wp_remote_post(
			$url,
			array(
				'timeout' => 60,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => $body,
			)
		);
		if ( is_wp_error( $resp ) ) {
			return array(
				'ok'     => false,
				'reason' => 'http_error',
				'text'   => 'Ollama unreachable at ' . esc_html( $endpoint ) . ': ' . $resp->get_error_message(),
			);
		}
		$json = json_decode( wp_remote_retrieve_body( $resp ), true );
		$text = $json['message']['content'] ?? '';
		return array( 'ok' => true, 'text' => trim( $text ) );
	}

	/**
	 * Lightweight provider connectivity test. Bypasses cache + budget.
	 * Returns ['ok' => bool, 'text' => string].
	 */
	public function test(): array {
		$settings = array_merge( self::default_settings(), Plugin::settings() );
		$provider = (string) $settings['ai_provider'];
		if ( '' === $provider || 'off' === $provider ) {
			return array( 'ok' => false, 'reason' => 'provider_off', 'text' => 'AI provider is set to Off.' );
		}
		$model    = (string) $settings['ai_model'];
		if ( '' === $model ) {
			$catalog = self::provider_catalog();
			$model   = $catalog[ $provider ]['default_model'] ?? '';
		}
		$result = $this->call_provider(
			$provider,
			$model,
			(string) $settings['ai_api_key'],
			(string) $settings['ai_endpoint'],
			'Reply with the single word: OK',
			0.0,
			16
		);
		return $result;
	}

	/** Current call usage (used today / cap). */
	public static function usage(): array {
		$settings = array_merge( self::default_settings(), Plugin::settings() );
		$today    = gmdate( 'Y-m-d' );
		$used     = (array) get_option( self::DAILY_KEY, array() );
		$count    = isset( $used['date'] ) && $used['date'] === $today ? (int) $used['count'] : 0;
		return array(
			'today_calls' => $count,
			'daily_cap'   => (int) $settings['ai_daily_cap'],
			'provider'    => (string) $settings['ai_provider'],
			'model'       => (string) $settings['ai_model'],
		);
	}
}
