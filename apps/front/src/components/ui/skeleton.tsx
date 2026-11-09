import type * as React from 'react';
import { cn } from '~/lib/utils';

const Skeleton = ({ className, ...props }: React.ComponentProps<'div'>) => {
	return (
		<div
			data-slot="skeleton"
			className={cn(
				'animate-pulse rounded-[var(--publy-radius-control)] bg-foreground/10',
				className,
			)}
			{...props}
		/>
	);
};

export { Skeleton };
