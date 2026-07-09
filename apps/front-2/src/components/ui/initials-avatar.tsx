const PALETTE_SIZE = 8;

const paletteIndex = (seed: string): number => {
	let hash = 0;
	for (const char of seed) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997;
	}
	return (hash % PALETTE_SIZE) + 1;
};

const toInitials = (name: string): string => {
	const words = name
		.split(/\s+/)
		.map((word) => word.trim())
		.filter(Boolean);
	if (words.length === 0) {
		return '?';
	}
	const first = words[0]?.charAt(0) ?? '';
	const second = words.length > 1 ? (words.at(-1)?.charAt(0) ?? '') : '';
	return `${first}${second}`.toUpperCase();
};

export const InitialsAvatar = ({
	name,
	size,
}: {
	name: string;
	size?: 'md' | 'lg';
}) => (
	<span
		aria-hidden="true"
		className="publy-avatar-initials"
		data-palette={paletteIndex(name)}
		data-size={size}
	>
		{toInitials(name)}
	</span>
);
