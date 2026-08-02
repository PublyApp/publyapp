import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';
import { cn } from '~/lib/utils';

import { LedgerRowHeader } from './ledger-row-header';
import { useLedgerReveal } from './use-ledger-reveal';

type ChainStep = {
	id: 'draft' | 'approval' | 'publish';
	slot: string;
	subject: string;
	labelI18nKey: string;
	bodyI18nKey: string;
};

// Draft → Approval → Publish (PROMPT.md §4 Row 08) — the three slots this
// row owns, of the page's eight total.
const CHAIN_STEPS: readonly ChainStep[] = [
	{
		id: 'draft',
		slot: 'chain-draft',
		subject: 'Composer at draft state, close crop',
		labelI18nKey: 'chain-1-label',
		bodyI18nKey: 'chain-1-body',
	},
	{
		id: 'approval',
		slot: 'chain-approval',
		subject: 'The approval action, close crop',
		labelI18nKey: 'chain-2-label',
		bodyI18nKey: 'chain-2-body',
	},
	{
		id: 'publish',
		slot: 'chain-publish',
		subject: 'The published post with its audit entry, close crop',
		labelI18nKey: 'chain-3-label',
		bodyI18nKey: 'chain-3-body',
	},
];

// attio-28's proportional-but-capped strategy, scaled down for a close-crop
// slot rather than a full product screenshot (§5.1–5.2 register).
const CHAIN_SLOT_HEIGHT = 'h-[160px] md:h-[200px] xl:h-[220px]';

/**
 * One chain step. Its own component (rather than inlined in the `.map()`
 * below) because it calls the reveal hook — a hook call inside a `.map()`
 * callback is a rules-of-hooks violation.
 */
const ChainStepArticle = ({
	step,
	index,
}: {
	step: ChainStep;
	index: number;
}) => {
	const { t } = useTranslation('landing-07');
	const reveal = useLedgerReveal<HTMLElement>(index);

	return (
		<article
			{...reveal}
			className="grid grid-rows-[auto_1fr] gap-px bg-(--publy-rule)"
		>
			<div className="bg-(--publy-surface-raised)">
				<MarketingImageSlot
					slot={step.slot}
					subject={step.subject}
					className={cn('w-full', CHAIN_SLOT_HEIGHT)}
				/>
			</div>
			<div className="bg-(--publy-background) p-5 md:p-6">
				<div className="flex items-baseline gap-2.5">
					<span
						aria-hidden="true"
						className="ld07-row-number text-(--publy-foreground-subtle)"
					>
						{String(index + 1).padStart(2, '0')}
					</span>
					<h3 className="publy-type-eyebrow text-(--publy-foreground-secondary)">
						{t(step.labelI18nKey)}
					</h3>
				</div>
				<p className="ld07-body-small mt-2 max-w-[38ch] text-(--publy-foreground-secondary)">
					{t(step.bodyI18nKey)}
				</p>
			</div>
		</article>
	);
};

/**
 * Row 08 — The chain (PROMPT.md §4 Row 08). Ground: raised. Three slots,
 * inverted against Row 04: the well sits on the raised row ground and the
 * caption block sits on the page ground, so the page's two slot-bearing rows
 * don't look like the same module twice.
 *
 * Empty-slot reading: three ruled fields in a row, each with a numbered step
 * label and one sentence underneath — a three-step process diagram drawn in
 * hairlines and numbers, which is what a chain *is*. `padyna-14`'s finding
 * applies verbatim: the caption alone communicates the step.
 */
export const LedgerChain = ({ rowNumber }: { rowNumber: string }) => {
	const { t } = useTranslation('landing-07');

	return (
		<div>
			<LedgerRowHeader
				number={rowNumber}
				eyebrow={t('chain-eyebrow')}
				title={t('chain-title')}
				titleContinuation={t('chain-title-continuation')}
				raised
			/>
			<div className="grid grid-cols-1 gap-px bg-(--publy-rule) md:grid-cols-3">
				{CHAIN_STEPS.map((step, index) => (
					<ChainStepArticle key={step.id} step={step} index={index} />
				))}
			</div>
		</div>
	);
};
