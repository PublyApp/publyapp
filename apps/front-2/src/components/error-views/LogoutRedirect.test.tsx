/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	logout: vi.fn(),
}));

vi.mock('~/lib/hooks/use-logout', () => ({
	useLogout: () => ({ logout: mocks.logout, isLoggingOut: false }),
}));

import { LogoutRedirect } from './LogoutRedirect';

describe('LogoutRedirect', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	test('triggers the shared logout sequence with redirect_cause=invalid_session on mount', async () => {
		render(<LogoutRedirect />);

		await waitFor(() =>
			expect(mocks.logout).toHaveBeenCalledWith({
				redirectCause: 'invalid_session',
			}),
		);
		expect(mocks.logout).toHaveBeenCalledTimes(1);
	});

	test('defaults to embedded — a div, not a nested main landmark', () => {
		const { container } = render(<LogoutRedirect />);

		expect(container.querySelector('main')).toBeNull();
	});

	test('embedded={false} opts into the full-page main landmark', () => {
		const { container } = render(<LogoutRedirect embedded={false} />);

		expect(container.querySelector('main')).not.toBeNull();
	});
});
