import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';
import { cn } from '~/lib/utils';

import { MarketingContainer } from './marketing-container';

/**
 * End-of-page CTA band (#1038), at reading width.
 *
 * The band itself is muted with a yellow button — never a yellow band: a
 * full-bleed primary surface is the one place the accent stops reading as
 * "the action" and starts reading as decoration.
 */
export const MarketingCtaBand = () => {
	const { t } = useTranslation('common');

	return (
		<section
			data-testid="marketing-cta-band"
			aria-labelledby="marketing-cta-heading"
			className="py-14"
		>
			<MarketingContainer width="reading">
				<div className="flex flex-col items-center gap-5 rounded-[var(--publy-radius-control)] bg-(--publy-surface-muted) px-6 py-12 text-center">
					{/* Measured, not assumed: the muted-foreground step reads
					    4.40:1 on --publy-surface-muted (it clears 4.5 only on
					    white), so the two small labels on this band step up to
					    the secondary foreground. Verified in a real browser over
					    the production build, see the PR body. */}
					<p className="publy-marketing-eyebrow text-(--publy-foreground-secondary)">
						{t('marketing-cta-kicker')}
					</p>
					<h2
						id="marketing-cta-heading"
						className="max-w-[22ch] text-[clamp(26px,3.2vw,42px)] leading-[1.1] font-semibold tracking-[-0.034em] text-foreground"
					>
						{t('marketing-cta-headline')}
					</h2>
					<p className="max-w-[56ch] text-base leading-[1.65] text-(--publy-foreground-secondary)">
						{t('marketing-cta-body')}
					</p>
					<div className="flex flex-wrap items-center justify-center gap-3">
						<Link
							to="/signup"
							className={cn(
								buttonVariants({ variant: 'default', size: 'lg' }),
								'no-underline',
							)}
						>
							{t('marketing-signup-cta')}
						</Link>
						<Link
							to="/login"
							className={cn(
								buttonVariants({ variant: 'outline', size: 'lg' }),
								'no-underline',
							)}
						>
							{t('marketing-log-in')}
						</Link>
					</div>
					<p className="publy-type-helper text-(--publy-foreground-secondary)">
						{t('marketing-cta-footnote')}
					</p>
				</div>
			</MarketingContainer>
		</section>
	);
};
