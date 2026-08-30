// Reads a whole code point, not a UTF-16 unit. `word[0]` on an astral-plane
// character (an emoji, most CJK extensions) returns half a surrogate pair and
// renders as U+FFFD; `[...word][0]` was correct but spreads a string, which
// `typescript/no-misused-spread` forbids. codePointAt + fromCodePoint is both
// spread-free and correct.
const firstCodePoint = (word: string): string => {
	const code = word.codePointAt(0);
	if (code === undefined) {
		return '';
	}
	return String.fromCodePoint(code);
};
const PALETTE_SIZE = 8;

export const paletteIndex = (seed: string): number => {
	let hash = 0;
	for (const char of seed) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997;
	}
	return (hash % PALETTE_SIZE) + 1;
};

export const toInitials = (name: string): string => {
	const words = name
		.split(/\s+/)
		.map((word) => word.trim())
		.filter(Boolean);
	if (words.length === 0) {
		return '?';
	}
	const first = firstCodePoint(words[0]?.toUpperCase() ?? '');
	const second =
		words.length > 1 ? firstCodePoint(words.at(-1)?.toUpperCase() ?? '') : '';
	return `${first}${second}`.toUpperCase();
};
