import type * as React from 'react';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';

type FieldRowsSkeletonProps = React.ComponentProps<'div'> & {
	count: number;
	rowClassName?: string;
};

/**
 * Stacked placeholder rows standing in for form fields or read-only field
 * rows while a query resolves. Default row shape is an input-height bar;
 * override `rowClassName` for taller blocks.
 */
const FieldRowsSkeleton = ({
	count,
	rowClassName = 'h-9 w-full',
	className,
	...props
}: FieldRowsSkeletonProps) => {
	return (
		<div
			data-slot="field-rows-skeleton"
			className={cn('space-y-4', className)}
			{...props}
		>
			{Array.from({ length: count }, (_, index) => (
				<Skeleton key={index} className={rowClassName} />
			))}
		</div>
	);
};

type EntityHeaderSkeletonProps = React.ComponentProps<'div'> & {
	tileClassName: string;
	lines: string[];
	/**
	 * `inline` (default): tile left of the stacked name/meta lines — mirrors
	 * the loaded identity blocks on account/profile-style pages. `stacked`:
	 * tile above the lines — mirrors compact identity cards in grids.
	 */
	orientation?: 'inline' | 'stacked';
};

/**
 * Placeholder for an entity header — avatar/icon tile plus name and metadata
 * lines — mirroring the loaded composition of the calling surface.
 */
const EntityHeaderSkeleton = ({
	tileClassName,
	lines,
	orientation = 'inline',
	className,
	...props
}: EntityHeaderSkeletonProps) => {
	if (orientation === 'stacked') {
		return (
			<div
				data-slot="entity-header-skeleton"
				className={cn('flex flex-col gap-3', className)}
				{...props}
			>
				<Skeleton className={tileClassName} />
				{lines.map((lineClassName, index) => (
					<Skeleton key={index} className={lineClassName} />
				))}
			</div>
		);
	}

	return (
		<div
			data-slot="entity-header-skeleton"
			className={cn('flex items-center gap-4', className)}
			{...props}
		>
			<Skeleton className={tileClassName} />
			<div className="min-w-0 flex-1 space-y-1.5">
				{lines.map((lineClassName, index) => (
					<Skeleton key={index} className={lineClassName} />
				))}
			</div>
		</div>
	);
};

export { EntityHeaderSkeleton, FieldRowsSkeleton };
