import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field } from '~/components/field';
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerBody,
	DrawerFooter,
	DrawerForm,
} from '~/components/ui/drawer';
import { savePost, invalidateTenantPosts } from '~/lib/query/tenant-posts';
import {
	useTenantProjectsQuery,
	toTenantProjectItems,
} from '~/lib/query/tenant-projects';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';

import { ComposerDestinations } from './_composer-destinations';
import { CreatePostActions, HandoffPanel } from './_create-post-drawer-parts';
import { PostBodyCounter } from './_post-body-counter';
import type { DeferredImageSelection } from './_post-image-picker';
import { PostImagePicker } from './_post-image-picker';
import { PostSegmentsEditor } from './_post-segments-editor';
import { PublishOnBlock } from './_publish-on-block';
import { NO_SEGMENTS } from './_segment-draft';
import { useAttachDeferredImages } from './_use-attach-deferred-images';
import { useDestinationOverrides } from './_use-destination-overrides';
import { usePreparePublish } from './_use-prepare-publish';
import { usePublishSelection } from './_use-publish-selection';

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

type FormValues = z.infer<ReturnType<typeof getSchema>>;

export const CreatePostDrawer = ({
	open,
	onOpenChange,
	tenantId,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	tenantId: string;
}) => {
	const { t } = useTranslation(['posts', 'common']);
	const qc = useQueryClient();
	const projectsQuery = useTenantProjectsQuery({ tenantId });
	const projectItems = toTenantProjectItems(projectsQuery.data);
	const methods = useForm<FormValues>({
		resolver: zodResolver(getSchema(t)),
		defaultValues: { body: '', projectId: null, segments: [] },
	});
	// useWatch, not a render-time `methods.watch()` (which makes React Hook Form
	// incompatible with the React compiler).
	const body = useWatch({ control: methods.control, name: 'body' }) ?? '';
	const selection = usePublishSelection(
		useWatch({ control: methods.control, name: 'projectId' }) ?? null,
	);
	const segments =
		useWatch({ control: methods.control, name: 'segments' }) ?? NO_SEGMENTS;
	const destinationOverrides = useDestinationOverrides(
		segments.map((segment) => segment.id),
	);

	const deferredAttach = useAttachDeferredImages(tenantId);

	// Declared before the handlers below so their closures read the same state.
	// The parent OWNS the deferred selection (the picker reports through
	// `onSelect`), so the attachment survives the picker's re-renders and the
	// handoff state can hold it for a retry.
	const [deferredImages, setDeferredImages] = useState<
		DeferredImageSelection[]
	>([]);

	// The deferred handoff outcome: once the post EXISTS but its image is not
	// attached yet, the drawer must NOT close. Closing here would strand a
	// created post whose image silently never arrived — the user would come
	// back to a phantom "image attached" memory with nothing on the post.
	const [createdPostId, setCreatedPostId] = useState<string | null>(null);
	const [handoffCause, setHandoffCause] = useState('');

	/**
	 * Attaches the deferred images to the created post. Resolves the asset id
	 * of each image (by its local id) when the handoff completed; null leaves
	 * the handoff state holding the images (the attached ones marked) with the
	 * surfaced cause, so the drawer offers the retry/discard actions.
	 */
	const tryAttach = async (
		postId: string,
		images: DeferredImageSelection[],
	): Promise<ReadonlyMap<string, string> | null> => {
		const outcome = await deferredAttach.attachAll(postId, images);
		if (outcome.ok) {
			return outcome.assetIds;
		}

		setCreatedPostId(postId);
		// Every image stays in the list, the attached ones marked: a retry
		// uploads only the rest, and a reorder or an image override still sees
		// all of them.
		setDeferredImages(
			images.map((image) => ({
				...image,
				attachedAssetId:
					outcome.assetIds.get(image.id) ?? image.attachedAssetId,
			})),
		);
		setHandoffCause(outcome.cause);
		return null;
	};

	const publishPrep = usePreparePublish({
		methods,
		tenantId,
		deferredImages,
		setDeferredImages,
		tryAttach,
	});

	const completeAndClose = async () => {
		publishPrep.forget();
		setDeferredImages([]);
		setCreatedPostId(null);
		setHandoffCause('');
		destinationOverrides.resetAll();
		await invalidateTenantPosts(qc, tenantId);
		methods.reset();
		onOpenChange(false);
	};

	const onSubmit = methods.handleSubmit(async (values) => {
		try {
			if (!tenantId) {
				// Unreachable behind the workspace shell (an unresolved tenant
				// redirects to the picker), but a missing scope must surface as
				// the neutral fallback, never as a leaked internal error string.
				methods.setError('root', {
					message: t('common:an-error-occurred'),
				});
				return;
			}

			// A publish that failed earlier already created the post: save onto it.
			const created = await savePost({
				postId: publishPrep.createdPostId ?? undefined,
				body: values.body,
				projectId: values.projectId ?? null,
				segments: values.segments.map((segment) => segment.text),
				tenantId,
			});

			// The picker collects a deferred image selection while the post
			// does not exist yet; it is attached right after creation.
			const attached = await publishPrep.syncImages(created.id);
			if (attached === null) {
				// The post was created and stays consistent (it keeps the
				// images that did attach); the drawer stays open on the
				// handoff surface naming the cause with the retry/discard
				// actions.
				return;
			}

			await completeAndClose();
		} catch (error) {
			const failure = toApiFailure(error);
			if (failure.kind === 'validation' && failure.fieldErrors) {
				for (const [k, msgs] of Object.entries(failure.fieldErrors)) {
					methods.setError(k as keyof FormValues, {
						message: msgs[0],
					});
				}
				if (!failure.fieldErrors.body && !failure.fieldErrors.projectId) {
					methods.setError('root', {
						message:
							getFailureMessage(failure, {
								fallback: t('common:an-error-occurred'),
							}) ?? undefined,
					});
				}
				return;
			}
			methods.setError('root', {
				message:
					getFailureMessage(failure, {
						fallback: t('common:an-error-occurred'),
					}) ?? undefined,
			});
		}
	});

	const handleRetryAttach = async () => {
		if (!createdPostId || deferredImages.length === 0) {
			return;
		}
		setHandoffCause('');
		const attached = await tryAttach(createdPostId, deferredImages);
		if (attached !== null) {
			await completeAndClose();
		}
	};

	const handleDiscardImage = () => {
		// The created post is kept — it is consistent without the remaining
		// images; only the failed attachment attempt is dropped. The list refresh makes the
		// saved draft visible immediately.
		setHandoffCause('');
		setCreatedPostId(null);
		publishPrep.forget();
		destinationOverrides.resetAll();
		void invalidateTenantPosts(qc, tenantId);
		methods.reset();
		onOpenChange(false);
	};

	// Closing the drawer drops any unattached selection; the picker reopens
	// with `selection: null` so no preview can outlive the state.
	const handleOpenChange = (o: boolean) => {
		if (!o) {
			setDeferredImages([]);
			publishPrep.forget();
			destinationOverrides.resetAll();
		}
		onOpenChange(o);
	};

	const isHandoffPending = createdPostId !== null;

	return (
		<Drawer open={open} onOpenChange={handleOpenChange}>
			<DrawerContent width={736} data-testid="tenant-posts-create-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('posts:new-post')}</DrawerTitle>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody>
						<Field.Textarea
							name="body"
							label={t('posts:body-label')}
							placeholder={t('posts:body-placeholder')}
							rows={8}
							aria-describedby="post-body-counter"
							data-testid="tenant-posts-create-body"
						/>
						<PostBodyCounter length={body.length} id="post-body-counter" />
						<PostSegmentsEditor
							segments={segments}
							publishedSegmentCount={0}
							destinations={selection.destinations}
							overrides={destinationOverrides.overrides}
							onChange={(next) =>
								methods.setValue('segments', next, { shouldDirty: true })
							}
						/>
						{methods.formState.errors.root ? (
							<p className="text-sm text-destructive" role="alert">
								{methods.formState.errors.root.message}
							</p>
						) : null}
						<Field.Select
							name="projectId"
							label={t('posts:project-label')}
							placeholder={t('posts:project-placeholder')}
							options={projectItems.map((p) => ({
								value: p.id,
								label: p.name,
							}))}
						/>
						{projectItems.length === 0 ? (
							<p className="text-muted-foreground text-xs">
								{t('posts:no-projects-yet')}
							</p>
						) : null}
						{isHandoffPending ? (
							<HandoffPanel
								cause={handoffCause}
								busy={deferredAttach.isPending}
								onRetry={() => void handleRetryAttach()}
								onDiscard={handleDiscardImage}
							/>
						) : (
							<PostImagePicker
								onSelect={publishPrep.selectImages}
								selections={deferredImages}
								limits={selection.imageLimits}
							/>
						)}
						<ComposerDestinations
							selection={selection}
							destinationOverrides={destinationOverrides}
							body={body}
							segments={segments}
							images={deferredImages.map((image) => ({
								key: image.id,
								url: null,
								altText: image.altText,
							}))}
						/>
					</DrawerBody>
					<DrawerFooter>
						<div className="w-full space-y-3">
							<PublishOnBlock
								selection={selection}
								destinationOverrides={destinationOverrides}
								body={body}
								segments={segments}
								imageKeys={deferredImages.map((image) => image.id)}
								onBeforePublish={publishPrep.prepare}
							/>
							<CreatePostActions
								isSubmitting={methods.formState.isSubmitting}
								onCancel={() => onOpenChange(false)}
							/>
						</div>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
