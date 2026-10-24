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
	scheduleFn: vi.fn(),
	invalidateTenantPublications: vi.fn().mockResolvedValue(undefined),
	useTenantPermissions: vi.fn(),
	useTargetsQuery: vi.fn(),
}));

vi.mock('~/lib/query/tenant-permissions', () => ({
	POSTS_PUBLISH: 'tenant.posts.publish',
	SOCIAL_ACCOUNTS_PUBLISH: 'tenant.socialaccounts.publish',
	useTenantPermissions: () => mocks.useTenantPermissions(),
}));

vi.mock('~/lib/query/tenant-publish-targets', () => ({
	useTenantPublishTargetsQuery: () => mocks.useTargetsQuery(),
	toAttachLimits: () => null,
	toTenantPublishTargets: (data: { items?: unknown[] } | null) =>
		data?.items ?? [],
}));

vi.mock('~/lib/query/tenant-publications', () => ({
	publishNowMutation: { mutationFn: mocks.mutationFn },
	schedulePostMutation: { mutationFn: mocks.scheduleFn },
	invalidateTenantPublications: mocks.invalidateTenantPublications,
}));

vi.mock('~/lib/query/tenant-posts', () => ({
	invalidateTenantPosts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => TENANT_ID,
}));

vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => mocks.navigate,
}));

const EN_LABELS: TestLabelMap = {
	'posts:publish-on-heading': 'Publish on',
	'posts:destination-customize': 'Customize',
	'posts:destination-customize-aria': 'Customize for {{destination}}',
	'posts:schedule-label': 'Schedule for',
	'posts:schedule-submit': 'Schedule',
	'posts:schedule-past': 'Pick a date and time in the future.',
	'posts:publish-now-too-many-destinations': 'At most {{max}} at once',
	'posts:publish-on-empty': 'No connected profile to publish to yet.',
	'common:publish-now': 'Publish now',
	'common:an-error-occurred': 'An error occurred',
	'posts:publish-blocked-media-required': '{{destination}} needs an image',
	'posts:publish-blocked-threads-unsupported': '{{destination}} has no threads',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string>) =>
			(EN_LABELS[key] ?? key).replace(
				/\{\{(\w+)\}\}/g,
				(_match, name: string) => options?.[name] ?? '',
			),
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first
import { DestinationChips } from './_destination-chips';
import { PublishOnBlock } from './_publish-on-block';
import { newSegmentDraft } from './_segment-draft';
import { useDestinationOverrides } from './_use-destination-overrides';
import { usePublishSelection } from './_use-publish-selection';

const allowPermission = (allowed: boolean) => {
	mocks.useTenantPermissions.mockReturnValue({
		permissions: allowed
			? ['tenant.posts.publish', 'tenant.socialaccounts.publish']
			: [],
		hasPermission: (key: string) =>
			allowed &&
			(key === 'tenant.posts.publish' ||
				key === 'tenant.socialaccounts.publish'),
	});
};

