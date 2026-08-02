import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

const STEPS = ['1', '2', '3'] as const;

/**
 * The planned-trial ruler (PROMPT.md §10.1–§10.2): a 28px tick strip over
 * three `border-l` rail columns (`plane-20`) — the single most
 * image-independent section on the page, since it contains no raster imagery
 * at all. The claim it carries is gated exactly as `_context.md` §2 requires:
 * the trial is described only as *planned*, never as available, and the
 * hedge note renders inside this section with a stable `data-testid` so it
 * cannot be scrolled past unnoticed.
 */
export const LandingTimeline = () => {
	const { t } = useTranslation('landing-06');

	return (
		<div>
			<p className="publy-landing-06-eyebrow-mono">
				{t('landing-06-timeline-eyebrow')}
			</p>
			<h2 className="publy-landing-06-type-display-3 mt-3 max-w-[30ch] text-balance">
				{t('landing-06-timeline-title')}
			</h2>
			<p
				data-testid="landing-06-trial-plan-note"
				className="publy-landing-06-type-body mt-3 max-w-[60ch] text-(--publy-foreground-secondary)"
			>
				{t('landing-06-timeline-plan-note')}
			</p>
			<div aria-hidden="true" className="publy-landing-06-ruler mt-10 h-7" />
			<div className="grid grid-cols-1 gap-5 md:grid-cols-3">
				{STEPS.map((step) => (
					<div
						key={step}
						className="flex flex-col gap-8 border-l border-(--publy-landing-06-tier-hairline) p-5"
					>
						<div className="flex flex-col gap-2">
							<p className="publy-landing-06-eyebrow-mono">
								{t(`landing-06-timeline-step-${step}-title`)}
							</p>
							<p className="publy-landing-06-type-body-label">
								{t(`landing-06-timeline-step-${step}-label`)}
							</p>
						</div>
						<ul className="flex flex-col gap-2">
							<li className="flex items-start gap-2">
								<IconCheck
									aria-hidden="true"
									className="mt-0.5 size-[16px] shrink-0 text-(--publy-marketing-eyebrow-accent)"
								/>
								<span className="publy-landing-06-type-small text-(--publy-foreground-secondary)">
									{t(`landing-06-timeline-step-${step}-description`)}
								</span>
							</li>
						</ul>
					</div>
				))}
			</div>
		</div>
	);
};
