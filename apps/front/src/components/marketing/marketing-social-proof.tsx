import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

import { MarketingContainer } from './marketing-container';
import { MARKETING_SOCIAL_PROOF_PLACEHOLDER_COUNT } from './marketing-nav';

/** Uneven widths so the row reads as six real wordmarks, not six identical
 *  bars. Class strings (not inline styles) because the prototypes' inline
 *  styling is exactly what must not carry over. */
const PLACEHOLDER_WIDTH_CLASSES = [
	'w-[84px]',
	'w-[66px]',
	'w-[96px]',
	'w-[74px]',
	'w-[88px]',
	'w-[70px]',
];

/**
 * Social-proof strip (#1038), at reading width.
 *
 * The handoff draws six customer wordmarks (Northbeam, Halcyon, …). Those are
 * invented names — no customer has agreed to be named — so shipping them
 * would be exactly the fabricated-content regression the repo bans. They
 * render here as neutral, decorative plates flagged `data-placeholder-logo="true"`
 * in the DOM, so the layout is real and reviewable while the claim is not
 * made. Real logos replace them as `currentColor` SVG at
 * `--publy-foreground-muted`.
 */
export const MarketingSocialProof = () => {
	const { t } = useTranslation('common');

	return (
		<section
			data-testid="marketing-social-proof"
			aria-labelledby="marketing-social-proof-caption"
			className="border-t border-(--publy-border) py-10"
		>
			<MarketingContainer
				width="reading"
				className="flex flex-col items-center gap-6"
			>
				<p
					id="marketing-social-proof-caption"
					className="publy-marketing-eyebrow text-center"
				>
					{t('marketing-social-proof-caption')}
				</p>
				<ul
					aria-hidden="true"
					className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5"
				>
					{PLACEHOLDER_WIDTH_CLASSES.slice(
						0,
						MARKETING_SOCIAL_PROOF_PLACEHOLDER_COUNT,
					).map((widthClass) => (
						<li
							key={widthClass}
							data-placeholder-logo="true"
							className={cn(
								'h-5 rounded-[var(--publy-radius-sm)] bg-(--publy-surface-active)',
								widthClass,
							)}
						/>
					))}
				</ul>
			</MarketingContainer>
		</section>
	);
};
