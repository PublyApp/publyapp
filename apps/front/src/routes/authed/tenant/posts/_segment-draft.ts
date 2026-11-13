/** A follow-up segment as the composer holds it: the id is the stable React
 * key, so reordering never swaps DOM state between segments. `serverId` is the
 * stored segment this draft came from (absent for a segment added in the
 * editor): a save sends it so the segment's images follow its text. */
export type SegmentDraft = { id: string; text: string; serverId?: string };

export const newSegmentDraft = (
	text = '',
	id: string = crypto.randomUUID(),
	serverId?: string,
): SegmentDraft =>
	serverId === undefined ? { id, text } : { id, text, serverId };

/** Shared empty list: a stable default for watched form values. */
/** True when a follow-up that was at some position is no longer there: it
 * moved or was removed. Appending one shifts nothing. */
export const segmentsShifted = (
	before: readonly SegmentDraft[],
	after: readonly SegmentDraft[],
): boolean => before.some((draft, index) => draft.id !== after[index]?.id);

/** The number (2..N) of the follow-up with this composer key; undefined for
 * the post itself (no key) or a follow-up that is gone. */
export const segmentNumberOf = (
	key: string | undefined,
	segments: readonly SegmentDraft[],
): number | undefined => {
	const index = segments.findIndex((segment) => segment.id === key);
	return key === undefined || index === -1 ? undefined : index + 2;
};

export const NO_SEGMENTS: SegmentDraft[] = [];

/**
 * The drafts for the segments the server holds, keeping each segment's id
 * across a refetch so what is keyed by it (a destination's customization)
 * stays on the same segment. A server segment takes the id of the first
 * not-yet-used previous draft with the SAME text, preferring the draft at the
 * same index and otherwise the first match wherever it now sits (the user may
 * have reordered locally); a segment with no such draft
 * gets a fresh id, and whatever was keyed by an id that is gone is dropped
 * rather than landing on a different segment.
 */
export const reconcileSegmentDrafts = (
	previous: readonly SegmentDraft[],
	texts: readonly string[],
	serverIds?: readonly string[],
): SegmentDraft[] => {
	const used = new Set<string>();
	const drafts: SegmentDraft[] = [];
	for (const [index, text] of texts.entries()) {
		const sameIndex = previous[index];
		const match =
			sameIndex?.text === text && !used.has(sameIndex.id)
				? sameIndex
				: previous.find((draft) => draft.text === text && !used.has(draft.id));
		if (match) {
			used.add(match.id);
		}
		drafts.push(newSegmentDraft(text, match?.id, serverIds?.[index]));
	}
	return drafts;
};

/** Plain posts keep sending exactly what they always did. Each draft names the
 * stored segment it came from, so its images follow its text through a reorder
 * or a removal. */
export const segmentsPayload = (
	drafts: readonly SegmentDraft[],
	hasStoredSegments: boolean,
) =>
	drafts.length > 0 || hasStoredSegments
		? {
				segments: drafts.map((segment) => segment.text),
				segmentIds: drafts.map((segment) => segment.serverId),
			}
		: {};
