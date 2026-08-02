import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

import { LANDING_06_PRESS_CLASSES } from './landing-motion';

/**
 * The hero (PROMPT.md §4): pure typography on the page wash down to y≈474,
 * then the one framed, concentric, elevated panel this page grants to
 * exactly two objects (§1.6). Empty, the frame reads as a correctly-sized,
 * correctly-shadowed, warm-gutter-ringed window in the page's own surface
 * colour (todesktop-29) — not a hole, because the 4px `--publy-primary-soft`
 * gutter and the lit top rim already say "this is a product surface" before
 * any asset lands.
 */
export const LandingHero = () => {
	const { t } = useTranslation('landing-06');

	return (
		<div className="flex flex-col items-center text-center">
			<span className="publy-landing-06-eyebrow-mono inline-flex items-center rounded-[var(--publy-radius-chip)] bg-(--publy-primary-soft) px-3 py-1">
				{t('landing-06-hero-eyebrow')}
			</span>
			<h1 className="publy-landing-06-type-display-1 mt-4 max-w-[19ch] text-balance">
				<span className="text-(--publy-foreground)">
					{t('landing-06-hero-title-claim')}
				</span>{' '}
				<span className="text-(--publy-foreground-muted)">
					{t('landing-06-hero-title-elaboration')}
				</span>
			</h1>
			<p className="publy-landing-06-type-deck-lg mt-4 max-w-[62ch] text-(--publy-foreground-secondary)">
				{t('landing-06-hero-description')}
			</p>
			{/* Mobile: stacked full-width buttons (§14.3), not a wrapped row —
			    two lg buttons side by side at 390px crowd the French labels. */}
			<div className="mt-8 flex w-full max-w-[360px] flex-col items-stretch gap-3 sm:max-w-none sm:w-auto sm:flex-row sm:items-center sm:justify-center">
				<Link
					to="/signup"
					className={cn(
						buttonVariants({ size: 'lg' }),
						'w-full no-underline sm:w-auto',
						LANDING_06_PRESS_CLASSES,
					)}
				>
					{t('landing-06-hero-primary-cta')}
				</Link>
				{/* Brand block automated rule 4: in-page navigation goes through the
				    router's `<Link hash>`, never a raw `<a href="/#tour">`. */}
				<Link
					to="/temp/landing-06"
					hash="tour"
					className={cn(
						buttonVariants({ variant: 'outline', size: 'lg' }),
						'w-full no-underline sm:w-auto',
						LANDING_06_PRESS_CLASSES,
					)}
				>
					{t('landing-06-hero-secondary-cta')}
				</Link>
			</div>
			<p className="publy-landing-06-type-small mt-3 text-(--publy-foreground-muted)">
				{t('landing-06-hero-beta-note')}
			</p>
			<div className="relative mt-14 w-full max-w-[1120px]">
				<div className="publy-landing-06-frame publy-landing-06-frame-elevated">
					<div className="publy-landing-06-frame-inner publy-landing-06-hero-frame-rim">
						<MarketingImageSlot
							slot="hero-calendar"
							subject="The week calendar across four brand profiles, real content, real avatars"
							ratio="16 / 10"
							alt="landing-06-hero-image-alt"
							className="publy-landing-06-slot-16-10 publy-landing-06-slot-tier-d0"
						/>
					</div>
				</div>
			</div>
		</div>
	);
};
