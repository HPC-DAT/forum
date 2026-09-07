/**
 * Repository-scoped GitHub App token exchange for the HPC-DAT forum.
 * The browser uses PKCE; this Worker keeps the GitHub App secret server-side.
 */

/**
 * @typedef {{ ALLOWED_ORIGINS?: string, GITHUB_CLIENT_ID: string, GITHUB_CLIENT_SECRET: string, GITHUB_REPOSITORY_ID: string }} Env
 */

/** @param {string | undefined} csv */
export function parseAllowedOrigins(csv) {
	return (csv ?? '')
		.split(',')
		.map((origin) => origin.trim().replace(/\/+$/, ''))
		.filter(Boolean);
}

export default {
	/** @param {Request} request @param {Env} env */
	async fetch(request, env) {
		const origin = request.headers.get('Origin');
		const originAllowed = origin !== null && parseAllowedOrigins(env.ALLOWED_ORIGINS).includes(origin);
		const cors = {
			...(originAllowed ? { 'Access-Control-Allow-Origin': origin } : {}),
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			Vary: 'Origin'
		};
		/** @param {unknown} body @param {number} [status] */
		const json = (body, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store',
					...cors
				}
			});

		if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
		if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
		if (!originAllowed) return json({ error: 'forbidden_origin' }, 403);
		if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.GITHUB_REPOSITORY_ID) {
			return json({ error: 'server_not_configured' }, 500);
		}

		let input;
		try {
			input = await request.json();
		} catch {
			return json({ error: 'invalid_json' }, 400);
		}

		let exchange;
		if (typeof input.refresh_token === 'string' && input.refresh_token) {
			exchange = {
				client_id: env.GITHUB_CLIENT_ID,
				client_secret: env.GITHUB_CLIENT_SECRET,
				grant_type: 'refresh_token',
				refresh_token: input.refresh_token
			};
		} else if (
			typeof input.code === 'string' &&
			input.code &&
			typeof input.code_verifier === 'string' &&
			input.code_verifier &&
			typeof input.redirect_uri === 'string' &&
			input.redirect_uri
		) {
			exchange = {
				client_id: env.GITHUB_CLIENT_ID,
				client_secret: env.GITHUB_CLIENT_SECRET,
				code: input.code,
				code_verifier: input.code_verifier,
				redirect_uri: input.redirect_uri,
				repository_id: env.GITHUB_REPOSITORY_ID
			};
		} else {
			return json({ error: 'invalid_request' }, 400);
		}

		const res = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify(exchange)
		});
		if (!res.ok) return json({ error: 'github_unreachable' }, 502);

		const data = await res.json();
		if (!data.access_token) return json({ error: data.error ?? 'exchange_failed' }, 400);
		return json({
			access_token: data.access_token,
			...(data.expires_in ? { expires_in: data.expires_in } : {}),
			...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
			...(data.refresh_token_expires_in
				? { refresh_token_expires_in: data.refresh_token_expires_in }
				: {})
		});
	}
};
