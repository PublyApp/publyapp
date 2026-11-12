import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponseMessageTranslator } from '~/lib/i18n/use-response-message-translator';
import { toWireDestinations } from '~/lib/publishing/destination-overrides';
import type {
	DestinationOverrides,
	WireDestination,
} from '~/lib/publishing/destination-overrides';
import { invalidateTenantPosts } from '~/lib/query/tenant-posts';
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

type SendArgs = {
	tenantId: string;
	postId: string;
	destinations: WireDestination[];
};
type Send = (args: SendArgs) => Promise<void>;

type SubmitArgs = {
	/** Present once the post exists (edit page). */
	postId: string | null | undefined;
	/** In the creation drawer: saves the draft (and uploads its images) first
	 * and hands back the created post; null aborts the submit. */
	onBeforePublish: (() => Promise<PreparedPost | null>) | undefined;
	selectedIds: readonly string[];
	overrides: DestinationOverrides;
	segmentKeys: readonly string[];
	/** The post's images (keys): an override naming a removed one is not sent. */
	imageKeys: readonly string[];
	/** Called when `onBeforePublish` stopped the submit (null, whatever the
	 * reason: the caller knows it): hands back a function that redoes the same
	 * KIND of request once what stopped it (images that did not attach) is
	 * fixed (#2179). It runs with the state of the render it is called in, so it
	 * sends to the destinations selected THEN, and a schedule keeps the instant
	 * that was picked at the original click (a time that has since passed is
	 * refused by the server like any past schedule). */
	onInterrupted?: (resume: () => void) => void;
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
	imageKeys,
	onInterrupted,
}: SubmitArgs) => {
	const { t } = useTranslation(['common']);
	const translateResponseMessage = useResponseMessageTranslator();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const tenantId = useResolvedWorkspaceTenantId();
	const [pending, setPending] = useState<PendingKind | null>(null);
	const [failureMessage, setFailureMessage] = useState<string | null>(null);

	/** The post to send, or null when there is none (the caller of
	 * `onBeforePublish` has already said why). */
	const prepare = async (): Promise<PreparedPost | null> => {
		if (onBeforePublish) {
			return onBeforePublish();
		}
		return postId ? { postId } : null;
	};

	const latestSubmit = useRef<
		((kind: PendingKind, send: Send) => Promise<void>) | null
	>(null);

	const handleSubmit = async (kind: PendingKind, send: Send) => {
		if (!tenantId) {
			return;
		}

		setPending(kind);
		setFailureMessage(null);

		try {
			const prepared = await prepare();
			if (prepared === null) {
				setPending(null);
				// Resumed through the ref so it runs with the state of the render
				// after the fix, not the one captured at this click.
				onInterrupted?.(() => void latestSubmit.current?.(kind, send));
				return;
			}
			await send({
				tenantId,
				postId: prepared.postId,
				destinations: toWireDestinations({
					accountIds: selectedIds,
					overrides,
					segmentKeys,
					imageKeys,
					assetIdByKey: prepared.assetIdByKey,
				}),
			});
			// The post's status follows its publications.
			await invalidateTenantPosts(queryClient, tenantId);
			await invalidateTenantPublications(queryClient, tenantId);
			await invalidateTenantScheduledPublications(queryClient, tenantId);
		} catch (error) {
			setPending(null);
			setFailureMessage(
				getFailureMessage(toApiFailure(error), {
					fallback: t('common:an-error-occurred'),
					translate: translateResponseMessage,
				}),
			);
			return;
		}

		setPending(null);
		// The request went out: unsaved customizations no longer matter, and the
		// leave guard must not offer "stay" (a second click would publish twice).
		void navigate({
			to: kind === 'publish' ? '/tenant/posts/history' : '/tenant/posts/queue',
			ignoreBlocker: true,
		});
	};

	useEffect(() => {
		latestSubmit.current = handleSubmit;
	});

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
