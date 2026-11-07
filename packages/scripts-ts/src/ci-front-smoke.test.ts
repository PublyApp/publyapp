import { describe, expect, it } from 'vitest';

import { hasStylesheetLink } from './ci-front-smoke.ts';

describe('ci-front-smoke', () => {
	it('accepts only a served page that links a stylesheet', () => {
		expect(
			hasStylesheetLink(
				'<html><head><link rel="stylesheet" href="/assets/app-123.css"/></head></html>',
			),
		).toBe(true);
		expect(
			hasStylesheetLink(
				'<link rel="stylesheet" media="screen" href="/assets/app.css">',
			),
		).toBe(true);
	});

	it('rejects a page with no stylesheet, a wrong rel, or a non-css href', () => {
		expect(hasStylesheetLink('<html><body>hello</body></html>')).toBe(false);
		expect(
			hasStylesheetLink('<link rel="preload" href="/assets/app.css"/>'),
		).toBe(false);
		expect(
			hasStylesheetLink('<link rel="stylesheet" href="/assets/app.js"/>'),
		).toBe(false);
	});
});
