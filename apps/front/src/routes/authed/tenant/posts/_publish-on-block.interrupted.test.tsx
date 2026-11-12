/**
 * @vitest-environment jsdom
 */
// The resume contract (#2179) through the REAL PublishOnBlock and
// usePublishSubmit: when `onBeforePublish` stops the request (null), the block
// hands the caller a resume; calling it redoes the request (publish now or
// schedule) once the cause is fixed. No resume is offered when nothing stopped.
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TARGET = '01890a5d-ac96-774b-bcce-b302099a8057';
const POST_ID = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	publishNow: vi.fn(),
	schedule: vi.fn(),
	invalidatePublications: vi.fn(),
}));

vi.mock('~/lib/query/tenant-permissions', () => ({
	POSTS_PUBLISH: 'tenant.posts.publish',
	SOCIAL_ACCOUNTS_PUBLISH: 'tenant.socialaccounts.publish',
	useTenantPermissions: () => ({
		permissions: [],
		hasPermission: () => true,
	}),
}));
vi.mock('~/lib/query/tenant-publications', () => ({
	publishNowMutation: { mutationFn: mocks.publishNow },
	schedulePostMutation: { mutationFn: mocks.schedule },
	invalidateTenantPublications: mocks.invalidatePublications,
}));
vi.mock('~/lib/query/tenant-scheduled-publications', () => ({
	invalidateTenantScheduledPublications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('~/lib/query/tenant-posts', () => ({
	invalidateTenantPosts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => TENANT_ID,
}));
vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({}),
}));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => mocks.navigate,
}));
vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));
vi.mock('~/lib/i18n/use-response-message-translator', () => ({
	useResponseMessageTranslator: () => (message: string) => message,
}));
vi.mock('./_publish-schedule-row', () => ({
	PublishScheduleRow: ({
		onSchedule,
		disabled,
	}: {
		onSchedule: (at: Date) => void;
		disabled?: boolean;
	}) => (
		<button
			type="button"
			data-testid="stub-schedule"
			disabled={disabled}
			onClick={() => onSchedule(new Date('2030-01-01T10:00:00Z'))}
		/>
	),
}));
vi.mock('./_publish-limit-counter', () => ({
	PublishLimitCounter: () => null,
}));

import { createAttemptRegistry } from './_attempt';
import { PublishOnBlock } from './_publish-on-block';
// eslint-disable-next-line import/first
import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';
import type { PreparedPost } from './_use-publish-submit';

const selection: PublishSelection = {
	targets: [],
	selectedIds: [TARGET],
	toggle: () => undefined,
	destinations: [
		{
			id: TARGET,
			label: 'Acme',
			limits: {
				textLimits: [],
				maxImages: 4,
				maxImageBytes: 1_000_000,
				acceptedImageContentTypes: ['image/png'],
				requiresMedia: false,
				supportsThreads: true,
			},
		},
	],
	imageLimits: null,
};
const overrides: DestinationOverridesState = {
	overrides: {},
	activeId: null,
	open: () => undefined,
	close: () => undefined,
	update: () => undefined,
	reset: () => undefined,
	resetAll: () => undefined,
};

const renderBlock = (props: {
	onBeforePublish: () => Promise<PreparedPost | null>;
	onPublishInterrupted: (resume: () => void) => void;
}) =>
	render(
		<PublishOnBlock
			selection={selection}
			destinationOverrides={overrides}
			body="hello"
			{...props}
		/>,
	);

