import * as React from 'react';
import { cn } from '~/lib/utils';

const Textarea = ({
	className,
	...props
}: React.ComponentProps<'textarea'>) => {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				'min-h-20 w-full min-w-0 resize-y rounded-[var(--publy-radius-input)] border border-border bg-input/50 px-3.5 py-2 text-base shadow-[var(--publy-shadow-input)] transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:border-destructive dark:aria-invalid:focus-visible:ring-destructive/40 md:text-[13px]',
				className,
			)}
			{...props}
		/>
	);
};

export { Textarea };
