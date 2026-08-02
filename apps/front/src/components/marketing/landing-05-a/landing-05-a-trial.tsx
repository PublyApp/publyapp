import { useTranslation } from 'react-i18next';

const TRIAL_STEPS = ['1', '2', '3'] as const;

/**
 * §6 — the planned trial: claim-gated, three ruled steps.
 *
 * The plan note (`landing-trial-plan-note`) carries the whole section's
 * honesty — the trial is planned, never available — and its own copy already
 * frames every clause as future-facing, so it must not be reworded here. It
 * used to sit under the heading at 14px, one rank below the section's own
 * body copy: the page whispered the sentence it is most obliged to say. It is
 * now this section's DEK, rendered by `Landing05ASectionHeader` at the lead
 * step, keeping `data-testid="landing-trial-plan-note"` and its position
 * inside this section. The three steps below are what the note qualifies, so
 * they follow it rather than precede it.
 */
export const Landing05ATrial = () => {
	const { t } = useTranslation('landing-05-a');

	return (
		<div className="publy-marketing-hairline-grid publy-l05a-section-body grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
			{TRIAL_STEPS.map((step) => (
				<article key={step} className="p-8">
					<p className="publy-type-sky-label text-(--publy-marketing-eyebrow-accent)">
						{t(`landing-timeline-step-${step}-label`)}
					</p>
					<p className="publy-type-sky-display-4 mt-1 text-(--publy-foreground)">
						{t(`landing-timeline-step-${step}-title`)}
					</p>
					<p className="publy-type-sky-body mt-3 text-pretty text-(--publy-foreground-secondary)">
						{t(`landing-timeline-step-${step}-description`)}
					</p>
				</article>
			))}
		</div>
	);
};