beforeEach(() => {
	mocks.invalidatePublications.mockResolvedValue(undefined);
	mocks.publishNow.mockResolvedValue(undefined);
	mocks.schedule.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('PublishOnBlock interruption (#2179)', () => {
	test('a stopped Publish now hands back a resume that publishes once the cause is fixed', async () => {
		let fixed = false;
		const onBeforePublish = vi.fn(async () =>
			fixed ? { postId: POST_ID } : null,
		);
		const onPublishInterrupted = vi.fn();
		renderBlock({ onBeforePublish, onPublishInterrupted });

		await userEvent.click(screen.getByTestId('tenant-posts-publish-now'));

		await waitFor(() => expect(onPublishInterrupted).toHaveBeenCalledTimes(1));
		expect(mocks.publishNow).not.toHaveBeenCalled();

		fixed = true;
		onPublishInterrupted.mock.calls[0]?.[0]();

		await waitFor(() => expect(mocks.publishNow).toHaveBeenCalledTimes(1));
		expect(mocks.publishNow.mock.calls[0]?.[0]).toMatchObject({
			postId: POST_ID,
		});
		expect(mocks.schedule).not.toHaveBeenCalled();
	});

	test('a stopped Schedule resumes as a schedule at the same instant', async () => {
		let fixed = false;
		const onBeforePublish = vi.fn(async () =>
			fixed ? { postId: POST_ID } : null,
		);
		const onPublishInterrupted = vi.fn();
		renderBlock({ onBeforePublish, onPublishInterrupted });

		fireEvent.click(screen.getByTestId('stub-schedule'));

		await waitFor(() => expect(onPublishInterrupted).toHaveBeenCalledTimes(1));
		fixed = true;
		onPublishInterrupted.mock.calls[0]?.[0]();

		await waitFor(() => expect(mocks.schedule).toHaveBeenCalledTimes(1));
		expect(mocks.schedule.mock.calls[0]?.[0]).toMatchObject({
			postId: POST_ID,
			scheduledAt: '2030-01-01T10:00:00.000Z',
		});
		expect(mocks.publishNow).not.toHaveBeenCalled();
	});

	test('no resume is offered when the request was not stopped', async () => {
		const onPublishInterrupted = vi.fn();
		renderBlock({
			onBeforePublish: async () => ({ postId: POST_ID }),
			onPublishInterrupted,
		});

		await userEvent.click(screen.getByTestId('tenant-posts-publish-now'));

		await waitFor(() => expect(mocks.publishNow).toHaveBeenCalledTimes(1));
		expect(onPublishInterrupted).not.toHaveBeenCalled();
	});

	test('Publish and Schedule wait while the caller is busy', async () => {
		render(
			<PublishOnBlock
				selection={selection}
				destinationOverrides={overrides}
				body="hello"
				onBeforePublish={async () => ({ postId: POST_ID })}
				disabled
			/>,
		);

		await userEvent.click(screen.getByTestId('tenant-posts-publish-now'));

		expect(
			(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(mocks.publishNow).not.toHaveBeenCalled();
	});

	test('Schedule waits too while the caller is busy', async () => {
		render(
			<PublishOnBlock
				selection={selection}
				destinationOverrides={overrides}
				body="hello"
				onBeforePublish={async () => ({ postId: POST_ID })}
				disabled
			/>,
		);

		fireEvent.click(screen.getByTestId('stub-schedule'));
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(mocks.schedule).not.toHaveBeenCalled();
	});

	test('a request is not sent once its attempt was superseded (#2179)', async () => {
		const registry = createAttemptRegistry();
		renderBlock({
			onBeforePublish: async () => {
				const attempt = registry.begin();
				registry.invalidate();
				return { postId: POST_ID, attempt };
			},
			onPublishInterrupted: vi.fn(),
		});

		await userEvent.click(screen.getByTestId('tenant-posts-publish-now'));

		await waitFor(() =>
			expect(
				(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
					.disabled,
			).toBe(false),
		);
		expect(mocks.publishNow).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('cancelling while the request is in flight neither navigates nor shows an error (#2179)', async () => {
		const registry = createAttemptRegistry();
		const attempt = registry.begin();
		mocks.publishNow.mockImplementationOnce(() => new Promise(() => undefined));
		renderBlock({
			onBeforePublish: async () => ({ postId: POST_ID, attempt }),
			onPublishInterrupted: vi.fn(),
		});

		await userEvent.click(screen.getByTestId('tenant-posts-publish-now'));
		await waitFor(() => expect(mocks.publishNow).toHaveBeenCalledTimes(1));
		registry.invalidate();

		await waitFor(() =>
			expect(
				(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
					.disabled,
			).toBe(false),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	test('cancelling while the request is in flight refreshes the lists, the post may have landed (#2179)', async () => {
		const registry = createAttemptRegistry();
		const attempt = registry.begin();
		mocks.publishNow.mockImplementationOnce(() => new Promise(() => undefined));
		renderBlock({
			onBeforePublish: async () => ({ postId: POST_ID, attempt }),
			onPublishInterrupted: vi.fn(),
		});
		await userEvent.click(screen.getByTestId('tenant-posts-publish-now'));
		await waitFor(() => expect(mocks.publishNow).toHaveBeenCalledTimes(1));

		registry.invalidate();

		await waitFor(() =>
			expect(mocks.invalidatePublications).toHaveBeenCalledTimes(1),
		);
	});

	test('leaving while the lists refresh after the request does not navigate (#2179)', async () => {
		const registry = createAttemptRegistry();
		const attempt = registry.begin();
		let finishRefresh: () => void = () => undefined;
		mocks.invalidatePublications.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishRefresh = resolve;
				}),
		);
		renderBlock({
			onBeforePublish: async () => ({ postId: POST_ID, attempt }),
			onPublishInterrupted: vi.fn(),
		});
		await userEvent.click(screen.getByTestId('tenant-posts-publish-now'));
		await waitFor(() =>
			expect(mocks.invalidatePublications).toHaveBeenCalledTimes(1),
		);

		registry.invalidate();
		finishRefresh();

		await waitFor(() =>
			expect(
				(screen.getByTestId('tenant-posts-publish-now') as HTMLButtonElement)
					.disabled,
			).toBe(false),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('a request that stalls ends in a visible message (#2179)', async () => {
		const registry = createAttemptRegistry(30);
		const attempt = registry.begin();
		mocks.publishNow.mockImplementationOnce(() => new Promise(() => undefined));
		renderBlock({
			onBeforePublish: async () => ({ postId: POST_ID, attempt }),
			onPublishInterrupted: vi.fn(),
		});

		await userEvent.click(screen.getByTestId('tenant-posts-publish-now'));

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain(
				'posts:attempt-timed-out',
			),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
