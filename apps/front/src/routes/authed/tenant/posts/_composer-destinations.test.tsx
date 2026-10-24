/**
 * @vitest-environment jsdom
 */
// Issue #2172 part B2: the multi-destination composer. One shared editor, a
// chip per connected account, a per-destination "Customize" tab (override
// toggle per field, counters per tab), "Reset to shared", and a submit that
// sends `destinations[]` with overrides only for the customized destinations.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { translateEnBundles } from '~/lib/testing/translate-en-bundles';

const TARGET_A = '01890a5d-ac96-774b-bcce-b302099a8057';
const TARGET_B = '01890a5d-ac96-774b-bcce-b302099a8058';
const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const POST_ID = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	publishNow: vi.fn(),
	schedule: vi.fn(),
	targets: vi.fn(),
	invalidatePosts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/lib/query/tenant-permissions', () => ({
	POSTS_PUBLISH: 'tenant.posts.publish',
	SOCIAL_ACCOUNTS_PUBLISH: 'tenant.socialaccounts.publish',
	useTenantPermissions: () => ({
		permissions: [],
		hasPermission: () => true,
	}),
}));

vi.mock('~/lib/query/tenant-publish-targets', () => ({
	useTenantPublishTargetsQuery: () => mocks.targets(),
	toAttachLimits: () => null,
	toTenantPublishTargets: (data: { items?: unknown[] } | null) =>
		data?.items ?? [],
}));

vi.mock('~/lib/query/tenant-publications', () => ({
	publishNowMutation: { mutationFn: mocks.publishNow },
	schedulePostMutation: { mutationFn: mocks.schedule },
	invalidateTenantPublications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/lib/query/tenant-posts', () => ({
	invalidateTenantPosts: mocks.invalidatePosts,
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => TENANT_ID,
}));

vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: translateEnBundles,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { ComposerDestinations } from './_composer-destinations';
import type { ComposerImage } from './_destination-media-field';
import { PublishOnBlock } from './_publish-on-block';
import { newSegmentDraft } from './_segment-draft';
import { useDestinationOverrides } from './_use-destination-overrides';
import { usePublishSelection } from './_use-publish-selection';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const limitsOf = (graphemes: number, extra = {}) => ({
	textLimits: [
		{ unit: 'graphemes', max: graphemes },
		{ unit: 'bytes', max: 100_000 },
	],
	maxImages: 4,
	maxImageBytes: 1_000_000,
	acceptedImageContentTypes: IMAGE_TYPES,
	...extra,
});

const stubTargets = (items: unknown[]) => {
	mocks.targets.mockReturnValue({
		data: { items },
		isPending: false,
		isError: false,
		error: null,
		refetch: vi.fn(),
		isFetching: false,
	});
};

/** A roomy handle and a strict one (100 characters): the two destinations the
 * acceptance scenario customizes between. */
const stubTwoTargets = () =>
	stubTargets([
		{
			id: TARGET_A,
			label: 'Acme main',
			provider: 'bluesky',
			limits: limitsOf(300),
		},
		{
			id: TARGET_B,
			label: 'Strict handle',
			provider: 'bluesky',
			limits: limitsOf(100),
		},
	]);

const NO_IMAGES: ComposerImage[] = [];

type HarnessProps = {
	initialBody?: string;
	followUps?: string[];
	images?: ComposerImage[];
	/** Unsaved edits to the shared post (edit page). */
	isPostDirty?: boolean;
	onBeforePublish?: () => Promise<{ postId: string } | null>;
};

