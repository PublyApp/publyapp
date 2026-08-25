import { cva } from 'class-variance-authority';

export const tabsListVariants = cva(
	'group/tabs-list inline-flex w-fit items-center justify-center rounded-[var(--publy-radius-button)] p-1 text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:rounded-2xl data-[variant=line]:rounded-none',
	{
		variants: {
			variant: {
				default: 'bg-muted',
				line: 'w-full justify-start gap-4 border-b border-border bg-transparent p-0',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);
