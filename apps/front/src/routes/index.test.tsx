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

import { IndexRoute } from './index';

describe('marketing landing route', () => {
	test('renders core landing sections and copy', () => {
		const html = renderToStaticMarkup(<IndexRoute />);

		expect(html).toContain('landing-hero-title');
		expect(html).toContain('landing-tour-title');
		expect(html).toContain('landing-bento-title');
		expect(html).toContain('landing-timeline-title');
		expect(html).toContain('landing-faq-title');
	});

	test('keeps the required navigation targets', () => {
		const html = renderToStaticMarkup(<IndexRoute />);

		expect(html).toContain('href="/signup"');
		expect(html).toContain('href="#product-tour"');
	});

	test('renders all tour tab labels', () => {
		const html = renderToStaticMarkup(<IndexRoute />);

		expect(html).toContain('landing-tour-tab-calendar-label');
		expect(html).toContain('landing-tour-tab-composer-label');
		expect(html).toContain('landing-tour-tab-approvals-label');
		expect(html).toContain('landing-tour-tab-profiles-label');
		expect(html).toContain('landing-tour-tab-dashboards-label');
	});
});
