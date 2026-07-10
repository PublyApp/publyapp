/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import {
	DangerZoneCard,
	DangerZoneRow,
	DetailAside,
	DetailGrid,
	DetailMain,
} from './detail-layout';

afterEach(cleanup);

describe('DetailGrid', () => {
	test('renders the 1fr/420px handoff body grid with main and aside columns', () => {
		render(
			<DetailGrid>
				<DetailMain>
					<p>Contact details</p>
				</DetailMain>
				<DetailAside>
					<p>Account</p>
				</DetailAside>
			</DetailGrid>,
		);

		const grid = document.querySelector('[data-slot="detail-grid"]');
		expect(grid).not.toBeNull();
		expect(grid?.className).toContain('publy-detail-grid');
		expect(grid?.querySelector('[data-slot="detail-main"]')).not.toBeNull();
		expect(grid?.querySelector('[data-slot="detail-aside"]')).not.toBeNull();
		expect(screen.getByText('Contact details')).toBeTruthy();
		expect(screen.getByText('Account')).toBeTruthy();
	});
});

describe('DangerZoneCard', () => {
	test('renders the rose-ringed card with soft destructive row actions', () => {
		render(
			<DangerZoneCard title="Danger zone">
				<DangerZoneRow
					title="Suspend user"
					description="Blocks sign-in until reactivated."
					action={<button type="button">Suspend</button>}
				/>
				<DangerZoneRow
					title="Delete user"
					description="Removes the account permanently."
					action={<button type="button">Delete</button>}
				/>
			</DangerZoneCard>,
		);

		const card = document.querySelector('[data-slot="danger-zone"]');
		expect(card).not.toBeNull();
		expect(card?.className).toContain('publy-danger-zone');
		expect(screen.getByText('Danger zone')).toBeTruthy();

		const rows = card?.querySelectorAll('[data-slot="danger-zone-row"]');
		expect(rows?.length).toBe(2);
		expect(screen.getByText('Blocks sign-in until reactivated.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Suspend' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
	});
});
