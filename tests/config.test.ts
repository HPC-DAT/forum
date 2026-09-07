import { describe, expect, it } from 'vitest';
import { configIncomplete, forumConfig, themeCss } from '$lib/config';

// Exercises the real resolution pipeline: root forum.config.ts merged over
// defaults, repo fallback applied, theme compiled.
describe('resolved config', () => {
	it('merges the root forum.config.ts over defaults', () => {
		expect(forumConfig.repo.owner).toBe('HPC-DAT');
		expect(forumConfig.repo.name).toBe('forum');
		expect(forumConfig.site.name).toBe('HPC-DAT Community');
		// default that forum.config.ts does not override
		expect(forumConfig.content.articles.marker).toBe('<!-- dk:article -->');
	});

	it('is not incomplete when a repo is configured', () => {
		expect(configIncomplete).toBe(false);
	});

	it('compiles the HPC-DAT theme overrides', () => {
		expect(themeCss).toContain('--fd-primary:hsl(190 70% 36%)');
		expect(themeCss).toContain('.dark{');
	});
});
