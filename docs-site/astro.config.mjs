// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import mermaid from 'astro-mermaid';
import starlightLinksValidator from 'starlight-links-validator';

export default defineConfig({
	integrations: [
		mermaid({
			autoTheme: true,
			enableLog: false,
			theme: 'neutral',
			mermaidConfig: {
				flowchart: { curve: 'basis' },
				fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans KR, sans-serif',
			},
		}),
		starlight({
			customCss: ['./src/styles/custom.css'],
			editLink: {
				baseUrl: 'https://github.com/nunch-dev/nunch-skills/edit/main/docs-site/src/content/docs/',
			},
			favicon: '/favicon.svg',
			head: [
				{
					tag: 'meta',
					attrs: {
						content: 'Codex와 Claude Code에서 사용하는 Nunch Skills 문서',
						name: 'description',
					},
				},
			],
			lastUpdated: true,
			locales: { root: { label: '한국어', lang: 'ko' } },
			plugins: [starlightLinksValidator()],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/nunch-dev/nunch-skills' },
			],
			sidebar: [
				{
					label: '시작하기',
					items: [{ label: '설치와 첫 사용', slug: 'getting-started' }],
				},
				{
					label: '스킬',
					items: [
						{ label: '스킬 고르기', slug: 'skills' },
						{ label: 'deep-interview', slug: 'skills/deep-interview' },
						{ label: 'docs-fairy', slug: 'skills/docs-fairy' },
						{ label: 'git-tools', slug: 'skills/git-tools' },
						{ label: 'humanize-korean', slug: 'skills/humanize-korean' },
						{ label: 'humanize', slug: 'skills/humanize' },
						{ label: 'humanize-redo', slug: 'skills/humanize-redo' },
						{ label: 'i-have-adhd', slug: 'skills/i-have-adhd' },
						{ label: 'kaneo-skills', slug: 'skills/kaneo-skills' },
					],
				},
				{
					label: '운영 가이드',
					items: [
						{ label: '로컬 개발과 QA', slug: 'guides/local-development' },
						{ label: '릴리스 런북', slug: 'guides/release-runbook' },
					],
				},
			],
			tagline: 'Codex와 Claude Code를 위한 검증 가능한 스킬 모음',
			title: 'Nunch Skills',
		}),
	],
});
