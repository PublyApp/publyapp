/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { PageHeader, PillTabs, StatusPill, DetailRow } from './product-page';

afterEach(cleanup);

describe('PageHeader', () => {
	test('does not render an empty count wrapper when count is null', () => {
		const { container } = render(<PageHeader title="Tenants" count={null} />);

		expect(container.querySelector('.gap-2\\.5')).toBeNull();
	});

	test('renders the count wrapper when count is provided', () => {
		render(<PageHeader title="Tenants" count={<span>12</span>} />);

		expect(screen.getByText('12')).toBeTruthy();
	});

	// #2280: at 390px the title must truncate instead of painting over the
	// actions. The header is one row at every width, so the statistics chevron
	// (trailing chrome) sits on the title's line at the right.
	test('keeps the trailing chrome on the title row under md', () => {
		const { container } = render(
			<PageHeader
				title="Organisations"
				trailingActions={<button type="button">Stats</button>}
			/>,
		);

		const header = container.querySelector('header');
		expect(header?.className).not.toContain('max-md:flex-col');
		expect(header?.className).toContain('max-md:items-center');

		const title = screen.getByRole('heading', { name: 'Organisations' });
		expect(title.className).toContain('max-md:truncate');

		const cluster = screen.getByRole('button', { name: 'Stats' }).parentElement;
		expect(cluster?.className).toContain('max-md:shrink-0');
		expect(header?.lastElementChild).toBe(cluster);
	});
});

describe('StatusPill', () => {
	test('renders children and applies tone', () => {
		render(<StatusPill tone="danger">Active</StatusPill>);

		expect(screen.getByText('Active')).toBeTruthy();
		const pill = screen.getByText('Active').closest('[data-tone="danger"]');
		expect(pill).not.toBeNull();
	});
});

describe('DetailRow', () => {
	test('renders a label/value pair with dedicated semantic wrappers', () => {
		render(<DetailRow label="Owner" value="Ada Lovelace" />);

		expect(screen.getByText('Owner')).toBeTruthy();
		expect(screen.getByText('Ada Lovelace')).toBeTruthy();
	});
});

describe('PillTabs', () => {
	test('renders its children inside the pill tabs container', () => {
		render(
			<PillTabs>
				<div>Overview</div>
			</PillTabs>,
		);

		expect(screen.getByText('Overview')).toBeTruthy();
		expect(
			screen.getByText('Overview').closest('.publy-pill-tabs'),
		).not.toBeNull();
	});
});
