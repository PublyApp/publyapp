import {
	createUntypedArray,
	createUntypedNumber,
	createUntypedObject,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { UntypedNode } from '@microsoft/kiota-abstractions';
import type {
	WireDestination,
	WireOverrides,
} from '~/lib/publishing/destination-overrides';

import type { SetPublicationRenditionBody } from '@org/client-ts/models/index';

/**
 * Kiota types the open JSON fields of the schedule, publish-now and rendition
 * bodies as `UntypedNode`; these builders turn the composer's plain wire
 * objects into them, so no call site hand-assembles untyped nodes.
 */

const toUntypedSegments = (segments: NonNullable<WireOverrides['segments']>) =>
	createUntypedArray(
		segments.map(({ position, text }) =>
			createUntypedObject({
				position: createUntypedNumber(position),
				text: createUntypedString(text),
			}),
		),
	);

const toUntypedMedia = (media: NonNullable<WireOverrides['media']>) =>
	createUntypedObject({
		assetIds: createUntypedArray(
			media.assetIds.map((assetId) => createUntypedString(assetId)),
		),
		altTexts: createUntypedArray(
			media.altTexts.map(({ assetId, altText }) =>
				createUntypedObject({
					assetId: createUntypedString(assetId),
					altText: createUntypedString(altText),
				}),
			),
		),
	});

/** An untyped object holding only the fields that are present. */
const toUntypedFields = (
	fields: ReadonlyArray<readonly [string, UntypedNode | undefined]>,
) =>
	createUntypedObject(
		Object.fromEntries(
			fields.filter(
				(field): field is readonly [string, UntypedNode] =>
					field[1] !== undefined,
			),
		),
	);

const toUntypedOverrides = ({ segments, media }: WireOverrides) =>
	toUntypedFields([
		['segments', segments && toUntypedSegments(segments)],
		['media', media && toUntypedMedia(media)],
	]);

/** `destinations[]`: `{socialAccountId, scheduledAt?, overrides?}` per account. */
export const toUntypedDestinations = (destinations: WireDestination[]) =>
	createUntypedArray(
		destinations.map(({ socialAccountId, scheduledAt, overrides }) =>
			toUntypedFields([
				['socialAccountId', createUntypedString(socialAccountId)],
				[
					'scheduledAt',
					scheduledAt === undefined
						? undefined
						: createUntypedString(scheduledAt),
				],
				['overrides', overrides && toUntypedOverrides(overrides)],
			]),
		),
	);

/** The rendition PUT body (PUT replaces ALL overrides; `{}` resets them). */
export const toRenditionBody = (
	overrides: WireOverrides | null,
): SetPublicationRenditionBody => {
	const body: SetPublicationRenditionBody = {};
	if (overrides?.segments !== undefined) {
		body.segments = toUntypedSegments(overrides.segments);
	}
	if (overrides?.media !== undefined) {
		body.media = toUntypedMedia(overrides.media);
	}
	return body;
};
