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

/** The local part of an e-mail address, or `null` when the value is not one. */
const emailLocalPart = (value: string): string | null => {
	const at = value.indexOf('@');
	if (at <= 0) {
		return null;
	}
	return value.slice(0, at).trim();
};

/** The first two letters of one word — an e-mail local part has no words to
 * take one letter from each, so `tiana@…` reads « TI », not « T ». */
const firstTwoLetters = (word: string): string => {
	const first = firstCodePoint(word);
	const second = firstCodePoint(word.slice(first.length));
	return `${first}${second}`.toUpperCase();
};

export const paletteIndex = (seed: string): number => {
	let hash = 0;
	for (const char of seed) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997;
	}
	return (hash % PALETTE_SIZE) + 1;
};

/**
 * The avatar initials: one letter from the first and last word of a name, or
 * two letters for an e-mail address (`lucas.bertin@…` → « LB », `tiana@…` →
 * « TI ») — the prototype's rule, fixed here once so no call site trims or
 * pads an address itself.
 */
export const toInitials = (name: string): string => {
	const local = emailLocalPart(name);
	if (local !== null) {
		const parts = local.split(/[.\-+_\s]+/).filter(Boolean);
		const [firstWord, secondWord] = parts;
		if (firstWord && secondWord) {
			return `${firstCodePoint(firstWord.toUpperCase())}${firstCodePoint(secondWord.toUpperCase())}`.toUpperCase();
		}
		return firstWord ? firstTwoLetters(firstWord.toUpperCase()) : '?';
	}

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
