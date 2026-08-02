import { useTranslation } from 'react-i18next';

import { LedgerRowHeader } from './ledger-row-header';
import { TickRuler } from './tick-ruler';
import { useLedgerReveal } from './use-ledger-reveal';

type TrialStep = {
	id: string;
	labelI18nKey: string;
	titleI18nKey: string;
	descriptionI18nKey: string;
};

const TRIAL_STEPS: readonly TrialStep[] = [
	{
		id: 'setup',
		labelI18nKey: 'trial-step-1-label',
		titleI18nKey: 'trial-step-1-title',
		descriptionI18nKey: 'trial-step-1-description',
	},
	{
		id: 'publish',
		labelI18nKey: 'trial-step-2-label',
		titleI18nKey: 'trial-step-2-title',
		descriptionI18nKey: 'trial-step-2-description',
	},
	{
		id: 'stabilize',
		labelI18nKey: 'trial-step-3-label',
		titleI18nKey: 'trial-step-3-title',
		descriptionI18nKey: 'trial-step-3-description',
	},
];

/**
 * One trial step. Its own component (rather than inlined in the `.map()`
 * below) because it calls the reveal hook — a hook call inside a `.map()`
 * callback is a rules-of-hooks violation.
 */
const TrialStepCell = ({ step, index }: { step: TrialStep; index: number }) => {
	const { t } = useTranslation('landing-07');
	const reveal = useLedgerReveal<HTMLDivElement>(index);

	return (
		<div {...reveal} className="bg-(--publy-background) px-1 py-6 md:px-6">
			<div className="flex items-baseline gap-2.5">
				<span
					aria-hidden="true"
					className="ld07-row-number text-(--publy-foreground-subtle)"
				>
					{String(index + 1).padStart(2, '0')}
				</span>
				<span className="publy-type-eyebrow text-(--publy-foreground-muted)">
					{t(step.labelI18nKey)}
				</span>
			</div>
			<h3 className="ld07-display-3 mt-3 max-w-[24ch] text-balance">
				{t(step.titleI18nKey)}
			</h3>
			<p className="ld07-body-small mt-2 max-w-[40ch] text-(--publy-foreground-secondary)">
				{t(step.descriptionI18nKey)}
			</p>
		</div>
	);
};

/**
 * Row 09 — The planned trial (PROMPT.md §4 Row 09). Reuses the existing
 * `landing-timeline-*` / `landing-trial-plan-note` register (copied into
 * this namespace, §9.2: "reused unchanged") — the copy the claim guard is
 * calibrated to. The tick ruler's first of its two appearances on the page
 * (§6: "exactly twice … a structural motif, not a filler texture").
 *
 * Claim gating: the trial is *planned*, never available. No day count, no
 * "start your trial" CTA, no "no card required" line.
 *
 * Empty-slot reading: no slot.
 */
export const LedgerTrial = ({ rowNumber }: { rowNumber: string }) => {
	const { t } = useTranslation('landing-07');

	return (
		<div>
			<LedgerRowHeader
				number={rowNumber}
				eyebrow={t('trial-eyebrow')}
				title={t('trial-title')}
				titleContinuation={t('trial-title-continuation')}
			/>
			<TickRuler />
			<div className="mt-10 grid grid-cols-1 gap-px bg-(--publy-rule) md:mt-14 md:grid-cols-3">
				{TRIAL_STEPS.map((step, index) => (
					<TrialStepCell key={step.id} step={step} index={index} />
				))}
			</div>
			<p
				data-testid="landing-trial-plan-note"
				className="ld07-body-small mt-8 max-w-[68ch] text-(--publy-foreground-muted)"
			>
				{t('trial-plan-note')}
			</p>
		</div>
	);
};
