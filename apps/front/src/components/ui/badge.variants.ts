import { cva } from 'class-variance-authority';

// #1379 introduced these two outline utilities; #1405 re-scoped them. A plain
// <span> badge is unfocusable — `:focus-visible` can never match it — so the
// token outline lives behind the `[a]:` variant and only the badge-as-link
// pattern (`render={<a href/>}`, the shape the focus-ring cascade guard
// probes) paints it, replacing the UA's default link focus outline. Same
// combination shape as tabs.tsx. The 3px box-shadow ring itself stays on the
// base cva: DESIGN.md ("Focus rings") sets the ring width per component in
// its cva.
export const badgeVariants = cva(
	'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[var(--publy-radius-chip)] border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-ring aria-invalid:focus-visible:ring-ring dark:aria-invalid:focus-visible:border-ring dark:aria-invalid:focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3! [a]:focus-visible:outline-2 [a]:focus-visible:outline-ring',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
				secondary:
					'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
				destructive:
					'bg-destructive/10 text-destructive dark:bg-destructive/20 [a]:hover:bg-destructive/20',
				outline:
					'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
				ghost:
					'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
				link: 'text-primary underline-offset-4 hover:underline',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);
