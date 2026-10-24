import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toWireDestinations } from '~/lib/publishing/destination-overrides';
import type {
	DestinationOverrides,
	WireDestination,
} from '~/lib/publishing/destination-overrides';
import {
	invalidateTenantPublications,
	publishNowMutation,
	schedulePostMutation,
} from '~/lib/query/tenant-publications';
import { invalidateTenantScheduledPublications } from '~/lib/query/tenant-scheduled-publications';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';
import { getBrowserTimeZone } from '~/utils/format-time';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';

/** A post that exists and is ready to be published. */
export type PreparedPost = {
	postId: string;
	/** Asset id by local image key, for images uploaded just before the
	 * publish (the creation drawer). A key it does not list is already an
	 * asset id. */
	assetIdByKey?: ReadonlyMap<string, string>;
};

type PendingKind = 'publish' | 'schedule';

type SubmitArgs = {
	/** Present once the post exists (edit page). */
	postId: string | null | undefined;
	/** In the creation drawer: saves the draft (and uploads its images) first
	 * and hands back the created post; null aborts the submit. */
	onBeforePublish: (() => Promise<PreparedPost | null>) | undefined;
	selectedIds: readonly string[];
	overrides: DestinationOverrides;
	segmentKeys: readonly string[];
};

/** Publish now / Schedule for the composer: both send `destinations[]` (one
 * item per selected account, `overrides` only on customized ones), refresh the
 * publication lists, then land on History (now) or the Queue (scheduled).
 * Failures stay inline through `getFailureMessage(toApiFailure(error))`. */
export const usePublishSubmit = ({
	postId,
	onBeforePublish,
	selectedIds,
	overrides,
	segmentKeys,
}: SubmitArgs) => {
	const { t } = useTranslation(['common']);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const tenantId = useResolvedWorkspaceTenantId();
	const [pending, setPending] = useState<PendingKind | null>(null);
	const [failureMessage, setFailureMessage] = useState<string | null>(null);

	const prepare = async (): Promise<PreparedPost> => {
		const prepared = onBeforePublish
			? await onBeforePublish()
			: { postId: postId ?? '' };
		if (prepared === null || prepared.postId === '') {
			throw new Error('missing post');
		}
		return prepared;
	};

	const handleSubmit = async (
		kind: PendingKind,
		send: (args: {
			tenantId: string;
			postId: string;
			destinations: WireDestination[];
		}) => Promise<void>,
	) => {
		if (!tenantId) {
			return;
		}

		setPending(kind);
		setFailureMessage(null);

		try {
			const prepared = await prepare();
			await send({
				tenantId,
				postId: prepared.postId,
				destinations: toWireDestinations({
					accountIds: selectedIds,
					overrides,
					segmentKeys,
					assetIdByKey: prepared.assetIdByKey,
				}),
			});
			await invalidateTenantPublications(queryClient, tenantId);
			await invalidateTenantScheduledPublications(queryClient, tenantId);
		} catch (error) {
			setPending(null);
			setFailureMessage(
				getFailureMessage(toApiFailure(error), {
					fallback: t('common:an-error-occurred'),
				}),
			);
			return;
		}

		setPending(null);
		void navigate({
			to: kind === 'publish' ? '/tenant/posts/history' : '/tenant/posts/queue',
		});
	};

	return {
		pending,
		failureMessage,
		publishNow: () =>
			handleSubmit('publish', async (args) => {
				await publishNowMutation.mutationFn(args);
			}),
		schedule: (at: Date) =>
			handleSubmit('schedule', async (args) => {
				await schedulePostMutation.mutationFn({
					...args,
					scheduledAt: at.toISOString(),
					timeZone: getBrowserTimeZone(),
				});
			}),
	};
};
