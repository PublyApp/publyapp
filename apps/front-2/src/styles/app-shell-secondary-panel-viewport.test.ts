/**
 * W4-GUARDS (round-4 remediation, orphaned shell-F5): the r1 h-screen ->
 * h-full/h-dvh viewport-unit fix stopped at the rail (`.app-shell-rail`);
 * the secondary panel still used `h-screen`, which ignores dynamic mobile
 * browser chrome and the `h-dvh overflow-hidden` grid it sits inside, and
 * had no vertical-overflow owner for its nav list. Reads the real app.css
 * source directly and pins the fixed shape.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const appCssPath = path.join(
	path.resolve(fileURLToPath(new URL('.', import.meta.url))),
	'app.css',
);

const extractRuleBlock = (source: string, selector: string): string => {
	const normalizedSource = source.replace(/\s+/g, ' ');
	const headerIndex = normalizedSource.indexOf(`${selector} {`);
	if (headerIndex === -1) {
		throw new Error(`Rule not found: ${selector}`);
	}
	const bodyStart = normalizedSource.indexOf('{', headerIndex);
	const bodyEnd = normalizedSource.indexOf('}', bodyStart);
	return normalizedSource.slice(bodyStart, bodyEnd + 1);
};

const extractAtRuleBlocks = (source: string, atRule: string): string[] => {
	const blocks: string[] = [];
	let searchIndex = 0;

	while (searchIndex < source.length) {
		const headerIndex = source.indexOf(atRule, searchIndex);
		if (headerIndex === -1) {
			break;
		}

		const bodyStart = source.indexOf('{', headerIndex);
		if (bodyStart === -1) {
			break;
		}

		let depth = 1;
		let bodyEnd = bodyStart + 1;
		while (bodyEnd < source.length && depth > 0) {
			if (source[bodyEnd] === '{') {
				depth += 1;
			} else if (source[bodyEnd] === '}') {
				depth -= 1;
			}
			bodyEnd += 1;
		}

		blocks.push(source.slice(headerIndex, bodyEnd));
		searchIndex = bodyEnd;
	}

	return blocks;
};

describe('app-shell secondary panel viewport units (W4-GUARDS shell-F5)', () => {
	const appCssSource = readFileSync(appCssPath, 'utf8');

	test('.app-shell-secondary-panel does not use h-screen and is bounded to its grid track', () => {
		const rule = extractRuleBlock(appCssSource, '.app-shell-secondary-panel');
		expect(rule).not.toMatch(/\bh-screen\b/);
		expect(rule).toMatch(/\bh-full\b/);
		expect(rule).toMatch(/\bmin-h-0\b/);
	});

	test('.app-shell-secondary-nav owns its own vertical scroll', () => {
		const rule = extractRuleBlock(appCssSource, '.app-shell-secondary-nav');
		expect(rule).toMatch(/\boverflow-y-auto\b/);
		expect(rule).toMatch(/\bmin-h-0\b/);
	});
});

describe('app-shell secondary panel motion', () => {
	const appCssSource = readFileSync(appCssPath, 'utf8');

	test('uses a medium motion token and constant desktop grid track count', () => {
		expect(appCssSource).toContain('--publy-motion-medium: 240ms;');

		const closedRule = extractRuleBlock(
			appCssSource,
			".app-shell-workspace[data-has-secondary-panel='true']",
		);
		expect(closedRule).toMatch(/var\(--publy-shell-rail-width\)[\s\S]*0px/);

		const openRule = extractRuleBlock(
			appCssSource,
			".app-shell-workspace[data-has-secondary-panel='true'][data-panel-open='true']",
		);
		expect(openRule).toContain('var(--publy-shell-panel-width)');
	});

	test('enables the grid transition only after hydration motion is ready', () => {
		const motionRule = extractRuleBlock(
			appCssSource,
			".app-shell-workspace[data-has-secondary-panel='true'][data-motion-ready='true']",
		);
		expect(motionRule).toMatch(
			/transition:\s*grid-template-columns var\(--publy-motion-medium\) var\(--publy-motion-ease\)/,
		);
	});

	test('clips a fixed-width inner panel and delays hidden visibility on close', () => {
		const panelRule = extractRuleBlock(
			appCssSource,
			'.app-shell-secondary-panel',
		);
		expect(panelRule).toMatch(/\boverflow-hidden\b/);
		expect(panelRule).toContain('visibility: hidden');

		const innerRule = extractRuleBlock(
			appCssSource,
			'.app-shell-secondary-panel-inner',
		);
		expect(innerRule).toContain('width: var(--publy-shell-panel-width)');

		const closingRule = extractRuleBlock(
			appCssSource,
			".app-shell-workspace[data-motion-ready='true'][data-panel-open='false'] > .app-shell-secondary-panel",
		);
		expect(closingRule).toContain(
			'transition: visibility 0s var(--publy-motion-medium)',
		);
	});
});

describe('neutral authenticated shell responsive geometry', () => {
	const appCssSource = readFileSync(appCssPath, 'utf8');
	const openNeutralSelector =
		".app-shell-workspace.neutral-authed-shell[data-has-secondary-panel='true'][data-panel-open='true']";
	const closedNeutralSelector =
		"html[data-sidebar-open='false'] .app-shell-workspace.neutral-authed-shell[data-has-secondary-panel='true']";

	test('overrides the specific desktop grid tracks at tablet and mobile widths', () => {
		const tabletBlock = extractAtRuleBlocks(
			appCssSource,
			'@media (max-width: 1023px)',
		).find((block) => block.includes(openNeutralSelector));
		const mobileBlock = extractAtRuleBlocks(
			appCssSource,
			'@media (max-width: 767px)',
		).find((block) => block.includes(openNeutralSelector));

		expect(tabletBlock).toBeDefined();
		expect(mobileBlock).toBeDefined();
		if (!tabletBlock || !mobileBlock) {
			return;
		}

		const normalizedTabletBlock = tabletBlock.replace(/\s+/g, ' ');
		const normalizedMobileBlock = mobileBlock.replace(/\s+/g, ' ');
		expect(normalizedTabletBlock).toContain(closedNeutralSelector);
		expect(normalizedTabletBlock).toMatch(
			/grid-template-columns:\s*var\(--publy-shell-rail-width\)\s+minmax\(0,\s*1fr\)/,
		);
		expect(normalizedMobileBlock).toContain(closedNeutralSelector);
		expect(normalizedMobileBlock).toMatch(/grid-template-columns:\s*1fr/);
	});
});
