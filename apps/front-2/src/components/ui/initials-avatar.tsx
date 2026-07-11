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
	size?: 'sm' | 'md' | 'lg';
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

/**
 * Square r14 brand/logo tile for organization identity (tenant detail
 * header) — distinct from InitialsAvatar, which is circular and reserved for
 * people. Falls back to hashed initials when there's no logoUrl.
 */
export const BrandTile = ({
	name,
	logoUrl,
	className,
}: {
	name: string;
	logoUrl?: string | null;
	className?: string;
}) => {
	if (logoUrl) {
		return (
			<img
				src={logoUrl}
				alt=""
				className={
					className ? `publy-brand-tile ${className}` : 'publy-brand-tile'
				}
			/>
		);
	}

	return (
		<span
			aria-hidden="true"
			className={
				className ? `publy-brand-tile ${className}` : 'publy-brand-tile'
			}
			data-palette={paletteIndex(name)}
		>
			{toInitials(name)}
		</span>
	);
};
