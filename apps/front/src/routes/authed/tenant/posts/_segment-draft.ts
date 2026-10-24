/** A follow-up segment as the composer holds it: the id is the stable React
 * key, so reordering never swaps DOM state between segments. */
export type SegmentDraft = { id: string; text: string };

export const newSegmentDraft = (
	text = '',
	id: string = crypto.randomUUID(),
): SegmentDraft => ({ id, text });

/** Shared empty list: a stable default for watched form values. */
export const NO_SEGMENTS: SegmentDraft[] = [];

/**
 * The drafts for the segments the server holds, keeping each segment's id
 * across a refetch so what is keyed by it (a destination's customization)
 * stays on the same segment. A server segment takes the id of the first
 * not-yet-used previous draft with the SAME text, wherever that draft now
 * sits (the user may have reordered locally); a segment with no such draft
 * gets a fresh id, and whatever was keyed by an id that is gone is dropped
 * rather than landing on a different segment.
 */
export const reconcileSegmentDrafts = (
	previous: readonly SegmentDraft[],
	texts: readonly string[],
): SegmentDraft[] => {
	const used = new Set<string>();
	const drafts: SegmentDraft[] = [];
	for (const text of texts) {
		const match = previous.find(
			(draft) => draft.text === text && !used.has(draft.id),
		);
		if (match) {
			used.add(match.id);
		}
		drafts.push(newSegmentDraft(text, match?.id));
	}
	return drafts;
};
