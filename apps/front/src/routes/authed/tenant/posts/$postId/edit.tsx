import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form, FormActionBar, FormPageLayout } from '~/components/field';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import { useResponseMessageTranslator } from '~/lib/i18n/use-response-message-translator';
import { isCustomized } from '~/lib/publishing/destination-overrides';
import {
	useTenantPostDetailsQuery,
	savePost,
	invalidateTenantPosts,
	toTenantPostDetails,
	tenantPostCrumbQuery,
	selectTenantPostCrumbName,
	useDeleteTenantPostMutation,
} from '~/lib/query/tenant-posts';
import {
	useTenantProjectsQuery,
	toTenantProjectItems,
} from '~/lib/query/tenant-projects';
import { invalidateTenantPublications } from '~/lib/query/tenant-publications';
import { invalidateTenantScheduledPublications } from '~/lib/query/tenant-scheduled-publications';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { PostBodyCounter } from '../_post-body-counter';
import { PostDangerZone } from '../_post-danger-zone';
import { PostEditDestinations } from '../_post-edit-destinations';
import { PostEditSideColumn } from '../_post-edit-side-column';
import { PostSegmentsEditor } from '../_post-segments-editor';
import { NO_SEGMENTS, reconcileSegmentDrafts } from '../_segment-draft';
import { useDestinationOverrides } from '../_use-destination-overrides';
import { usePublishSelection } from '../_use-publish-selection';
import { useUnsavedWorkGuard } from '../_use-unsaved-work-guard';

const getSchema = (t: (k: string) => string) =>
	z.object({
		body: z
			.string()
			.trim()
			.min(1, { message: t('posts:body-required') })
			.max(20000, { message: t('posts:body-too-long') }),
		projectId: z.string().nullable().optional(),
		// Thread follow-ups (segments 2..N); at most 24 after the first body.
		segments: z
			.array(z.object({ id: z.string(), text: z.string().max(20000) }))
			.max(24),
	});

type Values = z.infer<ReturnType<typeof getSchema>>;

/** Loads the saved post into the form. Each segment keeps its id (matched by
 * text, not position, so a local reorder cannot move a customization onto
 * another segment): a refetch (an image added or removed) must not re-key the
 * segments. */
const resetFormFromDetails = (
	methods: UseFormReturn<Values>,
	data: Parameters<typeof toTenantPostDetails>[0],
) => {
	const d = toTenantPostDetails(data);
	if (!d) {
		return;
	}
	methods.reset({
		body: d.body,
		projectId: d.projectId,
		segments: reconcileSegmentDrafts(
			methods.getValues('segments'),
			d.segments.map((segment) => segment.body),
		),
	});
};

