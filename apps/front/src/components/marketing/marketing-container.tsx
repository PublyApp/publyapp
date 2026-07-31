import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

/**
 * The two marketing container roles (#1038). `chrome` (1280) is for chrome
 * that is SCANNED — the header and its mega panel. `reading` (1152) is for
 * content that is READ — page body, social proof, CTA band and the footer.
 * Both take the same `px-4 sm:px-6` gutters, so below 1280 they are
 * identical; above it the reading column sits 64px inside the header's outer
 * edges, which is the intended, stated consequence of giving each surface a
 * role instead of picking one number.
 */
export type MarketingContainerWidth = 'chrome' | 'reading';

export const MarketingContainer = ({
	children,
	className,
	width,
	...props
}: {
	children: ReactNode;
	className?: string;
	width: MarketingContainerWidth;
} & Omit<React.ComponentProps<'div'>, 'children' | 'className'>) => (
	<div
		data-container-width={width}
		className={cn(
			'mx-auto w-full px-4 sm:px-6',
			width === 'chrome'
				? 'max-w-(--publy-container-chrome)'
				: 'max-w-(--publy-container-reading)',
			className,
		)}
		{...props}
	>
		{children}
	</div>
);
