import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

import { LANDING_06_PRESS_CLASSES } from './landing-motion';

// Documentation for the closer slot's intended asset — never rendered (see
// MarketingImageSlot's doc comment). Held in a constant rather than inlined
// as the `subject` prop's literal so it reads as data, not JSX-attribute UI
// copy.
const CLOSING_SLOT_SUBJECT =
	'A wide brand plate or product still for the closer';

/**
 * The closing CTA (PROMPT.md §12.1–§12.3): the one deliberate backward step
 * on the page. After four tiers of tightening, the frame opens back up to D1
 * — 1173px wide, 120px of top padding, display-2 heading — while the header
 * stays condensed. The frame releases; the chrome does not.
 *
 * The card (`todesktop-15`) is a boxed slice of the same sky as the hero: the
 * identical concentric 14/4/10 frame, the identical halving shadow cascade
 * (the second and last of exactly two uses on the page, §1.6), filled with
 * the page wash rotated 353° instead of the hero's plain surface colour —
 * recognisable as "the hero again" without repeating its layout.
 */
export const LandingClosingCta = () => {
	const { t } = useTranslation('landing-06');

	return (
		<div className="publy-landing-06-frame publy-landing-06-frame-elevated">
			<div className="publy-landing-06-frame-inner relative bg-[image:var(--publy-landing-06-cta-wash)] px-6 py-14 text-center sm:px-16 sm:py-20">
				<p className="publy-landing-06-eyebrow-mono">
					{t('landing-06-closing-eyebrow')}
				</p>
				<h2 className="publy-landing-06-type-display-2 mx-auto mt-3 max-w-[22ch] text-balance">
					<span className="text-(--publy-foreground)">
						{t('landing-06-closing-title-claim')}
					</span>{' '}
					<span className="text-(--publy-foreground-muted)">
						{t('landing-06-closing-title-elaboration')}
					</span>
				</h2>
				<p className="publy-landing-06-type-deck mx-auto mt-4 max-w-[58ch] text-(--publy-foreground-secondary)">
					{t('landing-06-closing-description')}
				</p>
				<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
					<Link
						to="/signup"
						className={cn(
							buttonVariants({ size: 'lg' }),
							'no-underline',
							LANDING_06_PRESS_CLASSES,
						)}
					>
						{t('landing-06-closing-primary-cta')}
					</Link>
					<Link
						to="/temp/landing-06"
						hash="faq"
						className={cn(
							buttonVariants({ variant: 'outline', size: 'lg' }),
							'no-underline',
							LANDING_06_PRESS_CLASSES,
						)}
					>
						{t('landing-06-closing-secondary-cta')}
					</Link>
				</div>
				<p className="publy-landing-06-type-small mt-4 text-(--publy-foreground-muted)">
					{t('landing-06-closing-beta-note')}
				</p>
				{/* The second and last `tint` exception (§7.3): a transparent 180px
				    band inside a filled card would read as a printing error rather
				    than as reserved space; a whisper reads as a panel. */}
				<div className="mx-auto mt-10 max-w-[560px]">
					<MarketingImageSlot
						slot="closing-wordmark"
						subject={CLOSING_SLOT_SUBJECT}
						ratio="21 / 9"
						tint
						alt={t('landing-06-closing-image-alt')}
						className="publy-landing-06-slot-21-9 publy-landing-06-slot-tier-d3"
					/>
				</div>
			</div>
		</div>
	);
};