const TenantPostEditPage = () => {
	const { t } = useTranslation(['posts', 'common']);
	const translateResponseMessage = useResponseMessageTranslator();
	const { postId } = Route.useParams();
	const navigate = Route.useNavigate();
	const qc = useQueryClient();
	const tenantId = useResolvedWorkspaceTenantId();
	const detailsQuery = useTenantPostDetailsQuery(
		{ postId, tenantId: tenantId ?? '' },
		{ enabled: Boolean(tenantId && postId) },
	);
	const projectsQuery = useTenantProjectsQuery({ tenantId: tenantId ?? '' });
	const projectItems = toTenantProjectItems(projectsQuery.data);
	// Language-keyed resolver: schema + resolver built once per language, not
	// once per render.
	const resolver = useLanguageKeyedZodResolver<Values>(getSchema, [
		'posts',
		'common',
	]);
	const methods = useForm<Values>({
		resolver,
		defaultValues: { body: '', projectId: null, segments: [] },
	});
	const body = useWatch({ control: methods.control, name: 'body' }) ?? '';
	const segments =
		useWatch({ control: methods.control, name: 'segments' }) ?? NO_SEGMENTS;
	const destinationOverrides = useDestinationOverrides(
		segments.map((segment) => segment.id),
	);
	// `formState.isSubmitting` covers the whole async handleSubmit callback.
	const isSaving = methods.formState.isSubmitting;
	const [pendingBinId, setPendingBinId] = useState<string | null>(null);
	const deleteMutation = useDeleteTenantPostMutation();
	const storedDetails = toTenantPostDetails(detailsQuery.data);
	const hasStoredSegments = (storedDetails?.segments.length ?? 0) > 0;
	const publishedSegmentCount = storedDetails?.publishedSegmentCount ?? 0;
	const selection = usePublishSelection(storedDetails?.projectId ?? null);
	// A published thread's published segments, first body included, are read-only.
	const isBodyLocked = hasStoredSegments && publishedSegmentCount > 0;

	useEffect(() => {
		resetFormFromDetails(methods, detailsQuery.data);
	}, [detailsQuery.data, methods]);

	// Unsaved edits to the post, or unsaved destination customizations: both
	// are lost on leaving the page.
	const hasUnsavedWork =
		!methods.formState.isSubmitting &&
		(methods.formState.isDirty ||
			Object.values(destinationOverrides.overrides).some(isCustomized));

	const blocker = useUnsavedWorkGuard(hasUnsavedWork);

	const onSubmit = methods.handleSubmit(async (values) => {
		try {
			await savePost({
				postId,
				body: values.body,
				projectId: values.projectId ?? null,
				// Plain posts keep sending exactly what they always did.
				segments:
					values.segments.length > 0 || hasStoredSegments
						? values.segments.map((segment) => segment.text)
						: undefined,
				tenantId: tenantId ?? '',
			});
			await invalidateTenantPosts(qc, tenantId ?? '');
			// Refresh every scheduled-publication window for the tenant so the
			// queue/calendar surfaces pick up the edited body preview
			// (#2053 coherence). History uses a separate tenant-publications cache
			// and is invalidated separately below.
			await invalidateTenantScheduledPublications(qc, tenantId ?? '');
			await invalidateTenantPublications(qc, tenantId ?? '');
			if (window.history.length > 1) {
				window.history.back();
			} else {
				void navigate({ to: '/tenant/posts/drafts', replace: true });
			}
		} catch (error) {
			const failure = toApiFailure(error);
			if (failure.kind === 'validation' && failure.fieldErrors) {
				for (const [k, msgs] of Object.entries(failure.fieldErrors)) {
					methods.setError(k as keyof Values, { message: msgs[0] });
				}
				return;
			}
			methods.setError('root', {
				message:
					getFailureMessage(failure, {
						fallback: t('common:an-error-occurred'),
						translate: translateResponseMessage,
					}) ?? undefined,
			});
		}
	});

	const confirmBin = async () => {
		if (!pendingBinId || !tenantId) {
			return;
		}
		try {
			await deleteMutation.mutateAsync({
				postId: pendingBinId,
				tenantId,
			});
			await invalidateTenantPosts(qc, tenantId);
			setPendingBinId(null);
			void navigate({ to: '/tenant/posts/drafts' });
		} catch {
			// global MutationCache will toast
		}
	};

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// QueryDisplay owns state rendering below.
	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	// Null payload is the not-found case: QueryDisplay routes empty data to
	// EmptySlot, so the not-found view must live there, not only in children.
	const renderNotFoundSlot = () => (
		<div className="space-y-4">
			<Link to="/tenant/posts/drafts" className="publy-back-link">
				<IconArrowLeft aria-hidden className="size-3" />
				{t('posts:back-to-drafts')}
			</Link>
			<div data-testid="tenant-post-edit-not-found">
				{t('common:not-found')}
			</div>
		</div>
	);

	return (
		<QueryDisplay
			query={detailsQuery}
			LoadingSlot={
				<div data-testid="tenant-post-edit-loading">
					<div className="h-6 w-32 animate-pulse bg-muted" />
				</div>
			}
			ErrorSlot={
				<AppErrorView
					icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
					title={t('common:error-loading-data')}
					description={getFailureMessage(toApiFailure(detailsQuery.error), {
						fallback: t('common:an-error-occurred'),
						translate: translateResponseMessage,
					})}
					actions={
						<Link
							to="/tenant/posts/drafts"
							className={buttonVariants({ variant: 'outline' })}
						>
							{t('posts:back-to-drafts')}
						</Link>
					}
					testId="tenant-post-edit-error"
				/>
			}
			EmptySlot={renderNotFoundSlot()}
		>
			{({ data }) => {
				const details = toTenantPostDetails(data);
				if (!details) {
					return renderNotFoundSlot();
				}

				return (
					<FormPageLayout data-testid="tenant-post-edit-page">
						<div className="space-y-2">
							<Link to="/tenant/posts/drafts" className="publy-back-link">
								<IconArrowLeft aria-hidden className="size-3" />
								{t('posts:back-to-drafts')}
							</Link>
							<div>
								<h1 className="text-xl font-semibold tracking-[-0.01em]">
									{t('posts:edit-post')}
								</h1>
							</div>
						</div>
						<div className="grid gap-6 lg:grid-cols-12">
							<div className="lg:col-span-8">
								<Form methods={methods} onSubmit={onSubmit}>
									<Field.Textarea
										name="body"
										label={t('posts:body-label')}
										rows={10}
										readOnly={isBodyLocked}
										placeholder={t('posts:body-placeholder')}
										data-testid="tenant-post-edit-body"
									/>
									<PostBodyCounter length={body.length} />
									<PostSegmentsEditor
										segments={segments}
										publishedSegmentCount={publishedSegmentCount}
										destinations={selection.destinations}
										overrides={destinationOverrides.overrides}
										onChange={(next) =>
											methods.setValue('segments', next, { shouldDirty: true })
										}
									/>
									<Field.Select
										name="projectId"
										label={t('posts:project-label')}
										placeholder={t('posts:project-placeholder')}
										options={projectItems.map((p) => ({
											value: p.id,
											label: p.name,
										}))}
									/>
									{methods.formState.errors.root ? (
										<p className="text-sm text-destructive" role="alert">
											{methods.formState.errors.root.message}
										</p>
									) : null}
									<FormActionBar>
										<Button
											type="submit"
											variant="default"
											disabled={isSaving}
											data-testid="tenant-post-edit-save"
										>
											{isSaving ? t('posts:saving') : t('posts:save')}
										</Button>
										<Button
											type="button"
											variant="outline"
											onClick={() =>
												void navigate({ to: '/tenant/posts/drafts' })
											}
										>
											{t('common:cancel')}
										</Button>
									</FormActionBar>
								</Form>
								<PostEditDestinations
									postId={postId}
									tenantId={tenantId ?? ''}
									selection={selection}
									destinationOverrides={destinationOverrides}
									body={body}
									segments={segments}
									images={details.images}
									isPostDirty={methods.formState.isDirty}
								/>
								<PostDangerZone
									onMoveToBin={() => setPendingBinId(details.id)}
								/>
							</div>
							<PostEditSideColumn
								postId={postId}
								tenantId={tenantId ?? ''}
								selection={selection}
								destinationOverrides={destinationOverrides}
								body={body}
								segments={segments}
								images={details.images}
								isPostDirty={methods.formState.isDirty}
							/>
						</div>
						{blocker.status === 'blocked' ? (
							<ConfirmDialog
								isOpen
								title={t('posts:unsaved-changes-title')}
								description={t('posts:unsaved-changes-description')}
								confirmLabel={t('common:leave')}
								cancelLabel={t('common:stay')}
								onConfirm={() => blocker.proceed?.()}
								onOpenChange={(o) => {
									if (!o) {
										blocker.reset?.();
									}
								}}
							/>
						) : null}
						<ConfirmDialog
							isOpen={pendingBinId !== null}
							title={t('posts:move-to-bin')}
							description={t('posts:move-to-bin-confirm')}
							confirmLabel={t('posts:move-to-bin')}
							isPending={deleteMutation.isPending}
							onConfirm={() => void confirmBin()}
							onOpenChange={(o) => {
								if (!o) {
									setPendingBinId(null);
								}
							}}
						/>
					</FormPageLayout>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/tenant/posts/$postId/edit',
)({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'posts', to: '/tenant/posts' },
			{ kind: 'label', labelKey: 'drafts', to: '/tenant/posts/drafts' },
			{
				kind: 'entity',
				query: tenantPostCrumbQuery,
				select: selectTenantPostCrumbName,
			},
		],
		i18nNamespaces: ['posts'],
	},
	component: TenantPostEditPage,
});