const Harness = ({
	initialBody = '',
	followUps = [],
	images: initialImages = NO_IMAGES,
	isPostDirty = false,
	onBeforePublish,
}: HarnessProps) => {
	const [body, setBody] = useState(initialBody);
	const [images, setImages] = useState(initialImages);
	const [segments] = useState(() =>
		followUps.map((text) => newSegmentDraft(text)),
	);
	const selection = usePublishSelection(null);
	const destinationOverrides = useDestinationOverrides();

	return (
		<>
			<textarea
				aria-label="Shared body"
				value={body}
				onChange={(event) => setBody(event.target.value)}
			/>
			{images.map((image) => (
				<button
					key={image.key}
					type="button"
					data-testid={`remove-image-${image.key}`}
					onClick={() =>
						setImages((current) =>
							current.filter((candidate) => candidate.key !== image.key),
						)
					}
				>
					{`Remove ${image.key}`}
				</button>
			))}
			<ComposerDestinations
				selection={selection}
				destinationOverrides={destinationOverrides}
				body={body}
				segments={segments}
				images={images}
			/>
			<PublishOnBlock
				selection={selection}
				destinationOverrides={destinationOverrides}
				postId={POST_ID}
				body={body}
				segments={segments}
				imageKeys={images.map((image) => image.key)}
				isPostDirty={isPostDirty}
				onBeforePublish={onBeforePublish}
			/>
		</>
	);
};

const renderComposer = (props: HarnessProps = {}) =>
	render(
		<QueryClientProvider client={new QueryClient()}>
			<Harness {...props} />
		</QueryClientProvider>,
	);

const block = () => screen.getByTestId('tenant-posts-publish-on-block');
const panel = () => screen.getByTestId('tenant-posts-destination-panel');
const blockCounter = () =>
	within(block()).getByTestId('tenant-posts-limit-counter');
const publishNowButton = () =>
	screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement;

const openTab = async (
	user: ReturnType<typeof userEvent.setup>,
	label: string,
) => {
	await user.click(
		screen.getByRole('button', { name: `Customize for ${label}` }),
	);
};

/** Turns the n-th text override toggle of the open tab on. */
const customizeText = async (
	user: ReturnType<typeof userEvent.setup>,
	index = 0,
) => {
	await user.click(
		within(panel()).getAllByTestId('tenant-posts-destination-text-toggle')[
			index
		] as HTMLElement,
	);
};

const replaceText = async (
	user: ReturnType<typeof userEvent.setup>,
	text: string,
	index = 0,
) => {
	const field = within(panel()).getAllByTestId('tenant-posts-destination-text')[
		index
	] as HTMLElement;
	await user.clear(field);
	await user.type(field, text);
};

const ORIGINAL_TIME_ZONE = process.env.TZ;

beforeEach(() => {
	mocks.publishNow.mockResolvedValue({});
	mocks.schedule.mockResolvedValue({});
	stubTwoTargets();
});

afterEach(() => {
	if (ORIGINAL_TIME_ZONE === undefined) {
		delete process.env.TZ;
	} else {
		process.env.TZ = ORIGINAL_TIME_ZONE;
	}
	cleanup();
	vi.clearAllMocks();
});

describe('destination chips', () => {
	test('one chip per connected account, all selected, with ONE shared editor', () => {
		renderComposer({ initialBody: 'hello' });

		for (const name of ['Acme main', 'Strict handle']) {
			expect(
				screen.getByRole('checkbox', { name }).getAttribute('aria-checked'),
			).toBe('true');
		}
		expect(
			screen.getAllByRole('textbox', { name: 'Shared body' }),
		).toHaveLength(1);
		// No tab is open until a destination is customized.
		expect(screen.queryByTestId('tenant-posts-destination-panel')).toBeNull();
	});

	test('a deselected destination offers no Customize action', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'hello' });

		await user.click(screen.getByRole('checkbox', { name: 'Strict handle' }));

		expect(
			screen.queryByRole('button', { name: 'Customize for Strict handle' }),
		).toBeNull();
		expect(
			screen.getByRole('button', { name: 'Customize for Acme main' }),
		).toBeTruthy();
	});
});

