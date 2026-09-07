# HPC-DAT forum authentication proxy

This Cloudflare Worker exchanges browser authorization codes and refresh tokens for
repository-scoped GitHub App user tokens. The App client secret remains in Cloudflare.

## GitHub App

Create an organization-owned GitHub App with:

- Homepage URL: `https://hpc-dat.github.io/forum/`
- Callback URL: `https://hpc-dat.github.io/forum/auth/callback`
- Metadata permission: read
- Discussions permission: read and write
- User access token expiration: enabled
- Installation: only `HPC-DAT/forum`

No webhook or private key is needed for this user-to-server flow.

## Worker

Set these non-secret variables in `wrangler.toml` or the Cloudflare dashboard:

- `ALLOWED_ORIGINS=https://hpc-dat.github.io,http://localhost:5173`
- `GITHUB_CLIENT_ID=<GitHub App client ID>`
- `GITHUB_REPOSITORY_ID=R_kgDOUQngdQ`

Set the secret and deploy:

```sh
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

Finally set the GitHub App client ID and deployed Worker URL in `forum.config.ts`.
The browser authorization uses PKCE and the Worker restricts the resulting token to
the forum repository ID. Access tokens expire after eight hours and are refreshed
through the same Worker.
