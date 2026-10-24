/**
 * Per-destination customization of a post (#2172): what one destination
 * overrides, and nothing else. A destination with no override inherits the
 * shared post, so the composer only ever sends the customized fields.
 *
 * Overrides are keyed by stable ids, not positions: a segment by its draft id
 * (the first segment is {@link BODY_KEY}) and an image by its asset id (or its
 * local id before it is uploaded). Positions are computed once, at the wire
 * boundary, so reordering the shared segments never swaps overrides.
 */

/** Key of the first segment (the post body); follow-ups use their draft id. */
export const BODY_KEY = 'body';

export interface MediaOverride {
	/** The images this destination publishes, in publish order; null keeps
	 * every image of the post in its order (only alt texts are customized), so
	 * images added later still flow to this destination. */
	imageKeys: string[] | null;
	/** Alt text by image key, only where it differs from the shared alt text. */
	altTexts: Record<string, string>;
}

export interface DestinationOverride {
	/** Customized text by segment key; an absent key inherits the shared text. */
	texts: Record<string, string>;
	/** Null inherits the post's images and their order. */
	media: MediaOverride | null;
}

/** Overrides by social account id; an absent account inherits everything. */
export type DestinationOverrides = Record<string, DestinationOverride>;

/** The wire overrides object (`destinations[].overrides`, rendition PUT body). */
export type WireOverrides = {
	segments?: { position: number; text: string }[];
	media?: {
		/** Omitted keeps every image of the post, in its order. */
		assetIds?: string[];
		altTexts: { assetId: string; altText: string }[];
	};
};

export type WireDestination = {
	socialAccountId: string;
	scheduledAt?: string;
	overrides?: WireOverrides;
};

export const NO_OVERRIDE: DestinationOverride = { texts: {}, media: null };

export const isCustomized = (
	override: DestinationOverride | undefined,
): boolean =>
	override !== undefined &&
	(Object.keys(override.texts).length > 0 || override.media !== null);

export const withText = (
	override: DestinationOverride,
	key: string,
	text: string,
): DestinationOverride => ({
	...override,
	texts: { ...override.texts, [key]: text },
});

export const withoutText = (
	override: DestinationOverride,
	key: string,
): DestinationOverride => ({
	...override,
	texts: Object.fromEntries(
		Object.entries(override.texts).filter(([entryKey]) => entryKey !== key),
	),
});

export const withMedia = (
	override: DestinationOverride,
	media: MediaOverride | null,
): DestinationOverride => ({ ...override, media });

/** How many images a destination publishes: its own subset, else every shared
 * image. A key of an image that is no longer on the post counts for nothing. */
export const effectiveImageCount = (
	override: DestinationOverride | undefined,
	imageKeys: readonly string[],
): number => {
	const own = override?.media?.imageKeys;
	if (own === null || own === undefined) {
		return imageKeys.length;
	}
	const present = new Set(imageKeys);
	return own.filter((key) => present.has(key)).length;
};

/**
 * The overrides object for one destination, customized fields only; null when
 * the destination inherits everything. Only images and segments the post
 * still has are sent (the server refuses an override naming a removed image).
 * `assetIdByKey` turns a local image key into the uploaded asset id (a key it
 * does not know is already an asset id).
 */
export const toWireOverrides = (
	override: DestinationOverride | undefined,
	segmentKeys: readonly string[],
	imageKeys: readonly string[],
	assetIdByKey: ReadonlyMap<string, string> = new Map(),
): WireOverrides | null => {
	if (override === undefined) {
		return null;
	}

	const wire: WireOverrides = {};
	const segments = segmentKeys.flatMap((key, position) => {
		const text = override.texts[key];
		return text === undefined ? [] : [{ position, text }];
	});
	if (segments.length > 0) {
		wire.segments = segments;
	}

	if (override.media !== null) {
		const assetOf = (key: string) => assetIdByKey.get(key) ?? key;
		const present = new Set(imageKeys);
		const { imageKeys: own, altTexts } = override.media;
		wire.media = {
			altTexts: Object.entries(altTexts).flatMap(([key, altText]) =>
				present.has(key) ? [{ assetId: assetOf(key), altText }] : [],
			),
		};
		if (own !== null) {
			wire.media.assetIds = own.flatMap((key) =>
				present.has(key) ? [assetOf(key)] : [],
			);
		}
	}

	if (wire.segments === undefined && wire.media === undefined) {
		return null;
	}
	return wire;
};

/**
 * The `destinations[]` of a schedule or publish-now request: every selected
 * account, with `overrides` only on those that customize something.
 */
export const toWireDestinations = ({
	accountIds,
	overrides,
	segmentKeys,
	imageKeys,
	assetIdByKey,
}: {
	accountIds: readonly string[];
	overrides: DestinationOverrides;
	segmentKeys: readonly string[];
	imageKeys: readonly string[];
	assetIdByKey?: ReadonlyMap<string, string>;
}): WireDestination[] =>
	accountIds.map((socialAccountId) => {
		const wire = toWireOverrides(
			overrides[socialAccountId],
			segmentKeys,
			imageKeys,
			assetIdByKey,
		);
		if (wire === null) {
			return { socialAccountId };
		}
		return { socialAccountId, overrides: wire };
	});

/** What the rendition read model says a destination overrides. */
export type RenditionOverrides = {
	segments: { position: number; text: string }[];
	/** Null when the destination inherits the post's images. */
	media: {
		/** Null keeps every image of the post, in its order. */
		assetIds: string[] | null;
		altTexts: { assetId: string; altText: string }[];
	} | null;
};

/** Turns the server's stored overrides back into the editor's model. */
export const fromRenditionOverrides = (
	rendition: RenditionOverrides,
	segmentKeys: readonly string[],
): DestinationOverride => {
	const texts: Record<string, string> = {};
	for (const { position, text } of rendition.segments) {
		const key = segmentKeys[position];
		if (key !== undefined) {
			texts[key] = text;
		}
	}

	if (rendition.media === null) {
		return { texts, media: null };
	}

	const altTexts: Record<string, string> = {};
	for (const { assetId, altText } of rendition.media.altTexts) {
		altTexts[assetId] = altText;
	}
	return {
		texts,
		media: {
			// Null stays null: the destination keeps inheriting the post's images
			// until the user changes the set or the order.
			imageKeys: rendition.media.assetIds,
			altTexts,
		},
	};
};
