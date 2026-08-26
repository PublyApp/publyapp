import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerBody,
	DrawerFooter,
	DrawerForm,
} from '~/components/ui/drawer';
import {
	useAttachPostImageMutation,
	useInvalidatePostImageCaches,
	useUpdatePostImageAltMutation,
} from '~/lib/query/tenant-post-images';
import { savePost, invalidateTenantPosts } from '~/lib/query/tenant-posts';
import {
	useTenantProjectsQuery,
	toTenantProjectItems,
} from '~/lib/query/tenant-projects';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';

import type { DeferredImageSelection } from './_post-image-picker';
import { PostImagePicker } from './_post-image-picker';

const getSchema = (t: (k: string) => string) =>
	z.object({
		body: z
			.string()
			.trim()
			.min(1, { message: t('posts:body-required') })
			.max(20000, { message: t('posts:body-too-long') }),
		projectId: z.string().nullable().optional(),
	});

type FormValues = z.infer<ReturnType<typeof getSchema>>;

type HandoffPanelProps = {
	/** Plain-words cause from the failed attach attempt ('' while retrying). */
	cause: string;
	busy: boolean;
	onRetry: () => void;
	onDiscard: () => void;
};

/** Shown when the post was created but its image did not attach: names the
 * cause in plain words and offers the retry/discard way out. */
const HandoffPanel = ({
	cause,
	busy,
	onRetry,
	onDiscard,
}: HandoffPanelProps) => {
	const { t } = useTranslation(['posts']);
	return (
		<div
			className="space-y-2 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-(--publy-border-strong) bg-(--publy-surface-muted) px-4 py-3"
			data-testid="tenant-posts-create-image-handoff"
		>
			<p className="text-sm font-medium">{t('posts:image-handoff-title')}</p>
			{cause ? (
				<p
					className="publy-type-helper text-[var(--publy-danger)]"
					role="alert"
				>
					{cause}
				</p>
			) : null}
			<div className="flex gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={busy}
					onClick={onRetry}
					data-testid="tenant-posts-create-image-retry"
				>
					{busy ? t('posts:saving') : t('posts:image-retry')}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={onDiscard}
					data-testid="tenant-posts-create-image-discard"
				>
					{t('posts:image-discard')}
				</Button>
			</div>
		</div>
	);
};

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
		defaultValues: { body: '', projectId: null },
	});
	// useWatch subscribes to the field instead of calling `methods.watch()`
	// during render — the render-time `watch()` read makes React Hook Form an
	// incompatible library for this component and the compiler skips it.
	const body = useWatch({ control: methods.control, name: 'body' }) ?? '';

	const attachImage = useAttachPostImageMutation();
	const updateImageAlt = useUpdatePostImageAltMutation();
	const invalidatePostImageCaches = useInvalidatePostImageCaches();

	// Declared before the handlers below so their closures read the same state.
	// The parent OWNS the deferred selection (the picker reports through
	// `onSelect`), so the attachment survives the picker's re-renders and the
	// handoff state can hold it for a retry.
	const [deferredImage, setDeferredImage] =
		useState<DeferredImageSelection | null>(null);

	// The deferred handoff outcome: once the post EXISTS but its image is not
	// attached yet, the drawer must NOT close. Closing here would strand a
	// created post whose image silently never arrived — the user would come
	// back to a phantom "image attached" memory with nothing on the post.
	const [createdPostId, setCreatedPostId] = useState<string | null>(null);
	const [handoffCause, setHandoffCause] = useState('');

	const handleSelect = (selection: DeferredImageSelection | null) => {
		setDeferredImage(selection);
	};

	/**
	 * Attaches the deferred image (and its alt text) to the created post.
	 * Resolves true when the handoff completed; false leaves the handoff
	 * state populated with the surfaced cause so the drawer offers the
	 * retry/discard actions.
	 */
	const tryAttach = async (
		postId: string,
		image: DeferredImageSelection,
	): Promise<boolean> => {
		try {
			await attachImage.mutateAsync({
				postId,
				tenantId,
				file: image.file,
			});
			// Alt text lives on the attached asset and travels through the
			// post PATCH; the attach endpoint carries only the file itself.
			if (image.altText) {
				await updateImageAlt.mutateAsync({
					postId,
					tenantId,
					altText: image.altText,
				});
			}
			invalidatePostImageCaches();
			return true;
		} catch (error) {
			const failure = toApiFailure(error);
			setCreatedPostId(postId);
			setDeferredImage(image);
			setHandoffCause(
				getFailureMessage(failure, {
					fallback: t('common:an-error-occurred'),
				}) ?? '',
			);
			return false;
		}
	};

	const completeAndClose = async () => {
		setDeferredImage(null);
		setCreatedPostId(null);
		setHandoffCause('');
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

			const created = await savePost({
				body: values.body,
				projectId: values.projectId ?? null,
				tenantId,
			});

			// The picker collects a deferred image selection while the post
			// does not exist yet; it is attached right after creation.
			if (deferredImage) {
				const attached = await tryAttach(created.id, deferredImage);
				if (!attached) {
					// The post was created and stays consistent (no image row,
					// no alt patch); the drawer stays open on the handoff
					// surface naming the cause with the retry/discard actions.
					return;
				}
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
		if (!createdPostId || !deferredImage) {
			return;
		}
		setHandoffCause('');
		const attached = await tryAttach(createdPostId, deferredImage);
		if (attached) {
			await completeAndClose();
		}
	};

	const handleDiscardImage = () => {
		// The created post is kept — it is consistent without an image; only
		// the failed attachment attempt is dropped. The list refresh makes the
		// saved draft visible immediately.
		setHandoffCause('');
		setCreatedPostId(null);
		void invalidateTenantPosts(qc, tenantId);
		methods.reset();
		onOpenChange(false);
	};

	// Closing the drawer drops any unattached selection; the picker reopens
	// with `selection: null` so no preview can outlive the state.
	const handleOpenChange = (o: boolean) => {
		if (!o) {
			setDeferredImage(null);
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
						<p
							id="post-body-counter"
							className={
								body.length > 20000
									? 'text-[var(--publy-danger)] text-xs'
									: 'text-muted-foreground text-xs'
							}
						>
							{body.length} / 20000
						</p>
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
								busy={attachImage.isPending || updateImageAlt.isPending}
								onRetry={() => void handleRetryAttach()}
								onDiscard={handleDiscardImage}
							/>
						) : (
							<PostImagePicker
								onSelect={handleSelect}
								selection={deferredImage}
							/>
						)}
					</DrawerBody>
					<DrawerFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{t('common:cancel')}
						</Button>
						<Button
							type="submit"
							variant="default"
							disabled={methods.formState.isSubmitting}
							data-testid="tenant-posts-create-save"
						>
							{methods.formState.isSubmitting
								? t('posts:saving')
								: t('posts:save')}
						</Button>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
