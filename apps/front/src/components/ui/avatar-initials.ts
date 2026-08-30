const firstCodePoint = (word: string): string => word[0] ?? '';
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
