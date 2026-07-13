import type * as React from 'react';
import { cn } from '~/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="skeleton"
			className={cn(
				'animate-pulse rounded-[var(--publy-radius-control)] bg-muted',
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
