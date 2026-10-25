import { useTranslation } from 'react-i18next';
import { useResponseMessageTranslator } from '~/lib/i18n/use-response-message-translator';
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
	| {
			ok: true;
			/** Asset id by the picked image's local id: a destination's image
			 * override refers to an image by its local id until it exists. */
			assetIds: ReadonlyMap<string, string>;
	  }
	| {
			ok: false;
			/** Exactly the images still to do; an attached image whose alt step
			 * failed keeps its asset id so a retry never attaches it twice. */
			remaining: DeferredImageSelection[];
			/** Asset id by local id of every image attached before the failure. */
			assetIds: ReadonlyMap<string, string>;
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
	const translateResponseMessage = useResponseMessageTranslator();
	const attachImage = useAttachPostImageMutation();
	const updateImageAlt = useUpdatePostImageAltMutation();
	const invalidateCaches = useInvalidatePostImageCaches();

	const attachInOrder = async (
		postId: string,
		images: DeferredImageSelection[],
		progress: {
			remaining: DeferredImageSelection[];
			assetIds: Map<string, string>;
		},
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

		if (assetId) {
			progress.assetIds.set(image.id, assetId);
		}

		// An image attached earlier whose alt text was cleared since needs the
		// empty alt sent too, or the server keeps the old one.
		if (assetId && (image.altText.trim() || image.attachedAssetId)) {
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
		const progress = {
			remaining: images,
			assetIds: new Map<string, string>(),
		};
		try {
			await attachInOrder(postId, images, progress);
			return { ok: true, assetIds: progress.assetIds };
		} catch (error) {
			return {
				ok: false,
				remaining: progress.remaining,
				assetIds: progress.assetIds,
				cause:
					getFailureMessage(toApiFailure(error), {
						fallback: t('common:an-error-occurred'),
						translate: translateResponseMessage,
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
