import type { TenantPostImage } from '~/lib/query/tenant-post-images';

import type { ComposerImage } from './_destination-media-field';

/** The post's attached images as a destination tab sees them, keyed by asset
 * id. An image with no asset id cannot be named by an override: it is left
 * out. */
export const toComposerImages = (images: TenantPostImage[]): ComposerImage[] =>
	images.flatMap((image) =>
		image.id === null
			? []
			: [{ key: image.id, url: image.url, altText: image.altText ?? '' }],
	);