describe('Customize toggle and chip labels', () => {
	test('Customize is an expanded/collapsed toggle that controls the tab, and a second click closes it', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared text' });
		const customize = () =>
			screen.getByRole('button', { name: 'Customize for Strict handle' });
		expect(customize().getAttribute('aria-expanded')).toBe('false');
		expect(customize().getAttribute('aria-controls')).toBeNull();

		await user.click(customize());

		expect(customize().getAttribute('aria-expanded')).toBe('true');
		expect(customize().getAttribute('aria-controls')).toBe(panel().id);

		await user.click(customize());

		expect(screen.queryByTestId('tenant-posts-destination-panel')).toBeNull();
		expect(customize().getAttribute('aria-expanded')).toBe('false');
	});

	test('a target with no label shows its provider on the chip, matching its Customize name', () => {
		stubTargets([
			{ id: TARGET_A, label: null, provider: 'bluesky', limits: limitsOf(300) },
		]);
		renderComposer({ initialBody: 'hello' });

		expect(screen.getByRole('checkbox', { name: 'bluesky' })).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Customize for bluesky' }),
		).toBeTruthy();
	});

	test('a target the server sent no limits for still opens a tab and publishes: it is simply not counted', async () => {
		const user = userEvent.setup();
		stubTargets([
			{ id: TARGET_A, label: 'No limits', provider: 'bluesky', limits: null },
		]);
		renderComposer({ initialBody: 'hello' });

		await openTab(user, 'No limits');
		await customizeText(user);
		fireEvent.change(
			within(panel()).getByTestId('tenant-posts-destination-text'),
			{
				target: { value: 'x'.repeat(5000) },
			},
		);

		expect(
			within(panel()).queryByTestId('tenant-posts-limit-counter'),
		).toBeNull();
		expect(publishNowButton().disabled).toBe(false);
	});
});

