import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const { mockConfig, setCacheScope, clearCache } = vi.hoisted(() => ({
	mockConfig: {
		repo: { owner: 'o', name: 'r' },
		auth: { allowToken: true, oauth: { clientId: '', proxyUrl: '' } }
	},
	setCacheScope: vi.fn(),
	clearCache: vi.fn()
}));

vi.mock('$lib/config', () => ({ forumConfig: mockConfig }));
vi.mock('$lib/cache', () => ({ setCacheScope, clearCache }));

let auth: (typeof import('$lib/github/auth.svelte'))['auth'];
let fetchMock: Mock;

const viewer = { login: 'alice', name: 'Alice', avatarUrl: 'http://a', url: 'http://u' };
const viewerOk = {
	ok: true,
	status: 200,
	json: async () => ({ data: { viewer } })
};

beforeEach(async () => {
	vi.resetModules();
	localStorage.clear();
	sessionStorage.clear();
	mockConfig.auth.oauth = { clientId: '', proxyUrl: '' };
	setCacheScope.mockClear();
	clearCache.mockClear();
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	vi.stubGlobal('crypto', {
		randomUUID: () => 'nonce',
		getRandomValues: (values: Uint8Array) => values.fill(7),
		subtle: { digest: async () => new Uint8Array([1, 2, 3, 4]).buffer }
	});
	({ auth } = await import('$lib/github/auth.svelte'));
});

describe('init', () => {
	it('finishes signed out with no stored token', async () => {
		await auth.init();
		expect(auth.loading).toBe(false);
		expect(auth.token).toBeNull();
		expect(auth.signedIn).toBe(false);
	});

	it('restores a valid stored token', async () => {
		localStorage.setItem('dk:token', JSON.stringify({ accessToken: 'stored' }));
		fetchMock.mockResolvedValue(viewerOk);
		await auth.init();
		expect(auth.token).toBe('stored');
		expect(auth.viewer).toEqual(viewer);
		expect(auth.signedIn).toBe(true);
	});

	it('drops a revoked stored token silently', async () => {
		localStorage.setItem('dk:token', JSON.stringify({ accessToken: 'revoked' }));
		fetchMock.mockResolvedValue({ ok: false, status: 401 });
		await auth.init();
		expect(auth.token).toBeNull();
		expect(localStorage.getItem('dk:token')).toBeNull();
		expect(auth.loading).toBe(false);
	});

	it('drops malformed stored credentials', async () => {
		localStorage.setItem('dk:token', '{}');
		await auth.init();
		expect(auth.token).toBeNull();
		expect(localStorage.getItem('dk:token')).toBeNull();
	});

	it('refreshes an expired GitHub App token before loading the viewer', async () => {
		localStorage.setItem(
			'dk:token',
			JSON.stringify({ accessToken: 'old', refreshToken: 'refresh', expiresAt: 1 })
		);
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		fetchMock
			.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'new' }) })
			.mockResolvedValueOnce(viewerOk);
		await auth.init();
		expect(auth.token).toBe('new');
		expect(JSON.parse(localStorage.getItem('dk:token')!)).toEqual({ accessToken: 'new' });
	});
});

describe('getToken', () => {
	it('returns null while signed out', async () => {
		expect(await auth.getToken()).toBeNull();
	});

	it('signs out when token refresh returns no access token', async () => {
		localStorage.setItem(
			'dk:token',
			JSON.stringify({ accessToken: 'old', refreshToken: 'refresh', expiresAt: 1 })
		);
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
		await auth.init();
		expect(auth.token).toBeNull();
	});
});

describe('signInWithToken', () => {
	it('trims, validates and persists the token', async () => {
		fetchMock.mockResolvedValue(viewerOk);
		await auth.signInWithToken('  tok  ');
		expect(auth.token).toBe('tok');
		expect(auth.viewer).toEqual(viewer);
		expect(JSON.parse(localStorage.getItem('dk:token')!)).toEqual({ accessToken: 'tok' });
		// cache entries become scoped to this user
		expect(setCacheScope).toHaveBeenCalledWith('alice');
		const init = fetchMock.mock.calls[0][1];
		expect(init.headers.Authorization).toBe('Bearer tok');
	});

	it('rejects on GraphQL errors without persisting', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ errors: [{ message: 'Bad credentials' }] })
		});
		await expect(auth.signInWithToken('bad')).rejects.toThrow('Bad credentials');
		expect(auth.token).toBeNull();
		expect(localStorage.getItem('dk:token')).toBeNull();
	});
});

