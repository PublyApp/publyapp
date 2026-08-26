import type { CSSProperties } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { paletteIndex, toInitials } from '~/components/ui/avatar-initials';
import { cn } from '~/lib/utils';

type PersonAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const sizeClassNames = {
	default: 'size-[26px] text-[10px]',
	xs: 'size-5 text-[8px]',
	sm: 'size-8 text-[11px]',
	md: 'size-9 text-xs',
	lg: 'size-14 text-lg',
} satisfies Record<PersonAvatarSize | 'default', string>;

export const PersonAvatar = ({
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
	<Avatar
		key={avatarUrl ?? 'no-avatar'}
		data-slot="person-avatar"
		role={accessibleLabel ? 'img' : undefined}
		aria-label={accessibleLabel}
		aria-hidden={accessibleLabel ? undefined : true}
		style={style}
		className={cn(
			'inline-flex shrink-0 overflow-hidden rounded-full after:hidden',
			sizeClassNames[size ?? 'default'],
			className,
		)}
	>
		{avatarUrl ? (
			<AvatarImage src={avatarUrl} alt="" aria-hidden="true" />
		) : null}
		<AvatarFallback
			aria-hidden="true"
			data-slot="person-avatar-fallback"
			data-palette={paletteIndex(name)}
			className="publy-avatar-initials text-[var(--publy-avatar-foreground)] font-semibold leading-none text-[length:inherit] select-none"
		>
			{toInitials(name)}
		</AvatarFallback>
	</Avatar>
);
