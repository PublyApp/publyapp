import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useResponseMessageTranslator } from '~/lib/i18n/use-response-message-translator';
import {
	invalidateTenantPosts,
	savePost,
	useDeleteTenantPostMutation,
} from '~/lib/query/tenant-posts';
import { invalidateTenantPublications } from '~/lib/query/tenant-publications';
import { invalidateTenantScheduledPublications } from '~/lib/query/tenant-scheduled-publications';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';

import { segmentsPayload } from './_segment-draft';
import type { PostFormValues } from './_use-edit-segment-images';
import { useRaiseSessionEnd } from './_use-raise-session-end';

/** Field errors land on their fields; the form only renders the root error, so a
 * refusal with no field of its own (a blank follow-up is named by its segment
 * number) goes there too. */
const applySaveFailure = (
	methods: UseFormReturn<PostFormValues>,
	failure: ReturnType<typeof toApiFailure>,
	message: string | null | undefined,
) => {
	const fieldErrors =
		failure.kind === 'validation' ? failure.fieldErrors : undefined;
	for (const [k, msgs] of Object.entries(fieldErrors ?? {})) {
		methods.setError(k as keyof PostFormValues, { message: msgs[0] });
	}
	if (!fieldErrors || (!fieldErrors.body && !fieldErrors.projectId)) {
		methods.setError('root', { message: message ?? undefined });
	}
};

/** The edit page's actions: the explicit Save (and where it leads) and the
 * move to the bin with its confirmation. */
export const useEditPostActions = ({
	methods,
	postId,
	tenantId,
	hasStoredSegments,
	canGoBack,
}: {
	methods: UseFormReturn<PostFormValues>;
	postId: string;
	tenantId: string | null;
	hasStoredSegments: boolean;
	canGoBack: boolean;
}) => {
	const { t } = useTranslation(['common']);
	const translateResponseMessage = useResponseMessageTranslator();
	const router = useRouter();
	const qc = useQueryClient();
	const raiseSessionEnd = useRaiseSessionEnd();
	const [pendingBinId, setPendingBinId] = useState<string | null>(null);
	const deleteMutation = useDeleteTenantPostMutation();

	const onSubmit = methods.handleSubmit(async (values) => {
		try {
			await savePost({
				postId,
				body: values.body,
				projectId: values.projectId ?? null,
				...segmentsPayload(values.segments, hasStoredSegments),
				tenantId: tenantId ?? '',
			});
			await invalidateTenantPosts(qc, tenantId ?? '');
			// Refresh every scheduled-publication window for the tenant so the
			// queue/calendar surfaces pick up the edited body preview
			// (#2053 coherence). History uses a separate tenant-publications cache
			// and is invalidated separately below.
			await invalidateTenantScheduledPublications(qc, tenantId ?? '');
			await invalidateTenantPublications(qc, tenantId ?? '');
			if (canGoBack) {
				window.history.back();
			} else {
				void router.navigate({ to: '/tenant/posts/drafts', replace: true });
			}
		} catch (error) {
			// An ended session goes to the central logout, not to a message.
			if (raiseSessionEnd(error)) {
				return;
			}
			const failure = toApiFailure(error);
			applySaveFailure(
				methods,
				failure,
				getFailureMessage(failure, {
					fallback: t('common:an-error-occurred'),
					translate: translateResponseMessage,
				}),
			);
		}
	});

	const confirmBin = async () => {
		if (!pendingBinId || !tenantId) {
			return;
		}
		try {
			await deleteMutation.mutateAsync({ postId: pendingBinId, tenantId });
			await invalidateTenantPosts(qc, tenantId);
			setPendingBinId(null);
			void router.navigate({ to: '/tenant/posts/drafts' });
		} catch {
			// global MutationCache will toast
		}
	};

	return {
		onSubmit,
		confirmBin,
		pendingBinId,
		setPendingBinId,
		deleteMutation,
	};
};
