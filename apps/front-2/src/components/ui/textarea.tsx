import * as React from 'react';
import { cn } from '~/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				'min-h-20 w-full min-w-0 resize-y rounded-[var(--publy-radius-input)] border border-border bg-input/35 px-3.5 py-2 text-base shadow-[var(--publy-shadow-input)] transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/12 md:text-[13px]',
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
