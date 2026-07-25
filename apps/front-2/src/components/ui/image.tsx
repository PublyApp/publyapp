import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

type ImageProps = Omit<ComponentProps<'img'>, 'className'> & {
	ratio: `${number}/${number}`;
	className?: string;
	imageClassName?: string;
};

export const Image = ({
	ratio,
	className,
	imageClassName,
	style,
	...props
}: ImageProps) => (
	<span
		data-slot="image"
		className={cn('relative block overflow-hidden', className)}
		style={{ aspectRatio: ratio, ...style }}
	>
		<img
			className={cn('absolute inset-0 size-full object-cover', imageClassName)}
			{...props}
		/>
	</span>
);
