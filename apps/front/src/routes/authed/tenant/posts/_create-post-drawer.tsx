import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerBody,
	DrawerFooter,
	DrawerForm,
} from '~/components/ui/drawer';
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import { useResponseMessageTranslator } from '~/lib/i18n/use-response-message-translator';
import { savePost, invalidateTenantPosts } from '~/lib/query/tenant-posts';
import { useTenantProjectsQuery } from '~/lib/query/tenant-projects';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';

import { CreatePostFields } from './_create-post-drawer-body';
import { CreatePostActions } from './_create-post-drawer-parts';
import { PublishOnBlock } from './_publish-on-block';
import { NO_SEGMENTS } from './_segment-draft';
import { useDestinationOverrides } from './_use-destination-overrides';
import { useImageHandoff } from './_use-image-handoff';
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
	const translateResponseMessage = useResponseMessageTranslator();
	const qc = useQueryClient();
	const projectsQuery = useTenantProjectsQuery({ tenantId });
	// Language-keyed resolver: schema + resolver built once per language, not
	// once per render.
	const resolver = useLanguageKeyedZodResolver<FormValues>(getSchema, [
		'posts',
		'common',
	]);
	const methods = useForm<FormValues>({
		resolver,
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

	const handoff = useImageHandoff(tenantId);
	const { deferredImages, setDeferredImages } = handoff;

	const publishPrep = usePreparePublish({
		methods,
		tenantId,
		deferredImages,
		setDeferredImages,
		tryAttach: handoff.tryAttach,
	});

	// The ONE way out of the drawer (Cancel, Escape, Discard, a finished save):
	// no handoff, publish intent, selection or retry in flight survives it.
	const resetAll = () => {
		handoff.reset();
		publishPrep.forget();
		destinationOverrides.resetAll();
	};

	const completeAndClose = async () => {
		resetAll();
		await invalidateTenantPosts(qc, tenantId);
		methods.reset();
		onOpenChange(false);
	};

	// Every Publish / Schedule attempt starts a fresh intent; the block reports
	// back when it was stopped.
	const prepareForPublish = () => {
		handoff.beginAttempt();
		return publishPrep.prepare();
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

			// A plain save drops any publish intent an earlier click left behind.
			handoff.clearIntent();
			handoff.beginAttempt();
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
								translate: translateResponseMessage,
							}) ?? undefined,
					});
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

	const handleDiscardImage = () => {
		// The created post is kept — it is consistent without the remaining
		// images; only the failed attachment attempt is dropped. The list
		// refresh makes the saved draft visible immediately.
		resetAll();
		void invalidateTenantPosts(qc, tenantId);
		methods.reset();
		onOpenChange(false);
	};

	const handleOpenChange = (o: boolean) => {
		if (!o) {
			resetAll();
		}
		onOpenChange(o);
	};

	return (
		<Drawer open={open} onOpenChange={handleOpenChange}>
			<DrawerContent width={736} data-testid="tenant-posts-create-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('posts:new-post')}</DrawerTitle>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody>
						<CreatePostFields
							body={body}
							segments={segments}
							onSegmentsChange={(next) =>
								methods.setValue('segments', next, { shouldDirty: true })
							}
							rootError={methods.formState.errors.root?.message}
							projectsQuery={projectsQuery}
							selection={selection}
							destinationOverrides={destinationOverrides}
							deferredImages={deferredImages}
							onSelectImages={publishPrep.selectImages}
							handoff={
								handoff.postId === null
									? null
									: {
											cause: handoff.cause,
											busy: handoff.isPending,
											onRetry: () => void handoff.retryAttach(completeAndClose),
											onDiscard: handleDiscardImage,
										}
							}
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
								onBeforePublish={prepareForPublish}
								onPublishInterrupted={handoff.keepIntent}
							/>
							<CreatePostActions
								isSubmitting={methods.formState.isSubmitting}
								busy={handoff.isPending}
								onCancel={() => handleOpenChange(false)}
							/>
						</div>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
		</Drawer>
	);
};
