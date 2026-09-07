import { clearCache, setCacheScope } from '$lib/cache';
import { forumConfig } from '$lib/config';
import type { Viewer } from './types';

const TOKEN_KEY = 'dk:token';
const STATE_KEY = 'dk:oauth-state';
const VERIFIER_KEY = 'dk:oauth-verifier';
const REDIRECT_KEY = 'dk:oauth-redirect';
const REFRESH_WINDOW_MS = 60_000;

interface Credentials {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
	refreshTokenExpiresAt?: number;
}

interface TokenResponse {
	access_token?: string;
	expires_in?: number;
	refresh_token?: string;
	refresh_token_expires_in?: number;
}

function encodeBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function credentialsFromResponse(data: TokenResponse): Credentials | null {
	if (!data.access_token) return null;
	const now = Date.now();
	return {
		accessToken: data.access_token,
		...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
		...(data.expires_in ? { expiresAt: now + data.expires_in * 1000 } : {}),
		...(data.refresh_token_expires_in
			? { refreshTokenExpiresAt: now + data.refresh_token_expires_in * 1000 }
			: {})
	};
}

class Auth {
	private credentials = $state<Credentials | null>(null);
	private refreshPromise: Promise<string | null> | null = null;
	viewer = $state<Viewer | null>(null);
	/** true while the stored token is being validated on boot */
	loading = $state(true);

	get token() {
		return this.credentials?.accessToken ?? null;
	}

	get signedIn() {
		return this.viewer !== null;
	}

	/** Restore persisted credentials and resolve the viewer behind them. */
	async init() {
		const stored = localStorage.getItem(TOKEN_KEY);
		if (stored) {
			try {
				this.credentials = JSON.parse(stored) as Credentials;
				if (!this.credentials.accessToken) throw new Error('Invalid credentials');
				await this.fetchViewer();
			} catch {
				this.signOut();
			}
		}
		this.loading = false;
	}

	async signInWithToken(token: string) {
		this.credentials = { accessToken: token.trim() };
		try {
			await this.fetchViewer();
			this.persistCredentials();
		} catch (error) {
			this.credentials = null;
			throw error;
		}
	}

	get oauthAvailable() {
		return Boolean(forumConfig.auth.oauth.clientId && forumConfig.auth.oauth.proxyUrl);
	}

	/** Start the repository-scoped GitHub App user authorization flow. */
	async beginOAuth(redirectUri: string) {
		const state = crypto.randomUUID();
		const verifier = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
		const challenge = encodeBase64Url(new Uint8Array(digest));
		sessionStorage.setItem(STATE_KEY, state);
		sessionStorage.setItem(VERIFIER_KEY, verifier);
		sessionStorage.setItem(REDIRECT_KEY, redirectUri);

		const url = new URL('https://github.com/login/oauth/authorize');
		url.searchParams.set('client_id', forumConfig.auth.oauth.clientId);
		url.searchParams.set('redirect_uri', redirectUri);
		url.searchParams.set('state', state);
		url.searchParams.set('code_challenge', challenge);
		url.searchParams.set('code_challenge_method', 'S256');
		location.href = url.toString();
	}

	/** Complete the GitHub App flow on the callback page. */
	async completeOAuth(code: string, state: string) {
		const expected = sessionStorage.getItem(STATE_KEY);
		const verifier = sessionStorage.getItem(VERIFIER_KEY);
		const redirectUri = sessionStorage.getItem(REDIRECT_KEY);
		sessionStorage.removeItem(STATE_KEY);
		sessionStorage.removeItem(VERIFIER_KEY);
		sessionStorage.removeItem(REDIRECT_KEY);
		if (!expected || expected !== state || !verifier || !redirectUri) {
			throw new Error('OAuth state mismatch - please try signing in again.');
		}

		const data = await this.exchange({ code, code_verifier: verifier, redirect_uri: redirectUri });
		const credentials = credentialsFromResponse(data);
		if (!credentials) throw new Error('Token exchange returned no token.');
		this.credentials = credentials;
		try {
			await this.fetchViewer();
			this.persistCredentials();
		} catch (error) {
			this.credentials = null;
			throw error;
		}
	}

	async getToken(): Promise<string | null> {
		if (!this.credentials) return null;
		if (!this.credentials.expiresAt || this.credentials.expiresAt > Date.now() + REFRESH_WINDOW_MS) {
			return this.credentials.accessToken;
		}
		if (!this.credentials.refreshToken) {
			this.signOut();
			return null;
		}

		this.refreshPromise ??= this.refreshCredentials();
		try {
			return await this.refreshPromise;
		} finally {
			this.refreshPromise = null;
		}
	}

	signOut() {
		this.credentials = null;
		this.viewer = null;
		localStorage.removeItem(TOKEN_KEY);
		clearCache();
		setCacheScope(null);
	}

	private async refreshCredentials(): Promise<string | null> {
		try {
			const data = await this.exchange({ refresh_token: this.credentials!.refreshToken! });
			const credentials = credentialsFromResponse(data);
			if (!credentials) throw new Error('Refresh returned no token');
			this.credentials = credentials;
			this.persistCredentials();
			return credentials.accessToken;
		} catch {
			this.signOut();
			return null;
		}
	}

	private async exchange(body: Record<string, string>): Promise<TokenResponse> {
		const res = await fetch(forumConfig.auth.oauth.proxyUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error('Token exchange failed.');
		return res.json() as Promise<TokenResponse>;
	}

	private persistCredentials() {
		localStorage.setItem(TOKEN_KEY, JSON.stringify(this.credentials));
	}

	private async fetchViewer() {
		const token = await this.getToken();
		if (!token) throw new Error('No valid GitHub token.');
		const res = await fetch('https://api.github.com/graphql', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ query: '{ viewer { login name avatarUrl url } }' })
		});
		if (!res.ok) throw new Error(`GitHub rejected the token (${res.status}).`);
		const json = await res.json();
		if (json.errors?.length) throw new Error(json.errors[0].message);
		this.viewer = json.data.viewer as Viewer;
		setCacheScope(this.viewer.login);
	}
}

export const auth = new Auth();
