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
 *
 * The three steps are an ORDERED list and are marked up as one: "Set up ->
 * Publish -> Stabilize" is a sequence, and the order is part of the claim, so
 * a screen reader should hear "1 of 3" rather than three unrelated cells. The
 * numeric marker itself is removed (`list-none`): each step already carries
 * its own visible label, and a browser-drawn "1." beside it would be a second
 * ordinal in a different type register. `role="list"` is explicit for the
 * same reason the fact strip carries it: Safari drops list semantics from a
 * list whose `list-style` is `none`, and removing a marker must not also
 * remove the meaning.
 */
export const Landing05ATrial = () => {
	const { t } = useTranslation('landing-05-a');

	return (
		<ol
			role="list"
			className="publy-marketing-hairline-grid publy-l05a-section-body grid list-none grid-cols-[repeat(auto-fit,minmax(200px,1fr))]"
		>
			{TRIAL_STEPS.map((step) => (
				<li key={step} className="p-8">
					<p className="publy-type-sky-label text-(--publy-marketing-eyebrow-accent)">
						{t(`landing-timeline-step-${step}-label`)}
					</p>
					<p className="publy-type-sky-display-4 mt-1 text-(--publy-foreground)">
						{t(`landing-timeline-step-${step}-title`)}
					</p>
					<p className="publy-type-sky-body mt-3 text-pretty text-(--publy-foreground-secondary)">
						{t(`landing-timeline-step-${step}-description`)}
					</p>
				</li>
			))}
		</ol>
	);
};
