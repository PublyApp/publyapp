import { useState, type CSSProperties } from 'react';
import { toInitials } from '~/components/ui/avatar-initials';
import { Image } from '~/components/ui/image';
import { cn } from '~/lib/utils';

type PersonAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const sizeClassNames: Record<PersonAvatarSize | 'default', string> = {
	default: 'size-[26px] text-[10px]',
	xs: 'size-5 text-[8px]',
	sm: 'size-8 text-[11px]',
	md: 'size-9 text-xs',
	lg: 'size-14 text-lg',
};

const PersonAvatarVisual = ({
	name,
	avatarUrl,
}: {
	name: string;
	avatarUrl?: string | null;
}) => {
	const [hasImageError, setHasImageError] = useState(false);

	return avatarUrl && !hasImageError ? (
		<Image
			src={avatarUrl}
			alt=""
			aria-hidden="true"
			ratio="1/1"
			className="size-full rounded-full"
			onError={() => setHasImageError(true)}
		/>
	) : (
		<span
			aria-hidden="true"
			data-slot="person-avatar-fallback"
			className="inline-flex size-full items-center justify-center rounded-full bg-muted font-semibold leading-none text-muted-foreground select-none"
		>
			{toInitials(name)}
		</span>
	);
};

export const EntityAvatar = ({
	name,
	avatarUrl,
	size,
	accessibleLabel,
	className,
	style,
}: {
	name: string;
	avatarUrl?: string | null;
	size?: PersonAvatarSize;
	accessibleLabel?: string;
	className?: string;
	style?: CSSProperties;
}) => (
	<span
		data-slot="person-avatar"
		role={accessibleLabel ? 'img' : undefined}
		aria-label={accessibleLabel}
		aria-hidden={accessibleLabel ? undefined : true}
		style={style}
		className={cn(
			'inline-flex shrink-0 rounded-full',
			sizeClassNames[size ?? 'default'],
			className,
		)}
	>
		<PersonAvatarVisual
			key={avatarUrl ?? 'no-avatar'}
			name={name}
			avatarUrl={avatarUrl}
		/>
	</span>
);

export const PersonAvatar = EntityAvatar;
