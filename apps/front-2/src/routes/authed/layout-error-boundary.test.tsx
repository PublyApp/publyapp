import { cleanup, render, screen } from '@testing-library/react';
/** @vitest-environment jsdom */
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, test, vi } from 'vitest';

import enResource from '@org/shared-ts/lib/i18n/locales/en';
import frResource from '@org/shared-ts/lib/i18n/locales/fr';

// shell-r5-F2: the wave-4 hardcoded-copy guard was reported green with a
// LIVE `code="500 — Server Error"` literal still present at
// `authed/layout.tsx:262` — its detector only recognized a small
// `aria-label|placeholder|title` attribute allowlist and required an
// uppercase-leading value, so a numeric-leading custom prop like `code`
// was invisible to it. `layout.test.tsx` (the file's existing suite)
// mocks both `AppErrorView` (so `code` is never rendered) AND
// `react-i18next` (`t: (key) => key`, a passthrough that can't
// distinguish a real translation from a raw literal) — neither variant
// could ever have caught this. This suite renders the REAL
// `AppErrorView` under a REAL i18next instance in both locales, so a
// hardcoded English literal shows up as English in the French render.
vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children, to }: { children?: ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock above
import { Route } from './layout';

const buildI18n = (lng: 'en' | 'fr') => {
	const instance = createInstance();
	void instance.use(initReactI18next).init({
		lng,
		fallbackLng: 'en',
		ns: ['common'],
		defaultNS: 'common',
		resources: {
			en: { common: enResource.common },
			fr: { common: frResource.common },
		},
		interpolation: { escapeValue: false },
		initImmediate: false,
	});
	return instance;
};

const AuthedLayoutErrorBoundary = (
	Route as unknown as {
		errorComponent: (props: { error: unknown; reset: () => void }) => ReactNode;
	}
).errorComponent;

describe('authed layout 500 branch renders a translated code, not a hardcoded English literal (shell-r5-F2)', () => {
	afterEach(() => {
		cleanup();
	});

	// r5/W5-HARDEN item 6: the English literal ("500 — Server Error") is
	// identical to its translated value, so asserting only the rendered text
	// cannot distinguish a real t('error-500-code') call from a hardcoded
	// string that happens to match — it would pass against either. Spying on
	// the i18n instance's `t` proves the translation path is actually taken.
	test('English: renders the translated 500 code, calling t() rather than a hardcoded literal', () => {
		const i18n = buildI18n('en');
		const tSpy = vi.spyOn(i18n, 't');

		render(
			<I18nextProvider i18n={i18n}>
				<AuthedLayoutErrorBoundary error={new Error('boom')} reset={vi.fn()} />
			</I18nextProvider>,
		);

		expect(screen.getByText('500 — Server Error')).toBeTruthy();
		expect(tSpy.mock.calls.some((call) => call[0] === 'error-500-code')).toBe(
			true,
		);
	});

	test('French: renders the French 500 code, not the hardcoded English literal', () => {
		render(
			<I18nextProvider i18n={buildI18n('fr')}>
				<AuthedLayoutErrorBoundary error={new Error('boom')} reset={vi.fn()} />
			</I18nextProvider>,
		);

		expect(screen.getByText('500 — Erreur serveur')).toBeTruthy();
		expect(screen.queryByText('500 — Server Error')).toBeNull();
	});
});
