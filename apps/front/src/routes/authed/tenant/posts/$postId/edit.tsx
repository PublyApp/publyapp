import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { createFileRoute, Link, useCanGoBack } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form, FormActionBar, FormPageLayout } from '~/components/field';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import { useResponseMessageTranslator } from '~/lib/i18n/use-response-message-translator';
import { isCustomized } from '~/lib/publishing/destination-overrides';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import { tenantPermissionsQueryOptions } from '~/lib/query/tenant-permissions';
import {
	tenantPostDetailsQueryOptions,
	useTenantPostDetailsQuery,
	toTenantPostDetails,
	tenantPostCrumbQuery,
	selectTenantPostCrumbName,
} from '~/lib/query/tenant-posts';
import {
	tenantProjectsQueryOptions,
	useTenantProjectsQuery,
	toTenantProjectItems,
} from '~/lib/query/tenant-projects';
import { tenantPublishTargetsQueryOptions } from '~/lib/query/tenant-publish-targets';
import { postPublicationsQueryOptions } from '~/lib/query/tenant-scheduled-publications';
import {
	resolveWorkspaceTenantIdFromCache,
	tenantsForPickerQueryOptions,
	useResolvedWorkspaceTenantId,
} from '~/lib/query/tenants-for-picker';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { PostBodyCounter } from '../_post-body-counter';
import { PostDangerZone } from '../_post-danger-zone';
import { PostEditDestinations } from '../_post-edit-destinations';
import { PostEditDialogs } from '../_post-edit-dialogs';
import { PostEditSegments } from '../_post-edit-segments';
import { PostEditSideColumn } from '../_post-edit-side-column';
import { NO_SEGMENTS, reconcileSegmentDrafts } from '../_segment-draft';
import { segmentFormBindings } from '../_segment-form-bindings';
import { storedImageCounts } from '../_stored-segments';
import { useDestinationOverrides } from '../_use-destination-overrides';
import { useEditPostActions } from '../_use-edit-post-actions';
import { useEditSegmentImages } from '../_use-edit-segment-images';
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
			.array(
				z.object({
					id: z.string(),
					text: z.string().max(20000, { message: t('posts:segment-too-long') }),
					serverId: z.string().optional(),
				}),
			)
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
	// A refetch (an image added or removed) must not drop what the user typed:
	// dirty fields keep their value, and an edited thread keeps its drafts (and
	// their ids) as they are.
	const current = methods.getValues('segments');
	const isThreadEdited = methods.formState.dirtyFields.segments !== undefined;
	methods.reset(
		{
			body: d.body,
			projectId: d.projectId,
			segments: isThreadEdited
				? current
				: reconcileSegmentDrafts(
						current,
						d.segments.map((segment) => segment.body),
						d.segments.map((segment) => segment.id),
					),
		},
		{ keepDirtyValues: true, keepDirty: true },
	);
};

/** The page's queries, declared once. The loader cannot know the post's project
 * yet, so the publish targets are the unfiltered ones the page reads until the
 * details land. The rendition of a selected row is `preload-exempt`. */
const postEditQueries = ({
	tenantId,
	postId,
}: {
	tenantId: string;
	postId: string;
}) => {
	return {
		postDetails: {
			options: tenantPostDetailsQueryOptions,
			variables: { postId, tenantId },
		},
		projects: { options: tenantProjectsQueryOptions, variables: { tenantId } },
		publishTargets: {
			options: tenantPublishTargetsQueryOptions,
			variables: { tenantId, projectId: null },
		},
		postPublications: {
			options: postPublicationsQueryOptions,
			variables: { tenantId, postId },
		},
		permissions: {
			options: tenantPermissionsQueryOptions,
			variables: { tenantId },
		},
		picker: { options: tenantsForPickerQueryOptions, variables: {} },
	};
};