// D4 round-4 follow-up: the guard requires BOTH permissions. This helper
// grants exactly ONE so we can prove the block stays null when the member
// holds only the socialaccounts verb (the asymmetric case the seeder also
// covers on the back end — PublishNowForTenant.Spec.ItShouldReturn403WithoutPostsPublishEvenWithSocialAccountsPublish).
const allowOnlyPermission = (key: string) => {
	mocks.useTenantPermissions.mockReturnValue({
		permissions: [key],
		hasPermission: (requested: string) => requested === key,
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

const stubFediverseTargets = () => {
	const base = {
		textLimits: [{ unit: 'utf16', max: 500 }],
		maxImages: 4,
		maxImageBytes: 1_000_000,
		acceptedImageContentTypes: ['image/png'],
	};
	mocks.useTargetsQuery.mockReturnValue({
		data: {
			items: [
				{
					id: TARGET_A,
					label: 'Photos',
					provider: 'pixelfed',
					limits: { ...base, requiresMedia: true, supportsThreads: false },
				},
			],
		},
		isPending: false,
		isError: false,
		error: null,
		refetch: vi.fn(),
		isFetching: false,
	});
};

const stubLimitedTargets = () => {
	const limits = {
		textLimits: [
			{ unit: 'graphemes', max: 300 },
			{ unit: 'bytes', max: 3000 },
		],
		maxImages: 4,
		maxImageBytes: 1_000_000,
		acceptedImageContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
	};
	mocks.useTargetsQuery.mockReturnValue({
		data: {
			items: [
				{ id: TARGET_A, label: 'Acme main', provider: 'bluesky', limits },
				{
					id: TARGET_B,
					label: 'Strict handle',
					provider: 'bluesky',
					limits: {
						textLimits: [
							{ unit: 'graphemes', max: 100 },
							{ unit: 'bytes', max: 3000 },
						],
						maxImages: 4,
						maxImageBytes: 1_000_000,
						acceptedImageContentTypes: [
							'image/jpeg',
							'image/png',
							'image/webp',
						],
					},
				},
			],
		},
		isPending: false,
		isError: false,
		error: null,
		refetch: vi.fn(),
		isFetching: false,
	});
};

type BlockProps = {
	postId?: string;
	body?: string;
	followUps?: string[];
	imageCount?: number;
};

const BlockHarness = ({ postId, body, followUps, imageCount }: BlockProps) => {
	const selection = usePublishSelection(null);
	const destinationOverrides = useDestinationOverrides();
	return (
		<>
			<DestinationChips
				selection={selection}
				overrides={destinationOverrides}
			/>
			<PublishOnBlock
				selection={selection}
				destinationOverrides={destinationOverrides}
				postId={postId ?? POST_ID}
				body={body}
				segments={followUps?.map((text) => newSegmentDraft(text))}
				imageKeys={Array.from(
					{ length: imageCount ?? 0 },
					(_, index) => `image-${index}`,
				)}
			/>
		</>
	);
};

const renderBlock = (props?: BlockProps) => {
	const client = new QueryClient();

	return render(
		<QueryClientProvider client={client}>
			<BlockHarness {...props} />
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

	// D4 round-4 follow-up: the guard requires BOTH posts.publish AND
	// socialaccounts.publish (AND logic — PostEndpointsForTenant.cs:46-49).
	// This test pins the asymmetric case: a member who holds only
	// socialaccounts.publish (without posts.publish) must still get null.
	test('renders nothing when the member holds only socialaccounts.publish', () => {
		allowOnlyPermission('tenant.socialaccounts.publish');
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

	test('shows the tightest destination counter and blocks Publish now over the limit', async () => {
		allowPermission(true);
		stubLimitedTargets();
		const user = userEvent.setup();

		renderBlock({ body: 'a'.repeat(120) });

		const counter = screen.getByTestId('tenant-posts-limit-counter');
		expect(counter.getAttribute('data-state')).toBe('error');
		expect(counter.textContent).toContain('120 / 100');
		expect(counter.textContent).toContain('Strict handle');
		expect(screen.getByTestId('tenant-posts-limit-error')).toBeTruthy();
		const button = screen.getByTestId('tenant-posts-publish-now');
		expect((button as HTMLButtonElement).disabled).toBe(true);

		// Unchecking the strict destination lifts the block: 120 / 300 is fine.
		await user.click(screen.getByRole('checkbox', { name: 'Strict handle' }));
		expect(
			screen
				.getByTestId('tenant-posts-limit-counter')
				.getAttribute('data-state'),
		).toBe('ok');
		expect(
			(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	test('blocks Publish now when a thread follow-up is over the limit and names its segment', async () => {
		allowPermission(true);
		stubLimitedTargets();
		const user = userEvent.setup();

		renderBlock({ body: 'short', followUps: ['fine', 'a'.repeat(120)] });

		// The first segment is fine, the third (second follow-up) is not.
		expect(
			screen
				.getByTestId('tenant-posts-limit-counter')
				.getAttribute('data-state'),
		).toBe('ok');
		expect(screen.getByTestId('tenant-posts-segment-limit-error')).toBeTruthy();
		expect(
			(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
				.disabled,
		).toBe(true);

		// Unchecking the strict destination lifts the block for that segment too.
		await user.click(screen.getByRole('checkbox', { name: 'Strict handle' }));
		expect(screen.queryByTestId('tenant-posts-segment-limit-error')).toBeNull();
		expect(
			(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	test('warns from 90 percent of the limit', () => {
		allowPermission(true);
		stubLimitedTargets();

		renderBlock({ body: 'a'.repeat(90) });

		expect(
			screen
				.getByTestId('tenant-posts-limit-counter')
				.getAttribute('data-state'),
		).toBe('warning');
		expect(
			(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
				.disabled,
		).toBe(false);
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
			destinations: [{ socialAccountId: TARGET_B }],
			tenantId: TENANT_ID,
		});
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/tenant/posts/history',
				ignoreBlocker: true,
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

	test('blocks Publish with an inline message when a photo network has no image', () => {
		allowPermission(true);
		stubFediverseTargets();

		renderBlock({ body: 'caption', imageCount: 0 });

		expect(screen.getByTestId('tenant-posts-publish-blocked').textContent).toBe(
			'Photos needs an image',
		);
		expect(
			(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	test('lets a photo post through and blocks a thread aimed at a network without threads', () => {
		allowPermission(true);
		stubFediverseTargets();

		renderBlock({ body: 'caption', imageCount: 1 });
		expect(screen.queryByTestId('tenant-posts-publish-blocked')).toBeNull();
		expect(
			(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
				.disabled,
		).toBe(false);
		cleanup();

		renderBlock({ body: 'caption', imageCount: 1, followUps: ['second'] });
		expect(screen.getByTestId('tenant-posts-publish-blocked').textContent).toBe(
			'Photos has no threads',
		);
		expect(
			(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});
