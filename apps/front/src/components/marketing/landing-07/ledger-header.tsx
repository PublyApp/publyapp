import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

import { MarketingBrand } from '../marketing-brand';

/**
 * Row 00 — chrome, not a numbered row (§4 Row 00). This route still renders
 * inside the shared MarketingShell (marketing-shell.tsx, off-limits to this
 * exploration), which already mounts its own sticky `MarketingHeader`. This
 * header therefore stacks BELOW that one (`top-(--publy-header-height)`
 * rather than `top-0`) instead of overlapping it — a documented consequence
 * of the /temp preview harness, not the shape a chosen direction would ship
 * (see .dump/report-t1.md).
 *
 * The scroll-driven hairline/blur (§4 Row 00, feedbackjar-10) is driven by an
 * IntersectionObserver on a 1px sentinel rather than a scroll listener, and
 * the unscrolled state is what SSRs — the enhancement only ever adds a
 * class, never hides content.
 */
export const LedgerHeader = () => {
	const { t } = useTranslation('landing-07');
	const [isScrolled, setIsScrolled] = useState(false);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) {
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => setIsScrolled(entry !== undefined && !entry.isIntersecting),
			{ threshold: 0 },
		);
		observer.observe(sentinel);

		return () => observer.disconnect();
	}, []);

	return (
		<>
			<div ref={sentinelRef} aria-hidden="true" className="h-px" />
			<header
				data-testid="landing-07-header"
				className={cn(
					'ld07-header sticky top-(--publy-header-height) z-(--publy-z-raised) border-b',
					isScrolled && 'ld07-header-scrolled',
				)}
			>
				<div className="mx-auto flex h-(--publy-header-height) w-full max-w-(--publy-container-chrome) items-center justify-between px-4 sm:px-6 lg:px-8">
					<MarketingBrand />
					<Link
						to="/signup"
						className={cn(
							buttonVariants({ variant: 'default', size: 'sm' }),
							'whitespace-nowrap no-underline',
						)}
					>
						{t('header-cta')}
					</Link>
				</div>
			</header>
		</>
	);
};
