import { useTranslation } from 'react-i18next';

const TRIAL_STEPS = ['1', '2', '3'] as const;

/**
 * §6 — the planned trial: claim-gated, three ruled steps. The plan note
 * (`landing-trial-plan-note`) carries the whole section's honesty — the
 * trial is planned, never available — and its own copy already frames every
 * clause as future-facing, so it must not be reworded here.
 */
export const Landing05Trial = () => {
	const { t } = useTranslation('landing-05');

	return (
		<>
			<p
				data-testid="landing-trial-plan-note"
				className="mt-3 max-w-[58ch] text-sm text-pretty text-(--publy-foreground-secondary)"
			>
				{t('landing-trial-plan-note')}
			</p>
			<div className="publy-marketing-hairline-grid mt-8 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
				{TRIAL_STEPS.map((step) => (
					<article key={step} className="bg-(--publy-surface) px-8 py-7">
						<p className="publy-type-sky-label text-(--publy-marketing-eyebrow-accent)">
							{t(`landing-timeline-step-${step}-label`)}
						</p>
						<p className="publy-type-sky-display-4 mt-1 text-(--publy-foreground)">
							{t(`landing-timeline-step-${step}-title`)}
						</p>
						<p className="publy-type-sky-body mt-3 text-(--publy-foreground-secondary)">
							{t(`landing-timeline-step-${step}-description`)}
						</p>
					</article>
				))}
			</div>
		</>
	);
};
