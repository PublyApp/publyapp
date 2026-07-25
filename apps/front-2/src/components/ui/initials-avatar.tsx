import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { paletteIndex, toInitials } from '~/components/ui/avatar-initials';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { cn } from '~/lib/utils';

/**
 * Overlapping person avatars for a stat-card secondary row (e.g. Owners
 * count) — 20px circles, −6px overlap, thin ring so they read as a stack
 * rather than a run-on row.
 */
export const AvatarStack = ({
	people,
	max = 5,
}: {
	people: Array<{ id: string; name: string; avatarUrl?: string | null }>;
	max?: number;
}) => {
	const { t } = useTranslation('common');
	const visible = people.slice(0, max);

	if (visible.length === 0) {
		return null;
	}

	return (
		<div
			className="publy-avatar-stack"
			role="img"
			aria-label={t('avatar-stack-people', {
				names: people.map((person) => person.name).join(', '),
			})}
		>
			{visible.map((person, index) => (
				<PersonAvatar
					key={person.id}
					name={person.name}
					avatarUrl={person.avatarUrl}
					size="xs"
					className="publy-avatar-stack-item"
					style={{ zIndex: visible.length - index }}
				/>
			))}
		</div>
	);
};

/**
 * Square r14 brand/logo tile for organization identity (tenant detail
 * header) — distinct from circular person avatars. Falls back to hashed
 * initials when there's no logoUrl.
 */
// Keyed by `logoUrl` at the `BrandTile` call site below, so a `logoUrl`
// change remounts a fresh instance (fresh `errored` state) by identity
// instead of a reset-in-an-effect (F12).
const BrandTileVisual = ({
	name,
	logoUrl,
	className,
}: {
	name: string;
	logoUrl?: string | null;
	className?: string;
}) => {
	const [errored, setErrored] = useState(false);

	if (logoUrl && !errored) {
		return (
			<img
				src={logoUrl}
				alt=""
				width={56}
				height={56}
				onError={() => setErrored(true)}
				className={cn('publy-brand-tile', className)}
			/>
		);
	}

	return (
		<span
			aria-hidden="true"
			className={cn('publy-brand-tile', className)}
			data-palette={paletteIndex(name)}
		>
			{toInitials(name)}
		</span>
	);
};

export const BrandTile = ({
	name,
	logoUrl,
	className,
}: {
	name: string;
	logoUrl?: string | null;
	className?: string;
}) => (
	<BrandTileVisual
		key={logoUrl ?? 'none'}
		name={name}
		logoUrl={logoUrl}
		className={className}
	/>
);