describe('customizing a destination', () => {
	test('Customize opens that destination tab with the inherited content and an override toggle per field', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared text', followUps: ['second'] });

		await openTab(user, 'Strict handle');

		expect(
			within(panel()).getByRole('heading', {
				name: 'Customize for Strict handle',
			}),
		).toBeTruthy();
		// One toggle per segment, inherited text shown read-only while off.
		expect(
			within(panel()).getAllByTestId('tenant-posts-destination-text-toggle'),
		).toHaveLength(2);
		const inherited = within(panel()).getAllByTestId(
			'tenant-posts-destination-inherited',
		);
		expect(inherited).toHaveLength(2);
		expect(panel().textContent).toContain('shared text');
		expect(panel().textContent).toContain('second');
		expect(
			within(panel()).queryByTestId('tenant-posts-destination-text'),
		).toBeNull();
	});

	test('a dot marks a customized destination on its chip, and only that one', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared text' });

		expect(
			screen.queryByTestId(`tenant-posts-destination-dot-${TARGET_B}`),
		).toBeNull();

		await openTab(user, 'Strict handle');
		await customizeText(user);

		expect(
			screen.getByTestId(`tenant-posts-destination-dot-${TARGET_B}`),
		).toBeTruthy();
		expect(
			screen.queryByTestId(`tenant-posts-destination-dot-${TARGET_A}`),
		).toBeNull();
	});

	test('counters are independent: the tab counts against its own destination, the shared one against those that inherit', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'a'.repeat(120) });

		// Shared: the strict destination inherits the text and is over its limit.
		expect(blockCounter().getAttribute('data-state')).toBe('error');
		expect(blockCounter().textContent).toContain('120 / 100');
		expect(blockCounter().textContent).toContain('Strict handle');
		expect(publishNowButton().disabled).toBe(true);

		await openTab(user, 'Strict handle');
		await customizeText(user);
		await replaceText(user, 'short for B');

		// The tab counts its own text against its own limit...
		const tabCounter = within(panel()).getByTestId(
			'tenant-posts-limit-counter',
		);
		expect(tabCounter.textContent).toContain('11 / 100');
		expect(tabCounter.textContent).toContain('Strict handle');
		expect(tabCounter.getAttribute('data-state')).toBe('ok');
		// ...and the shared counter now only measures the destination that still
		// inherits the shared text.
		expect(blockCounter().getAttribute('data-state')).toBe('ok');
		expect(blockCounter().textContent).toContain('120 / 300');
		expect(blockCounter().textContent).toContain('Acme main');
		expect(publishNowButton().disabled).toBe(false);
	});

	test('a customized text is validated against its own destination, naming it', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'short' });

		await openTab(user, 'Strict handle');
		await customizeText(user);
		await replaceText(user, 'b'.repeat(101));

		expect(
			within(panel())
				.getByTestId('tenant-posts-limit-counter')
				.getAttribute('data-state'),
		).toBe('error');
		const alert = screen.getByTestId('tenant-posts-override-problem');
		expect(alert.textContent).toContain('Strict handle');
		expect(alert.textContent).toContain('segment 1');
		expect(publishNowButton().disabled).toBe(true);

		// The destination that did not customize is unaffected by that text.
		await replaceText(user, 'fits');
		expect(screen.queryByTestId('tenant-posts-override-problem')).toBeNull();
		expect(publishNowButton().disabled).toBe(false);
	});

	test('a customized text that is empty blocks publishing and says to write it or turn it off', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared' });

		await openTab(user, 'Strict handle');
		await customizeText(user);
		await user.clear(
			within(panel()).getByTestId('tenant-posts-destination-text'),
		);

		expect(
			screen.getByTestId('tenant-posts-override-problem').textContent,
		).toContain('is empty');
		expect(publishNowButton().disabled).toBe(true);
	});

	test('Reset to shared restores inheritance: dot gone, override gone, shared counter back', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'a'.repeat(120) });
		await openTab(user, 'Strict handle');
		await customizeText(user);
		await replaceText(user, 'short for B');
		expect(blockCounter().getAttribute('data-state')).toBe('ok');

		await user.click(screen.getByTestId('tenant-posts-destination-reset'));

		expect(
			screen.queryByTestId(`tenant-posts-destination-dot-${TARGET_B}`),
		).toBeNull();
		expect(
			within(panel()).queryByTestId('tenant-posts-destination-text'),
		).toBeNull();
		expect(
			within(panel()).getAllByTestId('tenant-posts-destination-inherited'),
		).toHaveLength(1);
		// The strict destination inherits again, so it governs the shared counter.
		expect(blockCounter().getAttribute('data-state')).toBe('error');
		expect(blockCounter().textContent).toContain('Strict handle');
		expect(
			(
				screen.getByTestId(
					'tenant-posts-destination-reset',
				) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	test('Done closes the tab without losing the customization', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared text' });
		await openTab(user, 'Strict handle');
		await customizeText(user);

		await user.click(screen.getByTestId('tenant-posts-destination-done'));

		expect(screen.queryByTestId('tenant-posts-destination-panel')).toBeNull();
		expect(
			screen.getByTestId(`tenant-posts-destination-dot-${TARGET_B}`),
		).toBeTruthy();
	});

	test('deselecting the open destination closes its tab', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared text' });
		await openTab(user, 'Strict handle');

		await user.click(screen.getByRole('checkbox', { name: 'Strict handle' }));

		expect(screen.queryByTestId('tenant-posts-destination-panel')).toBeNull();
	});
});

describe('unsaved edits to the shared post (edit page)', () => {
	test('a customized destination cannot be published or scheduled until the post is saved', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared text', isPostDirty: true });
		expect(publishNowButton().disabled).toBe(false);

		await openTab(user, 'Strict handle');
		await customizeText(user);

		expect(publishNowButton().disabled).toBe(true);
		expect(
			(screen.getByTestId('tenant-posts-schedule-submit') as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			screen.getByTestId('tenant-posts-publish-save-post-first').textContent,
		).toContain('Save your changes to the post first');
	});

	test('once the post is saved the same customization goes out', async () => {
		const user = userEvent.setup();
		const view = renderComposer({ initialBody: 'shared text' });
		await openTab(user, 'Strict handle');
		await customizeText(user);

		expect(publishNowButton().disabled).toBe(false);
		expect(
			view.container.querySelector(
				'[data-testid="tenant-posts-publish-save-post-first"]',
			),
		).toBeNull();
	});
});

