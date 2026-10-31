/**
 * The organisations list's status glyphs. Components only, so Fast Refresh
 * keeps working here (react-doctor `only-export-components`); the pure helpers
 * and constants live in `_tenants-list-config.tsx`.
 */

import { IconCircleCheck, IconCircleX, IconClock } from '@tabler/icons-react';
import { cn } from '~/lib/utils';

export type TenantStatusFilterKey = 'active' | 'pending' | 'suspended';

const STATUS_ICON = {
	active: IconCircleCheck,
	pending: IconClock,
	suspended: IconCircleX,
} satisfies Record<TenantStatusFilterKey, typeof IconCircleCheck>;

const STATUS_TEXT = {
	active: 'text-[var(--publy-chip-active-text)]',
	pending: 'text-[var(--publy-chip-pending-text)]',
	suspended: 'text-[var(--publy-chip-suspended-text)]',
} satisfies Record<TenantStatusFilterKey, string>;

export const StatusIcon = ({ status }: { status: TenantStatusFilterKey }) => {
	const Icon = STATUS_ICON[status];
	return (
		<Icon
			aria-hidden="true"
			className={cn('size-4 shrink-0', STATUS_TEXT[status])}
		/>
	);
};
