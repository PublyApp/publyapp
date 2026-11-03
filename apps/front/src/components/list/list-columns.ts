/**
 * Column preferences for a generic list page (Shopkart OS
 * `features/items/column-prefs.ts`, rewritten without zod): the first column
 * is pinned — never moved, never hidden — and a saved order is cleaned to
 * known ids, once each, with the pinned column first.
 */

/** Every known column not currently shown, in the caller's order. */
export const hiddenColumns = (
	shown: readonly string[],
	all: Iterable<string>,
): string[] => {
	const on = new Set(shown);
	return [...all].filter((id) => !on.has(id));
};

/**
 * Moves `from` before `before` (to the end when null or unknown); the pinned
 * column never moves and nothing lands before it.
 */
export const moveColumn = (
	shown: readonly string[],
	from: string,
	before: string | null,
	locked: string,
): string[] => {
	if (from === locked || from === before || !shown.includes(from)) {
		return [...shown];
	}

	const rest = shown.filter((id) => id !== from);
	const at = before === null ? -1 : rest.indexOf(before);
	if (at === -1) {
		return [...rest, from];
	}

	const slot = Math.max(1, at);
	return [...rest.slice(0, slot), from, ...rest.slice(slot)];
};

/** Hides a shown column (never the pinned one), or shows a hidden one last. */
export const toggleColumn = (
	shown: readonly string[],
	id: string,
	locked: string,
): string[] => {
	if (id === locked) {
		return [...shown];
	}

	if (shown.includes(id)) {
		return shown.filter((column) => column !== id);
	}

	return [...shown, id];
};
