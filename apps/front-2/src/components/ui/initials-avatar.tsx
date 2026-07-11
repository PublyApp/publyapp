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
	size?: 'xs' | 'sm' | 'md' | 'lg';
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
 * Overlapping hashed-initials avatars for a stat-card secondary row (e.g.
 * Owners count) — 20px circles, −6px overlap, thin ring so they read as a
 * stack rather than a run-on row.
 */
export const AvatarStack = ({
	names,
	max = 5,
}: {
	names: string[];
	max?: number;
}) => {
	const visible = names.slice(0, max);

	if (visible.length === 0) {
		return null;
	}

	return (
		<div className="publy-avatar-stack">
			{visible.map((name, index) => (
				<span
					key={`${name}-${index}`}
					aria-hidden="true"
					className="publy-avatar-initials publy-avatar-stack-item"
					data-palette={paletteIndex(name)}
					data-size="xs"
					style={{ zIndex: visible.length - index }}
				>
					{toInitials(name)}
				</span>
			))}
		</div>
	);
};

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
