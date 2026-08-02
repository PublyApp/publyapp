import { useTranslation } from 'react-i18next';

type TrialStep = {
	id: 'set-up' | 'publish' | 'stabilize';
	titleKey: string;
	labelKey: string;
	descriptionKey: string;
};

const TRIAL_STEPS: readonly TrialStep[] = [
	{
		id: 'set-up',
		titleKey: 'landing-timeline-step-1-title',
		labelKey: 'landing-timeline-step-1-label',
		descriptionKey: 'landing-timeline-step-1-description',
	},
	{
		id: 'publish',
		titleKey: 'landing-timeline-step-2-title',
		labelKey: 'landing-timeline-step-2-label',
		descriptionKey: 'landing-timeline-step-2-description',
	},
	{
		id: 'stabilize',
		titleKey: 'landing-timeline-step-3-title',
		labelKey: 'landing-timeline-step-3-label',
		descriptionKey: 'landing-timeline-step-3-description',
	},
];

/**
 * "What comes next" — the planned trial, hedged in the same register as
 * `landing-trial-plan-note` everywhere else in the product: never described
 * as running today. No connector line, no numbered circles —
 * `--publy-radius-circular` is off-limits and a timeline chevron would be
 * decoration; the mono ordinals alone carry the sequence.
 *
 * `<ol>`/`<li>`, not `<div>`: this is a numbered sequence (I.1), so a screen
 * reader should announce it as a three-item list, not three unrelated cells.
 */
export const Landing08Trial = () => {
	const { t } = useTranslation('landing-08');

	return (
		<>
			<p className="publy-type-copy mt-4 max-w-[58ch]">
				{t('landing-trial-plan-note')}
			</p>
			<ol className="publy-marketing-hairline-grid mt-12 grid grid-cols-1 sm:grid-cols-3">
				{TRIAL_STEPS.map((step, index) => (
					<li
						key={step.id}
						className="px-0 py-8 sm:px-6 sm:first:pl-0 sm:last:pr-0"
					>
						<div className="flex items-center gap-2">
							<span className="publy-type-mono">
								{String(index + 1).padStart(2, '0')}
							</span>
							<span className="publy-type-mono text-(--publy-foreground)">
								{t(step.titleKey)}
							</span>
						</div>
						<p className="publy-type-copy-mark mt-3">{t(step.labelKey)}</p>
						<p className="publy-type-copy mt-2">{t(step.descriptionKey)}</p>
					</li>
				))}
			</ol>
		</>
	);
};
