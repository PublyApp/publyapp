/**
 * @vitest-environment jsdom
 *
 * #1541 (promise 2): the vendored SimpleBar CSS keeps the scrollbar thumb
 * visible while focus sits anywhere inside the scroller. The contract is a
 * single `[data-simplebar]:focus-within .simplebar-scrollbar::before { … }`
 * rule that targets the pseudo-element produced by SimpleBar's track. We
 * prove it against the REAL stylesheet that ships in `app.css`, not a
 * fixture: a synthetic stylesheet could agree with itself forever and tell
 * us nothing about whether the runtime CSS still does the job.
 *
 * The previous test suite (`scroll-area.test.tsx`) only covered that the
 * ancestor of the focused option was the SimpleBar wrapper — never that
 * giving focus to a child of the host actually matched the `:focus-within`
 * rule that reveals the thumb. This is that proof.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { ScrollArea } from './scroll-area';

const APP_CSS_PATH = join(__dirname, '..', '..', 'styles', 'app.css');

afterEach(cleanup);

describe('ScrollArea focus-within policy (#1541 promise 2)', () => {
	test('the real app.css carries the [data-simplebar]:focus-within rule that reveals the thumb', () => {
		const css = readFileSync(APP_CSS_PATH, 'utf8');
		// Pull the rule whose selector is [data-simplebar]:focus-within and
		// whose body targets .simplebar-scrollbar::before. We slice the file
		// rather than rely on a regex-with-capture because the rule body also
		// contains `transition-delay: 0s;` and `transition-duration: 0s;` —
		// pinning the body exactly guards against a future "let me just
		// fade it in slower" rewrite that silently undoes the promise.
		const focusWithinRule =
			/\[data-simplebar\]:focus-within\s+\.simplebar-scrollbar::before\s*\{([^}]*)\}/u;
		const match = css.match(focusWithinRule);
		expect(
			match,
			'the focus-within reveal rule must exist in app.css',
		).not.toBeNull();
		expect(match?.[1]).toMatch(/opacity\s*:\s*0\.6\b/);
		expect(match?.[1]).toMatch(/transition-delay\s*:\s*0s\b/);
		expect(match?.[1]).toMatch(/transition-duration\s*:\s*0s\b/);
		// And the rule must not have been hollowed into a no-op.
		expect(match?.[1]).not.toMatch(/display\s*:\s*none\b/);
		expect(match?.[1]).not.toMatch(/opacity\s*:\s*0(?!\.)/);
	});

	test('focusing a child of the scroller matches :focus-within on the [data-simplebar] host', () => {
		const result = render(
			<ScrollArea scrollAreaLabel="Liste focus">
				<button type="button" data-testid="focus-child">
					premier
				</button>
			</ScrollArea>,
		);

		const host = document.querySelector('[data-simplebar="init"]');
		const child = result.getByTestId('focus-child');

		expect(host).not.toBeNull();
		expect(host?.matches(':focus')).toBe(false);

		child.focus();
		expect(document.activeElement).toBe(child);
		expect(host?.matches(':focus-within')).toBe(true);
	});

	test('moving focus outside the scroller ends the :focus-within match', () => {
		const result = render(
			<ScrollArea scrollAreaLabel="Liste blur">
				<button type="button" data-testid="blur-child">
					deuxième
				</button>
			</ScrollArea>,
		);

		const host = document.querySelector('[data-simplebar="init"]');
		const child = result.getByTestId('blur-child');

		child.focus();
		expect(document.activeElement).toBe(child);
		// jsdom does not fire a real focus-in event on the ancestor, so
		// :focus-within is not reliably updated. Check via activeElement
		// containment instead.
		expect(host?.contains(document.activeElement)).toBe(true);

		// jsdom doesn't always re-route activeElement on blur events; focus
		// a sibling explicitly OUTSIDE the scroller instead.
		const sibling = document.createElement('button');
		sibling.textContent = 'outside';
		document.body.appendChild(sibling);
		sibling.focus();
		expect(document.activeElement).toBe(sibling);
		expect(host?.contains(document.activeElement)).toBe(false);
		document.body.removeChild(sibling);
	});
});
