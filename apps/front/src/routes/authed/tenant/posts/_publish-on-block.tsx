import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
	POSTS_PUBLISH,
	SOCIAL_ACCOUNTS_PUBLISH,
	useTenantPermissions,
} from '~/lib/query/tenant-permissions';
import {
	publishNowMutation,
	invalidateTenantPublications,
} from '~/lib/query/tenant-publications';
import {
	useTenantPublishTargetsQuery,
	toTenantPublishTargets,
} from '~/lib/query/tenant-publish-targets';
import { invalidateTenantScheduledPublications } from '~/lib/query/tenant-scheduled-publications';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';

/** Composer "Publish on" block (Epic D step 6, plan D2 Task 8): the accounts
 * visible in the project per the Epic C rule, shown only with BOTH
 * `tenant.posts.publish` AND `tenant.socialaccounts.publish` (the backend
 * publish-now surface requires both — PostEndpointsForTenant.cs:46-49).
 * One checked box per visible target; unchecked-all disables Publish now;
 * publishing fires `publishNowMutation` with the checked ids then lands on
 * History. */
export const PublishOnBlock = ({
	projectId,
	postId,
	onBeforePublish,
}: {
	projectId: string | null;
	/** Present once the post exists (edit page). */
	postId?: string | null;
	/** In the creation drawer the
	 * block calls `onBeforePublish` first so the draft is saved and the caller
	 * hands back the created post id before publish-now fires. */
	onBeforePublish?: () => Promise<string | null>;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const tenantId = useResolvedWorkspaceTenantId();
	const { hasPermission } = useTenantPermissions(tenantId);
	const targetsQuery = useTenantPublishTargetsQuery({
		tenantId: tenantId ?? '',
		projectId,
	});
	const targets = toTenantPublishTargets(targetsQuery.data);
	const [checkedIds, setCheckedIds] = useState<string[] | null>(null);
	const [failureMessage, setFailureMessage] = useState<string | null>(null);

	// Default = every visible target checked; null until targets resolve.
	const selectedIds = checkedIds ?? targets.map((target) => target.id);
	const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

	const toggleTarget = (id: string, checked: boolean) => {
		setCheckedIds((previous) => {
			const base = previous ?? targets.map((target) => target.id);
			if (checked) {
				return [...base, id];
			}
			return base.filter((value) => value !== id);
		});
	};

	const [isPublishing, setIsPublishing] = useState(false);

	const handlePublishNow = async () => {
		if (!tenantId) {
			return;
		}

		setIsPublishing(true);
		setFailureMessage(null);

		try {
			let effectivePostId: string | null = postId ?? null;

			if (onBeforePublish) {
				effectivePostId = await onBeforePublish();
			}

			if (!effectivePostId) {
				setFailureMessage(
					getFailureMessage(toApiFailure(new Error('missing post')), {
						fallback: t('common:an-error-occurred'),
					}),
				);
				return;
			}

			await publishNowMutation.mutationFn({
				postId: effectivePostId,
				accountIds: selectedIds,
				tenantId,
			});
			await invalidateTenantPublications(queryClient, tenantId);
			await invalidateTenantScheduledPublications(queryClient, tenantId);
			void navigate({ to: '/tenant/posts/history' });
		} catch (error) {
			setFailureMessage(
				getFailureMessage(toApiFailure(error), {
					fallback: t('common:an-error-occurred'),
				}),
			);
		} finally {
			setIsPublishing(false);
		}
	};

	// D4 alignment (PR #1457): the publish-now backend surface requires BOTH
	// tenant.posts.publish AND tenant.socialaccounts.publish (AND logic —
	// PostEndpointsForTenant.cs:46-49). The front must promise only what the
	// back will honor: hide the block unless the member holds both verbs.
	if (
		!hasPermission(POSTS_PUBLISH) ||
		!hasPermission(SOCIAL_ACCOUNTS_PUBLISH)
	) {
		return null;
	}

	return (
		<section data-testid="tenant-posts-publish-on-block">
			<p className="text-[13px] font-medium text-foreground">
				{t('posts:publish-on-heading')}
			</p>
			{targets.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					{t('posts:publish-on-empty')}
				</p>
			) : (
				<div role="group" className="flex flex-wrap gap-2">
					{targets.map((target) => {
						const isChecked = selectedIdSet.has(target.id);

						return (
							<label
								key={target.id}
								className="publy-choice-chip"
								data-selected={isChecked ? 'true' : undefined}
							>
								<Checkbox
									className="sr-only"
									name="publishTargets"
									data-testid={`tenant-posts-publish-target-${target.id}`}
									checked={isChecked}
									onCheckedChange={(checked) => {
										toggleTarget(target.id, Boolean(checked));
									}}
								/>
								<span>{target.label}</span>
							</label>
						);
					})}
				</div>
			)}
			{isPublishing ? (
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
				disabled={selectedIds.length === 0 || isPublishing}
				onClick={() => void handlePublishNow()}
				data-testid="tenant-posts-publish-now"
			>
				{t('common:publish-now')}
			</Button>
			{failureMessage ? (
				<p className="text-sm text-destructive" role="alert">
					{failureMessage}
				</p>
			) : null}
		</section>
	);
};