describe('oauth', () => {
	it('reports availability only when fully configured', () => {
		expect(auth.oauthAvailable).toBe(false);
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		expect(auth.oauthAvailable).toBe(true);
	});

	it('beginOAuth stores PKCE state without requesting broad OAuth scopes', async () => {
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		await auth.beginOAuth('http://site/auth/callback');
		expect(sessionStorage.getItem('dk:oauth-state')).toBe('nonce');
		expect(sessionStorage.getItem('dk:oauth-verifier')).toBeTruthy();
		expect(sessionStorage.getItem('dk:oauth-redirect')).toBe('http://site/auth/callback');
	});

	it('completeOAuth rejects on a state mismatch', async () => {
		await expect(auth.completeOAuth('code', 'wrong')).rejects.toThrow(/state mismatch/i);
	});

	it('completeOAuth rejects when the proxy fails', async () => {
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		sessionStorage.setItem('dk:oauth-state', 'S');
		sessionStorage.setItem('dk:oauth-verifier', 'V');
		sessionStorage.setItem('dk:oauth-redirect', 'http://site/auth/callback');
		fetchMock.mockResolvedValue({ ok: false, status: 500 });
		await expect(auth.completeOAuth('code', 'S')).rejects.toThrow(/exchange failed/i);
	});

	it('completeOAuth rejects when no token is returned', async () => {
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		sessionStorage.setItem('dk:oauth-state', 'S');
		sessionStorage.setItem('dk:oauth-verifier', 'V');
		sessionStorage.setItem('dk:oauth-redirect', 'http://site/auth/callback');
		fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
		await expect(auth.completeOAuth('code', 'S')).rejects.toThrow(/no token/i);
	});

	it('completeOAuth exchanges the code and signs in', async () => {
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		sessionStorage.setItem('dk:oauth-state', 'S');
		sessionStorage.setItem('dk:oauth-verifier', 'V');
		sessionStorage.setItem('dk:oauth-redirect', 'http://site/auth/callback');
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					access_token: 'oat',
					expires_in: 3600,
					refresh_token: 'refresh',
					refresh_token_expires_in: 7200
				})
			})
			.mockResolvedValueOnce(viewerOk);
		await auth.completeOAuth('code', 'S');
		expect(auth.token).toBe('oat');
		expect(auth.viewer).toEqual(viewer);
		// proxy call carried the code
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			code: 'code',
			code_verifier: 'V',
			redirect_uri: 'http://site/auth/callback'
		});
		const stored = JSON.parse(localStorage.getItem('dk:token')!);
		expect(stored.refreshToken).toBe('refresh');
		expect(stored.expiresAt).toBeGreaterThan(Date.now());
		expect(stored.refreshTokenExpiresAt).toBeGreaterThan(stored.expiresAt);
		// nonce is single-use
		expect(sessionStorage.getItem('dk:oauth-state')).toBeNull();
		expect(sessionStorage.getItem('dk:oauth-verifier')).toBeNull();
	});

	it('does not retain OAuth credentials when viewer validation fails', async () => {
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		sessionStorage.setItem('dk:oauth-state', 'S');
		sessionStorage.setItem('dk:oauth-verifier', 'V');
		sessionStorage.setItem('dk:oauth-redirect', 'http://site/auth/callback');
		fetchMock
			.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'bad' }) })
			.mockResolvedValueOnce({ ok: false, status: 401 });
		await expect(auth.completeOAuth('code', 'S')).rejects.toThrow(/rejected/i);
		expect(auth.token).toBeNull();
		expect(localStorage.getItem('dk:token')).toBeNull();
	});

	it('signs out when an expired token cannot be refreshed', async () => {
		localStorage.setItem(
			'dk:token',
			JSON.stringify({ accessToken: 'old', refreshToken: 'bad', expiresAt: 1 })
		);
		mockConfig.auth.oauth = { clientId: 'cid', proxyUrl: 'http://proxy' };
		fetchMock.mockResolvedValue({ ok: false });
		await auth.init();
		expect(auth.token).toBeNull();
		expect(auth.signedIn).toBe(false);
	});

	it('signs out when an expired token has no refresh token', async () => {
		localStorage.setItem('dk:token', JSON.stringify({ accessToken: 'old', expiresAt: 1 }));
		await auth.init();
		expect(auth.token).toBeNull();
	});
});

describe('signOut', () => {
	it('clears all auth state', async () => {
		fetchMock.mockResolvedValue(viewerOk);
		await auth.signInWithToken('tok');
		auth.signOut();
		expect(auth.token).toBeNull();
		expect(auth.viewer).toBeNull();
		expect(localStorage.getItem('dk:token')).toBeNull();
		// cached GraphQL data is wiped and the scope reset
		expect(clearCache).toHaveBeenCalled();
		expect(setCacheScope).toHaveBeenCalledWith(null);
	});
});
