/**
 * @vitest-environment jsdom
 */
// Task 8 RED: the composer "Publish on" block (plan D2 Task 8 contract).
// Gate on tenant.socialaccounts.publish, one checked box per visible target,
// unchecked-all disables Publish now, publish fires the checked ids then
// navigates to /tenant/posts/history, failures surface through
// getFailureMessage(toApiFailure(error)).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const TARGET_A = '01890a5d-ac96-774b-bcce-b302099a8057';
const TARGET_B = '01890a5d-ac96-774b-bcce-b302099a8058';
const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const POST_ID = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	mutationFn: vi.fn(),
	invalidateTenantPublications: vi.fn().mockResolvedValue(undefined),
	useTenantPermissions: vi.fn(),
	useTargetsQuery: vi.fn(),
}));

vi.mock('~/lib/query/tenant-permissions', () => ({
	SOCIAL_ACCOUNTS_PUBLISH: 'tenant.socialaccounts.publish',
	useTenantPermissions: () => mocks.useTenantPermissions(),
}));

vi.mock('~/lib/query/tenant-publish-targets', () => ({
	useTenantPublishTargetsQuery: () => mocks.useTargetsQuery(),
	toTenantPublishTargets: (data: { items?: unknown[] } | null) =>
		data?.items ?? [],
}));

vi.mock('~/lib/query/tenant-publications', () => ({
	publishNowMutation: { mutationFn: mocks.mutationFn },
	invalidateTenantPublications: mocks.invalidateTenantPublications,
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => TENANT_ID,
}));

vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => mocks.navigate,
}));

const EN_LABELS: TestLabelMap = {
	'posts:publish-on-heading': 'Publish on',
	'posts:publish-on-empty': 'No connected profile to publish to yet.',
	'common:publish-now': 'Publish now',
	'common:an-error-occurred': 'An error occurred',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first
import { PublishOnBlock } from './_publish-on-block';

const allowPermission = (allowed: boolean) => {
	mocks.useTenantPermissions.mockReturnValue({
		permissions: allowed ? ['tenant.socialaccounts.publish'] : [],
		hasPermission: (key: string) =>
			allowed && key === 'tenant.socialaccounts.publish',
	});
};

const stubTargets = () => {
	mocks.useTargetsQuery.mockReturnValue({
		data: {
			items: [
				{ id: TARGET_A, label: 'Acme main', provider: 'bluesky' },
				{ id: TARGET_B, label: 'Second handle', provider: 'bluesky' },
			],
		},
		isPending: false,
		isError: false,
		error: null,
		refetch: vi.fn(),
		isFetching: false,
	});
};

const renderBlock = (props?: { postId?: string }) => {
	const client = new QueryClient();

	return render(
		<QueryClientProvider client={client}>
			<PublishOnBlock projectId={null} postId={props?.postId ?? POST_ID} />
		</QueryClientProvider>,
	);
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('PublishOnBlock', () => {
	test('renders nothing without the socialaccounts.publish permission', () => {
		allowPermission(false);
		stubTargets();

		const { container } = renderBlock();

		expect(container.innerHTML).toBe('');
	});

	test('stays rendered with the empty state when the targets query fails', () => {
		// Round-2 pairing with the front-e2e root cause (PR #1457 round 1): a
		// refused publish-targets call must NOT collapse the whole "Publish on"
		// surface. With the demo seeding + fake provider the query succeeds, but
		// if it ever fails again the block keeps its heading and shows the
		// explicit empty state so the failure stays observable in the composer.
		allowPermission(true);
		mocks.useTargetsQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			error: new Error('publish targets refused'),
			refetch: vi.fn(),
			isFetching: false,
		});

		renderBlock();

		expect(screen.getByTestId('tenant-posts-publish-on-block')).toBeTruthy();
		expect(
			screen.getByText('No connected profile to publish to yet.'),
		).toBeTruthy();
	});

	test('renders one checked box per visible target', () => {
		allowPermission(true);
		stubTargets();

		renderBlock();

		for (const name of ['Acme main', 'Second handle']) {
			const box = screen.getByRole('checkbox', { name });
			expect(box.getAttribute('aria-checked')).toBe('true');
		}
	});

	test('disables Publish now after unchecking every target', async () => {
		allowPermission(true);
		stubTargets();
		const user = userEvent.setup();

		renderBlock();

		await user.click(screen.getByRole('checkbox', { name: 'Acme main' }));
		await user.click(screen.getByRole('checkbox', { name: 'Second handle' }));

		const button = screen.getByTestId('tenant-posts-publish-now');
		expect((button as HTMLButtonElement).disabled).toBe(true);
	});

	test('publishes the checked ids then navigates to history', async () => {
		allowPermission(true);
		stubTargets();
		mocks.mutationFn.mockResolvedValue({});
		const user = userEvent.setup();

		renderBlock();

		await user.click(screen.getByRole('checkbox', { name: 'Acme main' }));
		await user.click(screen.getByTestId('tenant-posts-publish-now'));

		await waitFor(() => {
			expect(mocks.mutationFn).toHaveBeenCalledTimes(1);
		});
		expect(mocks.mutationFn).toHaveBeenCalledWith({
			postId: POST_ID,
			accountIds: [TARGET_B],
			tenantId: TENANT_ID,
		});
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/tenant/posts/history',
			});
		});
		expect(mocks.invalidateTenantPublications).toHaveBeenCalledWith(
			expect.anything(),
			TENANT_ID,
		);
	});

	test('shows the in-progress pill while publishing', async () => {
		allowPermission(true);
		stubTargets();
		let resolvePublish: (() => void) | undefined;
		mocks.mutationFn.mockReturnValue(
			new Promise<void>((resolve) => {
				resolvePublish = resolve;
			}),
		);
		const user = userEvent.setup();

		renderBlock();

		await user.click(screen.getByTestId('tenant-posts-publish-now'));

		expect(screen.getByTestId('tenant-posts-publish-in-progress')).toBeTruthy();

		resolvePublish?.();
		await waitFor(() => {
			expect(
				screen.queryByTestId('tenant-posts-publish-in-progress'),
			).toBeNull();
		});
	});

	test('surfaces the failure through getFailureMessage(toApiFailure(error))', async () => {
		allowPermission(true);
		stubTargets();
		mocks.mutationFn.mockRejectedValue(new Error('boom'));
		const user = userEvent.setup();

		renderBlock();

		await user.click(screen.getByTestId('tenant-posts-publish-now'));

		const alert = await screen.findByRole('alert');
		expect(alert.textContent?.length ?? 0).toBeGreaterThan(0);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
