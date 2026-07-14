import { Input as InputPrimitive } from '@base-ui/react/input';
import * as React from 'react';
import { cn } from '~/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				'md:h-9 h-11 w-full min-w-0 rounded-[var(--publy-radius-input)] border border-border bg-input/35 px-3.5 py-1 text-base shadow-[var(--publy-shadow-input)] transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/12 md:text-[13px]',
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
