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

		expect(html).toContain('Publish everywhere your brands live');
		expect(html).toContain('Product tour');
		expect(html).toContain('Built for the work that does not fit in one inbox');
		expect(html).toContain('Trial timeline');
		expect(html).toContain('Questions teams ask at first look');
	});

	test('keeps the required navigation targets', () => {
		const html = renderToStaticMarkup(<IndexRoute />);

		expect(html).toContain('href="/signup"');
		expect(html).toContain('href="#product-tour"');
	});

	test('renders all tour tab labels', () => {
		const html = renderToStaticMarkup(<IndexRoute />);

		expect(html).toContain('Calendar');
		expect(html).toContain('Composer');
		expect(html).toContain('Approvals');
		expect(html).toContain('Profiles');
		expect(html).toContain('Dashboards');
	});
});
