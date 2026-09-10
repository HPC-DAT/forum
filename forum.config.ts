import { defineForumConfig } from './src/lib/config/schema';

export default defineForumConfig({
	site: {
		name: 'HPC-DAT Community',
		description: 'Questions, ideas, news, and practical help for research computing at scale',
		logoUrl: '/hpc-dat-logo.png',
		footer: 'HPC-DAT | High Performance Computing - Distributed Analysis Training'
	},

	repo: {
		owner: 'HPC-DAT',
		name: 'forum'
	},

	nav: [
		{ label: 'Home', href: 'https://hpc-dat.github.io/', external: true },
		{ label: 'Organization', href: 'https://github.com/HPC-DAT', external: true },
		{ label: 'News', href: 'https://hpc-dat.github.io/#news', external: true }
	],

	auth: {
		allowToken: true,
		oauth: {
			clientId: 'Iv23li5HMbsnxhnAHYeH',
			proxyUrl: 'https://hpc-dat-forum-auth.m-grootes.workers.dev'
		}
	},

	admins: {
		logins: ['meiertgrootes'],
		badgeLabel: 'HPC-DAT'
	},

	content: {
		pageSize: 25,
		sort: 'CREATED_AT',
		articles: { enabled: false },
		topics: {
			include: [],
			exclude: ['polls'],
			restricted: ['news']
		}
	},

	features: {
		search: true,
		reactions: true,
		upvotes: true
	},

	rep: {
		enabled: false
	},

	archive: {
		enabled: true
	},

	theme: {
		light: {
			primary: 'hsl(190 70% 36%)',
			primaryForeground: 'hsl(0 0% 100%)',
			link: 'hsl(191 78% 31%)',
			ring: 'hsl(190 70% 36%)'
		},
		dark: {
			primary: 'hsl(187 68% 55%)',
			primaryForeground: 'hsl(199 60% 12%)',
			link: 'hsl(187 68% 62%)',
			ring: 'hsl(187 68% 55%)'
		}
	}
});
