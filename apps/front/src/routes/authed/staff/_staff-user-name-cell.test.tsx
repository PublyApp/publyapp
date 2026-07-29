/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: () => ({}),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		params: { userId: string };
	}) => (
		<a href={to.replace('$userId', params.userId)} {...props}>
			{children}
		</a>
	),
}));

import { MockImage } from '~/components/ui/avatar.test-helper';
import { toStaffUserRows } from '~/lib/query/staff-users';

import { StaffUserNameCell } from './_staff-user-name-cell';

beforeEach(() => {
	MockImage.instances = [];
	vi.stubGlobal('Image', MockImage);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('StaffUserNameCell avatar flow', () => {
	test('renders the avatarUrl retained by the staff-user query mapper', () => {
		const [row] = toStaffUserRows([
			{
				id: 'user-1',
				email: 'ada@example.com',
				firstName: 'Ada',
				lastName: 'Lovelace',
				avatarUrl: '/files/uploads/ada.png',
				level: 'Admin',
				status: 'Active',
			},
		]);

		expect(row).toBeDefined();
		if (!row) {
			return;
		}

		const { container } = render(<StaffUserNameCell row={row} />);

		expect(MockImage.instances[0]?.src).toBe(
			'https://api.example.test/files/uploads/ada.png',
		);

		act(() => MockImage.instances[0]?.onload?.());

		expect(container.querySelector('img')?.getAttribute('src')).toBe(
			'https://api.example.test/files/uploads/ada.png',
		);
	});
});
