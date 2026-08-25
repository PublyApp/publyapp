import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
	"group/button inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-ring aria-invalid:focus-visible:ring-ring dark:aria-invalid:focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					'btn-primary-chrome bg-primary text-primary-foreground hover:bg-primary/80',
				outline:
					'border-(--publy-border-strong) bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-input/20 dark:hover:bg-input/30',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
				ghost:
					'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
				destructive:
					'bg-(--publy-destructive-soft) text-destructive hover:bg-(--publy-destructive-soft-hover)',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				default:
					'h-9 gap-1.5 rounded-[var(--publy-radius-medium-control)] px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
				xs: "h-6 gap-1 rounded-[var(--publy-radius-chip)] px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
				sm: 'h-8 gap-1 rounded-[var(--publy-radius-small-control)] px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
				lg: 'h-10 gap-1.5 rounded-[var(--publy-radius-control)] px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
				icon: 'size-9 rounded-[var(--publy-radius-medium-control)]',
				'icon-xs':
					"size-6 rounded-[var(--publy-radius-chip)] [&_svg:not([class*='size-'])]:size-3",
				'icon-sm': 'size-8 rounded-[var(--publy-radius-small-control)]',
				'icon-lg': 'size-10 rounded-[var(--publy-radius-control)]',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);