const TenantPostEditPage = () => {
	const { t } = useTranslation(['posts', 'common']);
	const translateResponseMessage = useResponseMessageTranslator();
	const { postId } = Route.useParams();
	const navigate = Route.useNavigate();
	// Only an in-app previous page is a safe `back`: a page opened directly
	// (bookmark, new tab, e-mail link) would otherwise leave the app (#2410).
	const canGoBack = useCanGoBack();
	const tenantId = useResolvedWorkspaceTenantId();
	const queries = postEditQueries({ tenantId: tenantId ?? '', postId });
	const detailsQuery = useTenantPostDetailsQuery(
		queries.postDetails.variables,
		{ enabled: Boolean(tenantId && postId) },
	);
	const projectsQuery = useTenantProjectsQuery(queries.projects.variables);
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
	const storedDetails = toTenantPostDetails(detailsQuery.data);
	const hasStoredSegments = (storedDetails?.segments.length ?? 0) > 0;
	const publishedSegmentCount = storedDetails?.publishedSegmentCount ?? 0;
	const unsavedImages = useEditSegmentImages({
		methods,
		postId,
		tenantId: tenantId ?? '',
		hasStoredSegments,
		segments,
	});
	const segmentForm = segmentFormBindings(methods, segments, unsavedImages);
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
			unsavedImages.isWorking ||
			unsavedImages.queued.length > 0 ||
			Object.values(destinationOverrides.overrides).some(isCustomized));

	const blocker = useUnsavedWorkGuard(hasUnsavedWork);

	const {
		onSubmit,
		confirmBin,
		pendingBinId,
		setPendingBinId,
		deleteMutation,
	} = useEditPostActions({
		methods,
		postId,
		tenantId,
		hasStoredSegments,
		canGoBack,
	});

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
								<h1 className="publy-type-page-title">
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
										readOnly={isBodyLocked || unsavedImages.isWorking}
										placeholder={t('posts:body-placeholder')}
										data-testid="tenant-post-edit-body"
									/>
									<PostBodyCounter length={body.length} />
									<PostEditSegments
										postId={postId}
										tenantId={tenantId ?? ''}
										stored={details.segments}
										imageLimits={selection.imageLimits}
										unsavedImages={unsavedImages}
										segments={segments}
										errors={segmentForm.errors}
										publishedSegmentCount={publishedSegmentCount}
										destinations={selection.destinations}
										overrides={destinationOverrides.overrides}
										onChange={segmentForm.onChange}
									/>
									<QueryDisplay query={projectsQuery} variant="inline">
										{({ data }) => (
											<Field.Select
												name="projectId"
												label={t('posts:project-label')}
												placeholder={t('posts:project-placeholder')}
												isDisabled={unsavedImages.isWorking}
												options={toTenantProjectItems(data).map((p) => ({
													value: p.id,
													label: p.name,
												}))}
											/>
										)}
									</QueryDisplay>
									{methods.formState.errors.root ? (
										<p className="text-sm text-destructive" role="alert">
											{methods.formState.errors.root.message}
										</p>
									) : null}
									<FormActionBar>
										<Button
											type="submit"
											variant="default"
											disabled={
												isSaving ||
												unsavedImages.isWorking ||
												unsavedImages.queued.length > 0
											}
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
									storedSegments={details.segments}
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
								isBusy={
									unsavedImages.isWorking || unsavedImages.queued.length > 0
								}
								segmentImageCounts={storedImageCounts(
									segments,
									details.segments,
								)}
								isPostDirty={methods.formState.isDirty}
							/>
						</div>
						<PostEditDialogs
							blocker={blocker}
							isBinOpen={pendingBinId !== null}
							isBinPending={deleteMutation.isPending}
							onConfirmBin={() => void confirmBin()}
							onBinOpenChange={(o) => {
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
				workspaceTenant: true,
				query: tenantPostCrumbQuery,
				select: selectTenantPostCrumbName,
			},
		],
		i18nNamespaces: ['posts'],
	},
	loader: ({ context, params }) => {
		const tenantId = resolveWorkspaceTenantIdFromCache(context.queryClient);
		if (tenantId === null) {
			return;
		}
		preloadRouteQueries(
			context.queryClient,
			postEditQueries({ tenantId, postId: params.postId }),
		);
	},
	// Another post's edit page is a fresh page: no form, queue or request of
	// the old one survives a param-only navigation.
	remountDeps: ({ params }) => params.postId,
	component: TenantPostEditPage,
});
