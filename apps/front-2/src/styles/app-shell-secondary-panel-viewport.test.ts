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
	const headerIndex = source.indexOf(`${selector} {`);
	if (headerIndex === -1) {
		throw new Error(`Rule not found: ${selector}`);
	}
	const bodyStart = source.indexOf('{', headerIndex);
	const bodyEnd = source.indexOf('}', bodyStart);
	return source.slice(bodyStart, bodyEnd + 1);
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
