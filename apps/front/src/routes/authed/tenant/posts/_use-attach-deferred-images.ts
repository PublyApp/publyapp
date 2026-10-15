import { useTranslation } from 'react-i18next';
import {
	useAttachPostImageMutation,
	useInvalidatePostImageCaches,
	useUpdatePostImageAltMutation,
} from '~/lib/query/tenant-post-images';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import type { DeferredImageSelection } from './_post-image-picker';

export type AttachDeferredImagesOutcome =
	| { ok: true }
	| {
			ok: false;
			/** Exactly the images still to do; an attached image whose alt step
			 * failed keeps its asset id so a retry never attaches it twice. */
			remaining: DeferredImageSelection[];
			/** Plain-words cause (the server's problem detail when it sent one). */
			cause: string;
	  };

/**
 * Attaches the create drawer's deferred images to the just-created post, in
 * the picked order (each append takes the next position), then each image's
 * alt text — which lives on the attached asset, addressed by the id the attach
 * answers with. Sequential on purpose, so it recurses instead of looping.
 */
export const useAttachDeferredImages = (tenantId: string) => {
	const { t } = useTranslation(['common']);
	const attachImage = useAttachPostImageMutation();
	const updateImageAlt = useUpdatePostImageAltMutation();
	const invalidateCaches = useInvalidatePostImageCaches();

	const attachInOrder = async (
		postId: string,
		images: DeferredImageSelection[],
		progress: { remaining: DeferredImageSelection[] },
	): Promise<void> => {
		const [image, ...rest] = images;
		if (!image) {
			return;
		}

		let assetId = image.attachedAssetId;
		if (!assetId) {
			const attached = await attachImage.mutateAsync({
				postId,
				tenantId,
				file: image.file,
			});
			assetId = attached?.id?.toString();
			progress.remaining = progress.remaining.map((entry) =>
				entry.id === image.id ? { ...entry, attachedAssetId: assetId } : entry,
			);
		}

		if (image.altText.trim() && assetId) {
			await updateImageAlt.mutateAsync({
				postId,
				tenantId,
				assetId,
				altText: image.altText.trim(),
			});
		}

		progress.remaining = progress.remaining.filter(
			(entry) => entry.id !== image.id,
		);
		await attachInOrder(postId, rest, progress);
	};

	const attachAll = async (
		postId: string,
		images: DeferredImageSelection[],
	): Promise<AttachDeferredImagesOutcome> => {
		const progress = { remaining: images };
		try {
			await attachInOrder(postId, images, progress);
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				remaining: progress.remaining,
				cause:
					getFailureMessage(toApiFailure(error), {
						fallback: t('common:an-error-occurred'),
					}) ?? '',
			};
		} finally {
			invalidateCaches();
		}
	};

	return {
		attachAll,
		isPending: attachImage.isPending || updateImageAlt.isPending,
	};
};
