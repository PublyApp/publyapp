/**
 * @vitest-environment jsdom
 */
// #2172 part B2: customizing a destination that is already scheduled. The
// stored overrides load from GET rendition; an explicit Save sends PUT, "Reset
// to shared" sends DELETE (no autosave); a locked/invalid answer (409/422)
// stays inline through getFailureMessage(toApiFailure(error)).
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';
import { translateEnBundles } from '~/lib/testing/translate-en-bundles';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const POST_ID = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT_A = '01890a5d-ac96-774b-bcce-b302099a8057';
const ACCOUNT_B = '01890a5d-ac96-774b-bcce-b302099a8058';

const mocks = vi.hoisted(() => ({
	rows: [] as unknown[],
	canPublish: true,
	walk: {
		isAggregating: false,
		shouldLogout: false,
		error: null as Error | null,
		restart: vi.fn(),
	},
	rendition: vi.fn(),
	save: vi.fn(),
	reset: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({ getOrCreateClient: vi.fn() }),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: unknown }) => children,
}));

vi.mock('./_use-scheduled-publication-all-pages', () => ({
	useScheduledPublicationAllPages: () => ({ rows: mocks.rows, ...mocks.walk }),
}));

vi.mock('~/lib/query/tenant-permissions', () => ({
	POSTS_PUBLISH: 'tenant.posts.publish',
	useTenantPermissions: () => ({
		permissions: [],
		hasPermission: () => mocks.canPublish,
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect" />,
}));

vi.mock('~/lib/query/tenant-publication-renditions', async (importActual) => ({
	...(await importActual<
		typeof import('~/lib/query/tenant-publication-renditions')
	>()),
	useTenantPublicationRenditionQuery: () => mocks.rendition(),
	useSavePublicationRenditionMutation: () => ({
		mutateAsync: mocks.save,
		isPending: false,
	}),
	useResetPublicationRenditionMutation: () => ({
		mutateAsync: mocks.reset,
		isPending: false,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: translateEnBundles,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

import type { ComposerImage } from './_destination-media-field';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { ScheduledRenditionsBlock } from './_scheduled-renditions-block';
import { newSegmentDraft } from './_segment-draft';
import type { SegmentDraft } from './_segment-draft';
import type { PublishSelection } from './_use-publish-selection';

const LIMITS = {
	textLimits: [{ unit: 'graphemes', max: 100 }],
	maxImages: 4,
	maxImageBytes: 1_000_000,
	acceptedImageContentTypes: ['image/png'],
};

const SELECTION = {
	targets: [
		{ id: ACCOUNT_A, label: 'Acme main', provider: 'bluesky', limits: LIMITS },
		{
			id: ACCOUNT_B,
			label: 'Second handle',
			provider: 'bluesky',
			limits: LIMITS,
		},
	],
	selectedIds: [],
	toggle: () => undefined,
	destinations: [],
	imageLimits: null,
} satisfies PublishSelection;

const rowOf = (
	publicationId: string,
	overrides: Partial<ScheduledPublicationRow> = {},
): ScheduledPublicationRow => ({
	id: publicationId,
	publicationId,
	postId: POST_ID,
	postBodyPreview: 'preview',
	socialAccountId: ACCOUNT_A,
	accountDisplayHandle: '@acme.example',
	status: 'scheduled',
	postStatus: 'scheduled',
	publishedCount: 0,
	destinationCount: 2,
	superseded: false,
	customized: false,
	scheduledAtUtc: new Date('2026-11-02T09:30:00.000Z'),
	scheduledAtLocal: '2026-11-02T10:30:00+01:00',
	timeZone: 'Europe/Paris',
	lastError: null,
	...overrides,
});

const loaded = (rendition: {
	customized: boolean;
	segments: { position: number; text: string }[];
	media: unknown;
}) =>
	mocks.rendition.mockReturnValue({
		data: { publicationId: 'pub-a', ...rendition },
		isPending: false,
		isLoading: false,
		isError: false,
		error: null,
		refetch: vi.fn(),
		isFetching: false,
	});

const SEGMENTS = [newSegmentDraft('A follow-up')];

const IMAGES: ComposerImage[] = [
	{ key: 'img-1', url: null, altText: '' },
	{ key: 'img-2', url: null, altText: '' },
];

type BlockProps = {
	isPostDirty?: boolean;
	segments?: SegmentDraft[];
	images?: ComposerImage[];
};

const blockOf = ({
	isPostDirty = false,
	segments = SEGMENTS,
	images = [],
}: BlockProps) => (
	<ScheduledRenditionsBlock
		postId={POST_ID}
		tenantId={TENANT_ID}
		selection={SELECTION}
		body="The shared body"
		segments={segments}
		images={images}
		isPostDirty={isPostDirty}
	/>
);

const renderBlock = (props: BlockProps = {}) => render(blockOf(props));

const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByTestId('tenant-posts-scheduled-customize'));
	return screen.getByTestId('tenant-posts-destination-panel');
};

beforeEach(() => {
	mocks.canPublish = true;
	mocks.walk.isAggregating = false;
	mocks.walk.shouldLogout = false;
	mocks.walk.error = null;
	mocks.rows = [rowOf('pub-a')];
	mocks.save.mockResolvedValue(undefined);
	mocks.reset.mockResolvedValue(undefined);
	loaded({ customized: false, segments: [], media: null });
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('ScheduledRenditionsBlock gating and load states', () => {
	test('is hidden without tenant.posts.publish (the PUT/DELETE require it)', () => {
		mocks.canPublish = false;
		const { container } = renderBlock();

		expect(container.innerHTML).toBe('');
	});

	test('a failed load shows its failure with a retry instead of hiding the block', async () => {
		const user = userEvent.setup();
		mocks.rows = [];
		mocks.walk.error = new Error('request failed');
		renderBlock();

		expect(
			screen.getByTestId('tenant-posts-scheduled-destinations-error'),
		).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Retry' }));
		expect(mocks.walk.restart).toHaveBeenCalledTimes(1);
	});

	test('an expired session logs out instead of rendering', () => {
		mocks.walk.shouldLogout = true;
		renderBlock();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('shows a skeleton while the first rows are still loading', () => {
		mocks.rows = [];
		mocks.walk.isAggregating = true;
		renderBlock();

		expect(
			screen.getByTestId('tenant-posts-scheduled-destinations-loading'),
		).toBeTruthy();
	});
});

describe('ScheduledRenditionsBlock stored overrides survive a round trip', () => {
	test('a media override that inherits the post images is saved back without an explicit image list', async () => {
		const user = userEvent.setup();
		loaded({
			customized: true,
			segments: [],
			media: {
				assetIds: null,
				altTexts: [{ assetId: 'img-1', altText: 'Described' }],
			},
		});
		renderBlock({ images: IMAGES });
		await openEditor(user);

		await user.click(screen.getByTestId('tenant-posts-rendition-save'));

		await waitFor(() => {
			expect(mocks.save).toHaveBeenCalledTimes(1);
		});
		const { overrides } = mocks.save.mock.calls[0]?.[0];
		// Later images keep flowing, and a text-only save never rewrites the media.
		expect(overrides).toEqual({
			media: { altTexts: [{ assetId: 'img-1', altText: 'Described' }] },
		});
		expect(overrides.media).not.toHaveProperty('assetIds');
	});

	test('a refetch that re-keys the shared segments keeps the stored follow-up override, and it is still sent', async () => {
		const user = userEvent.setup();
		loaded({
			customized: true,
			segments: [{ position: 1, text: 'Follow-up written for A' }],
			media: null,
		});
		const view = renderBlock();
		await openEditor(user);

		// The shared segments come back with new ids (e.g. after a refetch).
		view.rerender(blockOf({ segments: [newSegmentDraft('A follow-up')] }));
		await user.click(screen.getByTestId('tenant-posts-rendition-save'));

		await waitFor(() => {
			expect(mocks.save).toHaveBeenCalledTimes(1);
		});
		expect(mocks.save.mock.calls[0]?.[0].overrides).toEqual({
			segments: [{ position: 1, text: 'Follow-up written for A' }],
		});
	});
});

describe('ScheduledRenditionsBlock', () => {
	test('renders nothing when the post has no scheduled destination', () => {
		mocks.rows = [];
		const { container } = renderBlock();

		expect(container.innerHTML).toBe('');
	});

	test("lists only this post's live destinations, with the Customized badge on a customized one", () => {
		mocks.rows = [
			rowOf('pub-a', { customized: true }),
			rowOf('pub-b', { accountDisplayHandle: '@second.example' }),
			rowOf('pub-replaced', { superseded: true }),
			rowOf('pub-other-post', { postId: 'another-post' }),
		];
		renderBlock();

		const items = screen.getAllByTestId('tenant-posts-scheduled-destination');
		expect(items).toHaveLength(2);
		expect(items[0]?.textContent).toContain('@acme.example');
		expect(
			within(items[0] as HTMLElement).getByTestId(
				'tenant-posts-customized-badge',
			).textContent,
		).toBe('Customized');
		expect(
			within(items[1] as HTMLElement).queryByTestId(
				'tenant-posts-customized-badge',
			),
		).toBeNull();
	});

	test('Customize opens the tab with the stored overrides, turned on', async () => {
		const user = userEvent.setup();
		loaded({
			customized: true,
			segments: [{ position: 1, text: 'Follow-up written for A' }],
			media: null,
		});
		renderBlock();

		const panel = await openEditor(user);

		const fields = within(panel).getAllByTestId(
			'tenant-posts-destination-text-field',
		);
		// The body inherits; the follow-up carries the stored override.
		expect(fields[0]?.getAttribute('data-customized')).toBeNull();
		expect(fields[1]?.getAttribute('data-customized')).toBe('true');
		expect(
			(
				within(panel).getByTestId(
					'tenant-posts-destination-text',
				) as HTMLTextAreaElement
			).value,
		).toBe('Follow-up written for A');
	});

	test('Save is an explicit PUT of the customized fields only, by position', async () => {
		const user = userEvent.setup();
		renderBlock();
		const panel = await openEditor(user);

		await user.click(
			within(panel).getAllByTestId(
				'tenant-posts-destination-text-toggle',
			)[0] as HTMLElement,
		);
		const field = within(panel).getByTestId('tenant-posts-destination-text');
		await user.clear(field);
		await user.type(field, 'Body for A');
		// Typing alone saves nothing: there is no autosave.
		expect(mocks.save).not.toHaveBeenCalled();

		await user.click(screen.getByTestId('tenant-posts-rendition-save'));

		await waitFor(() => {
			expect(mocks.save).toHaveBeenCalledTimes(1);
		});
		expect(mocks.save).toHaveBeenCalledWith({
			tenantId: TENANT_ID,
			publicationId: 'pub-a',
			overrides: { segments: [{ position: 0, text: 'Body for A' }] },
		});
		expect(
			(await screen.findByTestId('tenant-posts-rendition-saved')).textContent,
		).toBe('Customization saved.');
	});

	test('Reset to shared is a DELETE and puts every field back to inheriting', async () => {
		const user = userEvent.setup();
		loaded({
			customized: true,
			segments: [{ position: 0, text: 'Stored for A' }],
			media: null,
		});
		renderBlock();
		const panel = await openEditor(user);
		expect(
			within(panel).getByTestId('tenant-posts-destination-text'),
		).toBeTruthy();

		await user.click(screen.getByTestId('tenant-posts-destination-reset'));

		await waitFor(() => {
			expect(mocks.reset).toHaveBeenCalledWith({
				tenantId: TENANT_ID,
				publicationId: 'pub-a',
			});
		});
		await waitFor(() => {
			expect(
				within(panel).queryByTestId('tenant-posts-destination-text'),
			).toBeNull();
		});
		expect(mocks.save).not.toHaveBeenCalled();
	});

	test("a 409 locked answer stays inline with the server's plain-words cause", async () => {
		const user = userEvent.setup();
		mocks.save.mockRejectedValue({
			responseStatusCode: 409,
			body: {
				status: 409,
				translationKey: 'publication-rendition-locked',
				detail:
					'This publication is already published; its content can no longer be customized',
			},
		});
		renderBlock();
		const panel = await openEditor(user);
		await user.click(
			within(panel).getAllByTestId(
				'tenant-posts-destination-text-toggle',
			)[0] as HTMLElement,
		);

		await user.click(screen.getByTestId('tenant-posts-rendition-save'));

		const failure = await screen.findByTestId('tenant-posts-rendition-failure');
		expect(failure.textContent).toBe(
			'This publication is already published; its content can no longer be customized',
		);
		expect(screen.queryByTestId('tenant-posts-rendition-saved')).toBeNull();
	});

	test('a 422 naming the destination stays inline too', async () => {
		const user = userEvent.setup();
		mocks.save.mockRejectedValue({
			responseStatusCode: 422,
			body: {
				status: 422,
				translationKey: 'publish-rendition-invalid',
				detail: 'Acme main: Segment 1: the text is longer than the limit.',
				errors: { overrides: ['Acme main: Segment 1: too long'] },
			},
		});
		renderBlock();
		const panel = await openEditor(user);
		await user.click(
			within(panel).getAllByTestId(
				'tenant-posts-destination-text-toggle',
			)[0] as HTMLElement,
		);

		await user.click(screen.getByTestId('tenant-posts-rendition-save'));

		expect(
			(await screen.findByTestId('tenant-posts-rendition-failure')).textContent,
		).toContain('Acme main');
	});

	test("a customized text over this destination's limit blocks Save and names the destination", async () => {
		const user = userEvent.setup();
		renderBlock();
		const panel = await openEditor(user);
		await user.click(
			within(panel).getAllByTestId(
				'tenant-posts-destination-text-toggle',
			)[0] as HTMLElement,
		);

		const field = within(panel).getByTestId('tenant-posts-destination-text');
		await user.clear(field);
		await user.type(field, 'x'.repeat(101));

		expect(
			screen.getByTestId('tenant-posts-override-problem').textContent,
		).toContain('@acme.example');
		expect(
			(screen.getByTestId('tenant-posts-rendition-save') as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	test('Save waits for unsaved changes to the shared post', async () => {
		const user = userEvent.setup();
		renderBlock({ isPostDirty: true });
		await openEditor(user);

		expect(
			screen.getByTestId('tenant-posts-rendition-save-post-first'),
		).toBeTruthy();
		expect(
			(screen.getByTestId('tenant-posts-rendition-save') as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	test('a rendition that cannot be loaded shows its failure in place of the form', async () => {
		const user = userEvent.setup();
		mocks.rendition.mockReturnValue({
			data: undefined,
			isPending: false,
			isLoading: false,
			isError: true,
			error: {
				responseStatusCode: 404,
				body: { status: 404, detail: 'Publication not found' },
			},
			refetch: vi.fn(),
			isFetching: false,
		});
		renderBlock();

		await user.click(screen.getByTestId('tenant-posts-scheduled-customize'));

		expect(
			screen.getByTestId('tenant-posts-rendition-error').textContent,
		).toContain('Publication not found');
		expect(screen.queryByTestId('tenant-posts-destination-panel')).toBeNull();
	});
});