describe('submitting', () => {
	test('refreshes the post list after publishing, since the post status follows its publications', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'plain' });

		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.invalidatePosts).toHaveBeenCalledWith(
				expect.anything(),
				TENANT_ID,
			);
		});
	});

	test('a post that could not be prepared sends nothing and shows no made-up error', async () => {
		const user = userEvent.setup();
		const onBeforePublish = vi.fn().mockResolvedValue(null);
		renderComposer({ initialBody: 'plain', onBeforePublish });

		await user.click(publishNowButton());

		await waitFor(() => {
			expect(onBeforePublish).toHaveBeenCalledTimes(1);
		});
		expect(mocks.publishNow).not.toHaveBeenCalled();
		expect(within(block()).queryByRole('alert')).toBeNull();
		expect(publishNowButton().disabled).toBe(false);
	});

	test('publish-now sends overrides ONLY for the customized destination', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'a'.repeat(120) });
		await openTab(user, 'Strict handle');
		await customizeText(user);
		await replaceText(user, 'short for B');

		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.publishNow).toHaveBeenCalledTimes(1);
		});
		expect(mocks.publishNow).toHaveBeenCalledWith({
			postId: POST_ID,
			tenantId: TENANT_ID,
			destinations: [
				{ socialAccountId: TARGET_A },
				{
					socialAccountId: TARGET_B,
					overrides: { segments: [{ position: 0, text: 'short for B' }] },
				},
			],
		});
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/tenant/posts/history',
				ignoreBlocker: true,
			});
		});
	});

	test('nothing customized sends plain destinations without any overrides key', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'plain' });

		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.publishNow).toHaveBeenCalledTimes(1);
		});
		expect(mocks.publishNow.mock.calls[0]?.[0]).toMatchObject({
			destinations: [
				{ socialAccountId: TARGET_A },
				{ socialAccountId: TARGET_B },
			],
		});
		for (const destination of mocks.publishNow.mock.calls[0]?.[0]
			.destinations as object[]) {
			expect(destination).not.toHaveProperty('overrides');
		}
	});

	test('a customized thread follow-up is sent by its position, the untouched segments are not', async () => {
		const user = userEvent.setup();
		renderComposer({
			initialBody: 'first',
			followUps: ['second', 'third'],
		});
		await openTab(user, 'Acme main');
		// Fields: 1/3, 2/3, 3/3. Customize the third.
		await customizeText(user, 2);
		await replaceText(user, 'third for A');

		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.publishNow).toHaveBeenCalledTimes(1);
		});
		expect(mocks.publishNow.mock.calls[0]?.[0].destinations).toEqual([
			{
				socialAccountId: TARGET_A,
				overrides: { segments: [{ position: 2, text: 'third for A' }] },
			},
			{ socialAccountId: TARGET_B },
		]);
	});

	test('a deselected destination is not sent, customized or not', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared text' });
		await openTab(user, 'Strict handle');
		await customizeText(user);
		// A customized chip also announces "Customized" in its name.
		await user.click(screen.getByRole('checkbox', { name: /^Strict handle/ }));

		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.publishNow).toHaveBeenCalledTimes(1);
		});
		expect(mocks.publishNow.mock.calls[0]?.[0].destinations).toEqual([
			{ socialAccountId: TARGET_A },
		]);
	});

	test('Schedule sends the same destinations with the chosen instant and the viewer zone, then lands on the queue', async () => {
		process.env.TZ = 'America/New_York';
		const user = userEvent.setup();
		renderComposer({ initialBody: 'a'.repeat(120) });
		await openTab(user, 'Strict handle');
		await customizeText(user);
		await replaceText(user, 'short for B');

		fireEvent.change(screen.getByTestId('tenant-posts-schedule-at'), {
			target: { value: '2099-01-02T10:30' },
		});
		await user.click(screen.getByTestId('tenant-posts-schedule-submit'));

		await waitFor(() => {
			expect(mocks.schedule).toHaveBeenCalledTimes(1);
		});
		const args = mocks.schedule.mock.calls[0]?.[0];
		expect(args).toMatchObject({
			postId: POST_ID,
			tenantId: TENANT_ID,
			// 10:30 on the wall clock of America/New_York (UTC-5 in January).
			scheduledAt: '2099-01-02T15:30:00.000Z',
			destinations: [
				{ socialAccountId: TARGET_A },
				{
					socialAccountId: TARGET_B,
					overrides: { segments: [{ position: 0, text: 'short for B' }] },
				},
			],
		});
		expect(args.timeZone).toBe('America/New_York');
		expect(mocks.publishNow).not.toHaveBeenCalled();
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/tenant/posts/queue',
				ignoreBlocker: true,
			});
		});
	});

	test('Schedule refuses a time in the past with an inline message and sends nothing', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'plain' });

		fireEvent.change(screen.getByTestId('tenant-posts-schedule-at'), {
			target: { value: '2000-01-02T10:30' },
		});
		await user.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect(screen.getByTestId('tenant-posts-schedule-past')).toBeTruthy();
		expect(mocks.schedule).not.toHaveBeenCalled();
	});

	test('a 409/422 from the server surfaces inline through getFailureMessage', async () => {
		const user = userEvent.setup();
		mocks.publishNow.mockRejectedValue(new Error('boom'));
		renderComposer({ initialBody: 'plain' });

		await user.click(publishNowButton());

		const alert = await within(block()).findByRole('alert');
		expect(alert.textContent?.length ?? 0).toBeGreaterThan(0);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('more than 20 destinations blocks publish-now but not scheduling', () => {
		stubTargets(
			Array.from({ length: 21 }, (_, index) => ({
				id: `acc-${index}`,
				label: `Account ${index}`,
				provider: 'bluesky',
				limits: limitsOf(300),
			})),
		);
		renderComposer({ initialBody: 'plain' });

		expect(
			screen.getByTestId('tenant-posts-publish-too-many').textContent,
		).toContain('20');
		expect(publishNowButton().disabled).toBe(true);
		fireEvent.change(screen.getByTestId('tenant-posts-schedule-at'), {
			target: { value: '2099-01-02T10:30' },
		});
		expect(
			(screen.getByTestId('tenant-posts-schedule-submit') as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});
});

describe('images per destination', () => {
	const IMAGES: ComposerImage[] = [
		{ key: 'img-1', url: 'https://files.example/1.png', altText: 'First' },
		{ key: 'img-2', url: 'https://files.example/2.png', altText: '' },
	];

	test('customizing images sends the chosen subset in order, with only the alt text that changed', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared', images: IMAGES });
		await openTab(user, 'Strict handle');

		expect(
			within(panel()).getByTestId('tenant-posts-destination-media-inherited')
				.textContent,
		).toContain('2 shared images');
		await user.click(
			within(panel()).getByTestId('tenant-posts-destination-media-toggle'),
		);
		// Leave image 1 out, give image 2 an alt text.
		await user.click(
			within(panel()).getByRole('checkbox', { name: 'Publish image 1 here' }),
		);
		await user.type(
			within(panel())
				.getAllByTestId('tenant-posts-destination-image-alt')
				.find(
					(input) => (input as HTMLInputElement).value === '',
				) as HTMLElement,
			'A cat',
		);

		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.publishNow).toHaveBeenCalledTimes(1);
		});
		expect(mocks.publishNow.mock.calls[0]?.[0].destinations).toEqual([
			{ socialAccountId: TARGET_A },
			{
				socialAccountId: TARGET_B,
				overrides: {
					media: {
						assetIds: ['img-2'],
						altTexts: [{ assetId: 'img-2', altText: 'A cat' }],
					},
				},
			},
		]);
	});

	test('an image removed from the post is not sent in the destination override', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared', images: IMAGES });
		await openTab(user, 'Acme main');
		await user.click(
			within(panel()).getByTestId('tenant-posts-destination-media-toggle'),
		);
		await user.click(
			within(panel()).getByRole('button', { name: 'Move image 2 earlier' }),
		);

		// img-1 is removed from the post while the tab is open.
		await user.click(screen.getByTestId('remove-image-img-1'));
		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.publishNow).toHaveBeenCalledTimes(1);
		});
		expect(mocks.publishNow.mock.calls[0]?.[0].destinations).toEqual([
			{
				socialAccountId: TARGET_A,
				overrides: { media: { assetIds: ['img-2'], altTexts: [] } },
			},
			{ socialAccountId: TARGET_B },
		]);
	});

	test('turning images on without changing anything still inherits: no dot, nothing sent', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared', images: IMAGES });
		await openTab(user, 'Acme main');
		await user.click(
			within(panel()).getByTestId('tenant-posts-destination-media-toggle'),
		);

		expect(
			screen.queryByTestId(`tenant-posts-destination-dot-${TARGET_A}`),
		).toBeNull();
		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.publishNow).toHaveBeenCalledTimes(1);
		});
		for (const destination of mocks.publishNow.mock.calls[0]?.[0]
			.destinations as object[]) {
			expect(destination).not.toHaveProperty('overrides');
		}
	});

	test('an alt text alone inherits the images (no explicit list), so images added later still flow', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared', images: IMAGES });
		await openTab(user, 'Acme main');
		await user.click(
			within(panel()).getByTestId('tenant-posts-destination-media-toggle'),
		);
		await user.type(
			within(panel()).getAllByTestId(
				'tenant-posts-destination-image-alt',
			)[1] as HTMLElement,
			'A cat',
		);

		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.publishNow).toHaveBeenCalledTimes(1);
		});
		const [acme] = mocks.publishNow.mock.calls[0]?.[0].destinations;
		expect(acme.overrides.media).toEqual({
			altTexts: [{ assetId: 'img-2', altText: 'A cat' }],
		});
	});

	test('element ids in the open tab are unique and derive from the destination', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared', images: IMAGES });
		await openTab(user, 'Acme main');
		await user.click(
			within(panel()).getByTestId('tenant-posts-destination-media-toggle'),
		);

		const ids = [...document.querySelectorAll('[id]')].map(
			(element) => element.id,
		);
		expect(new Set(ids).size).toBe(ids.length);
		expect(
			within(panel()).getByText('Customize images').getAttribute('for'),
		).toContain(TARGET_A);
	});

	test('reordering the destination images changes only its own order', async () => {
		const user = userEvent.setup();
		renderComposer({ initialBody: 'shared', images: IMAGES });
		await openTab(user, 'Acme main');
		await user.click(
			within(panel()).getByTestId('tenant-posts-destination-media-toggle'),
		);

		await user.click(
			within(panel()).getByRole('button', { name: 'Move image 2 earlier' }),
		);
		await user.click(publishNowButton());

		await waitFor(() => {
			expect(mocks.publishNow).toHaveBeenCalledTimes(1);
		});
		expect(mocks.publishNow.mock.calls[0]?.[0].destinations).toEqual([
			{
				socialAccountId: TARGET_A,
				overrides: { media: { assetIds: ['img-2', 'img-1'], altTexts: [] } },
			},
			{ socialAccountId: TARGET_B },
		]);
	});

	test('a photo network whose own image set is empty blocks publishing and names it', async () => {
		const user = userEvent.setup();
		stubTargets([
			{
				id: TARGET_A,
				label: 'Photos',
				provider: 'pixelfed',
				limits: limitsOf(500, { requiresMedia: true, supportsThreads: false }),
			},
		]);
		renderComposer({ initialBody: 'caption', images: IMAGES });
		expect(screen.queryByTestId('tenant-posts-publish-blocked')).toBeNull();

		await openTab(user, 'Photos');
		await user.click(
			within(panel()).getByTestId('tenant-posts-destination-media-toggle'),
		);
		await user.click(
			within(panel()).getByRole('checkbox', { name: 'Publish image 1 here' }),
		);
		await user.click(
			within(panel()).getByRole('checkbox', { name: 'Publish image 2 here' }),
		);

		expect(
			within(panel()).getByTestId('tenant-posts-destination-media-empty'),
		).toBeTruthy();
		expect(
			screen.getByTestId('tenant-posts-publish-blocked').textContent,
		).toContain('Photos needs at least one image');
		expect(publishNowButton().disabled).toBe(true);
	});
});
