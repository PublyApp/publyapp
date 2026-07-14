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
