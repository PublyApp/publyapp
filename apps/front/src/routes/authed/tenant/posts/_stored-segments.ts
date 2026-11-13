import type { TenantPostDetails } from '~/lib/query/tenant-posts';

import type { SegmentDraft } from './_segment-draft';

export type StoredSegments = TenantPostDetails['segments'];

/** The stored segment a draft came from, by its stored id. */
export const storedFor = (
	stored: StoredSegments,
	draft: SegmentDraft,
): StoredSegments[number] | undefined =>
	draft.serverId === undefined
		? undefined
		: stored.find((segment) => segment.id === draft.serverId);

/** How many images each follow-up draft holds (by draft id): a follow-up not
 * saved yet holds none. */
export const storedImageCounts = (
	drafts: readonly SegmentDraft[],
	stored: StoredSegments,
): Record<string, number> =>
	Object.fromEntries(
		drafts.map((draft) => [
			draft.id,
			storedFor(stored, draft)?.images.length ?? 0,
		]),
	);
