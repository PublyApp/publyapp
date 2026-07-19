/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useStaffTenantProfilesQuery: vi.fn(),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				profiles: 'Profiles',
				'select-profiles': 'Select profiles',
				default: 'Default',
				'unable-to-load-profiles': 'Unable to load profiles.',
			})[key] ?? key,
	}),
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	useStaffTenantProfilesQuery: mocks.useStaffTenantProfilesQuery,
	toStaffTenantProfileRows: (items: unknown[]) => items,
}));

import { InviteProfileSelect } from './_invite-profile-select';

const TestForm = () => {
	const methods = useForm({ defaultValues: { profileIds: [] as string[] } });
	return (
		<FormProvider {...methods}>
			<InviteProfileSelect
				tenantId="tenant-1"
				name="profileIds"
				label="Profiles"
				onSessionExpired={vi.fn()}
			/>
			<output data-testid="selected-profile-ids">
				{methods.watch('profileIds').join(',')}
			</output>
		</FormProvider>
	);
};

describe('InviteProfileSelect', () => {
	test('renders default status, visible checkboxes, and selected profile chips keyed by id', async () => {
		mocks.useStaffTenantProfilesQuery.mockReturnValue({
			data: {
				data: [
					{ id: 'profile-1', name: 'Everyone', isDefault: true },
					{ id: 'profile-2', name: 'Reviewers', isDefault: false },
				],
			},
			isPending: false,
			isError: false,
		});

		render(<TestForm />);

		fireEvent.click(screen.getByRole('button', { name: 'Profiles' }));

		expect(screen.getByText('Default')).toBeTruthy();
		expect(
			document.querySelectorAll(
				'[data-slot="dropdown-menu-checkbox-item-box"]',
			),
		).toHaveLength(2);

		fireEvent.click(screen.getByText('Reviewers'));

		await waitFor(() =>
			expect(screen.getByTestId('selected-profile-ids').textContent).toBe(
				'profile-2',
			),
		);
		expect(screen.getAllByText('Reviewers').length).toBeGreaterThan(1);
	});
});
