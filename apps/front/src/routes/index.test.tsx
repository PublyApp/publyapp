import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: 'en' },
	}),
}));

import { IndexRoute } from './index';

describe('front index route', () => {
	test('renders neutral, translated copy — no internal handoff jargon', () => {
		const html = renderToStaticMarkup(<IndexRoute />);

		expect(html).toContain('welcome-title');
		expect(html).toContain('welcome-description');
		expect(html).not.toContain('front shell');
		expect(html).not.toContain('Gray UI shell is active');
	});

	test('links to /login as a real navigable action, not a dead button', () => {
		const html = renderToStaticMarkup(<IndexRoute />);

		expect(html).toContain('href="/login"');
	});
});
