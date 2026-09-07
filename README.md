# HPC-DAT Community Forum

The community space for researchers using HPC-DAT to move familiar Python, PyData,
Jupyter, and Dask workflows onto high-performance computing resources.

- Forum: <https://hpc-dat.github.io/forum/>
- Project website: <https://hpc-dat.github.io/>
- GitHub organization: <https://github.com/HPC-DAT>

The forum is a static SvelteKit site backed by this repository's GitHub Discussions.
Signed-out visitors read a periodically refreshed public snapshot; signing in enables
posting, replies, reactions, and accepted answers.

## Topics

- **News**: maintainer announcements, events, and project updates
- **Questions and Help**: answerable technical questions
- **General**: community conversation
- **Ideas and Feedback**: proposals and project feedback
- **Use Cases and Showcases**: research workflows and outcomes

## Development

```sh
npm ci
npm run dev
npm run check
npm run test:coverage
BASE_PATH=/forum npm run build
```

Configuration is in [`forum.config.ts`](forum.config.ts). Architecture and archive
documentation are in [`docs/`](docs/README.md).

## Authentication Setup

The deployed forum uses an organization-owned GitHub App installed only on
`HPC-DAT/forum`. The App needs `Metadata: read` and `Discussions: read and write`.
Its callback URL is:

```text
https://hpc-dat.github.io/forum/auth/callback
```

Deploy [`oauth-proxy/worker.js`](oauth-proxy/worker.js) to Cloudflare, set the values
described in [`oauth-proxy/README.md`](oauth-proxy/README.md), then place the public
client ID and Worker URL in `forum.config.ts`. Fine-grained PAT login remains the
fallback until those values are configured.

## Upstream

Created from [NotReeceHarris/discussion-kit](https://github.com/NotReeceHarris/discussion-kit)
at upstream commit `aaa3c62efd6e98b356b7a479f72bd64278192c8a`. Upstream changes should
be reviewed and tested before being ported here.

This repository remains licensed under GPL-3.0 as required by Discussion Kit.
