import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

/**
 * The section frame for this direction: the rhythm class every section below
 * the fold carries, plus the mono-eyebrow → display-heading opener that
 * starts each one. The 12px gap between eyebrow and heading is the direction's
 * uniform opener gap; the gap between the heading block and the body below it
 * belongs to the caller's first body element (32px for narrow text sections,
 * 48px for grid and ledger sections), so this frame deliberately adds none.
 *
 * `headingVariant` picks the display step: `display` (76px clamp, for the
 * commitment statement, with its translator-authored line breaks) or `title`
 * (44px clamp, every other section heading, capped at 16ch). Sections whose
 * opener is the eyebrow alone omit `heading`.
 */
export type Landing08SectionProps = {
	eyebrow: string;
	heading?: string;
	headingVariant?: 'title' | 'display';
	className?: string;
	children?: ReactNode;
} & Omit<React.ComponentProps<'section'>, 'className' | 'children'>;

export const Landing08Section = ({
	eyebrow,
	heading,
	headingVariant = 'title',
	className,
	children,
	...props
}: Landing08SectionProps) => (
	<section className={cn('publy-fold-section', className)} {...props}>
		<p className="publy-type-mono">{eyebrow}</p>
		{heading === undefined ? null : (
			<h2
				className={cn(
					'mt-3',
					headingVariant === 'display'
						? 'publy-type-display whitespace-pre-line'
						: 'publy-type-title max-w-[16ch]',
				)}
			>
				{heading}
			</h2>
		)}
		{children}
	</section>
);
