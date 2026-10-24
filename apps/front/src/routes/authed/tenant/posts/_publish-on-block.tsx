import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { BODY_KEY, isCustomized } from '~/lib/publishing/destination-overrides';
import {
	POSTS_PUBLISH,
	SOCIAL_ACCOUNTS_PUBLISH,
	useTenantPermissions,
} from '~/lib/query/tenant-permissions';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { PublishLimitCounter } from './_publish-limit-counter';
import { PublishScheduleRow } from './_publish-schedule-row';
import {
	PUBLISH_NOW_MAX_DESTINATIONS,
	findPublishProblems,
	isPublishBlocked,
} from './_publish-validation';
import { NO_SEGMENTS } from './_segment-draft';
import type { SegmentDraft } from './_segment-draft';
import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';
import { usePublishSubmit } from './_use-publish-submit';
import type { PreparedPost } from './_use-publish-submit';

const NO_IMAGE_KEYS: string[] = [];

/** Publish actions of the composer (Epic D step 6, plan D2 Task 8, then #2172):
 * "Publish now" and "Schedule" for the destinations selected in the chips, with
 * every destination's customized fields. Shown only with BOTH
 * `tenant.posts.publish` AND `tenant.socialaccounts.publish` (the backend
 * publish surface requires both — PostEndpointsForTenant.cs:46-49).
 *
 * Validation is per destination: the shared text is counted against the
 * destinations that INHERIT it, each customized text against its own
 * destination. Unchecking every destination disables both actions; publishing
 * lands on History, scheduling on the Queue. */
export const PublishOnBlock = ({
	selection,
	destinationOverrides,
	postId,
	body = '',
	segments = NO_SEGMENTS,
	imageKeys = NO_IMAGE_KEYS,
	isPostDirty = false,
	onBeforePublish,
}: {
	/** Which targets are checked (owned by the composer so every counter and
	 * the image picker follow the same selection). */
	selection: PublishSelection;
	/** Which destinations customize what (owned by the composer). */
	destinationOverrides: DestinationOverridesState;
	/** The text being composed: counted live against the destinations that
	 * inherit it. */
	body?: string;
	/** Thread follow-ups: each one is held to the same limits (#2171). */
	segments?: SegmentDraft[];
	/** Images on the post (attached or picked): a photo network needs one. */
	imageKeys?: string[];
	/** Unsaved edits to the shared post (edit page). A customization names
	 * segments by position and the server applies it to the SAVED post, so
	 * while the post is dirty a customized publish or schedule is held back. */
	isPostDirty?: boolean;
	/** Present once the post exists (edit page). */
	postId?: string | null;
	/** In the creation drawer the block calls `onBeforePublish` first so the
	 * draft is saved and the caller hands back the created post before the
	 * request fires. */
	onBeforePublish?: () => Promise<PreparedPost | null>;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const tenantId = useResolvedWorkspaceTenantId();
	const { hasPermission } = useTenantPermissions(tenantId);
	const { selectedIds, destinations } = selection;
	const submit = usePublishSubmit({
		postId,
		onBeforePublish,
		selectedIds,
		overrides: destinationOverrides.overrides,
		segmentKeys: [BODY_KEY, ...segments.map((segment) => segment.id)],
		imageKeys,
	});
	const problems = findPublishProblems({
		destinations,
		overrides: destinationOverrides.overrides,
		body,
		segments,
		imageKeys,
	});
	const { overLimitFollowUp, overrideProblem, destinationBlock } = problems;
	const isPending = submit.pending !== null;
	const mustSaveFirst =
		isPostDirty &&
		selectedIds.some((id) => isCustomized(destinationOverrides.overrides[id]));
	const cannotSubmit =
		selectedIds.length === 0 ||
		isPending ||
		isPublishBlocked(problems) ||
		mustSaveFirst;
	const tooManyForNow = selectedIds.length > PUBLISH_NOW_MAX_DESTINATIONS;

	// D4 alignment (PR #1457): the front must promise only what the back will
	// honor: hide the block unless the member holds both publish verbs.
	if (
		!hasPermission(POSTS_PUBLISH) ||
		!hasPermission(SOCIAL_ACCOUNTS_PUBLISH)
	) {
		return null;
	}

	return (
		<section className="space-y-2" data-testid="tenant-posts-publish-on-block">
			<PublishLimitCounter tightest={problems.bodyLimit} />
			{overLimitFollowUp >= 0 ? (
				<p
					className="text-xs text-[var(--publy-danger)]"
					role="alert"
					data-testid="tenant-posts-segment-limit-error"
				>
					{t('posts:segment-over-limit', { index: overLimitFollowUp + 2 })}
				</p>
			) : null}
			{overrideProblem ? (
				<p
					className="text-xs text-[var(--publy-danger)]"
					role="alert"
					data-testid="tenant-posts-override-problem"
				>
					{t(
						overrideProblem.kind === 'blank'
							? 'posts:override-blank'
							: 'posts:override-over-limit',
						{
							destination: overrideProblem.destination,
							index: overrideProblem.segmentNumber,
						},
					)}
				</p>
			) : null}
			{destinationBlock ? (
				<p
					className="text-xs text-[var(--publy-danger)]"
					role="alert"
					data-testid="tenant-posts-publish-blocked"
				>
					{t(destinationBlock.key, {
						destination: destinationBlock.destination,
					})}
				</p>
			) : null}
			{mustSaveFirst ? (
				<p
					className="text-xs text-[var(--publy-danger)]"
					role="alert"
					data-testid="tenant-posts-publish-save-post-first"
				>
					{t('posts:rendition-save-post-first')}
				</p>
			) : null}
			{tooManyForNow ? (
				<p
					className="text-xs text-[var(--publy-danger)]"
					role="alert"
					data-testid="tenant-posts-publish-too-many"
				>
					{t('posts:publish-now-too-many-destinations', {
						max: PUBLISH_NOW_MAX_DESTINATIONS,
					})}
				</p>
			) : null}
			{submit.pending === 'publish' ? (
				<span
					data-testid="tenant-posts-publish-in-progress"
					className="inline-flex items-center gap-1 text-xs text-muted-foreground"
				>
					{t('posts:publish-status-in-progress')}
				</span>
			) : null}
			<Button
				type="button"
				variant="default"
				disabled={cannotSubmit || tooManyForNow}
				onClick={() => void submit.publishNow()}
				data-testid="tenant-posts-publish-now"
			>
				{t('common:publish-now')}
			</Button>
			<PublishScheduleRow
				disabled={cannotSubmit}
				onSchedule={(at) => void submit.schedule(at)}
			/>
			{submit.failureMessage ? (
				<p className="text-sm text-destructive" role="alert">
					{submit.failureMessage}
				</p>
			) : null}
		</section>
	);
};
