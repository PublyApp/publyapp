import { useTranslation } from 'react-i18next';

import { useLedgerReveal } from './use-ledger-reveal';

/**
 * Row 03 — The statement (PROMPT.md §4 Row 03, `padyna-19`). Two paragraphs
 * of set prose — problem, then answer — instead of a three-column feature
 * grid. Emphasis is carried by `<strong>` at weight 600 in
 * `--publy-foreground`, doing the scanning work a bullet list would
 * otherwise do, while keeping a human voice. Each paragraph is three i18n
 * fragments (lead / emphasis / tail) concatenated inline rather than a
 * `<Trans>` interpolation, so French can move the emphasis where French
 * wants it.
 *
 * Empty-slot reading: no slot. A section that is only text between two
 * full-width rules doesn't read as missing an image — it reads as a
 * statement.
 */
export const LedgerStatement = () => {
	const { t } = useTranslation('landing-07');
	const problemReveal = useLedgerReveal<HTMLParagraphElement>(0);
	const answerReveal = useLedgerReveal<HTMLParagraphElement>(1);

	return (
		<div>
			<h2 className="publy-type-eyebrow mb-6 text-(--publy-foreground-muted) md:mb-8">
				{t('statement-eyebrow')}
			</h2>
			<div className="flex flex-col gap-8">
				<p
					{...problemReveal}
					className="ld07-statement-text max-w-[62ch] text-pretty text-(--publy-foreground-secondary)"
				>
					{t('statement-problem-lead')}{' '}
					<strong className="font-semibold text-(--publy-foreground)">
						{t('statement-problem-emphasis')}
					</strong>{' '}
					{t('statement-problem-tail')}
				</p>
				<p
					{...answerReveal}
					className="ld07-statement-text max-w-[62ch] text-pretty text-(--publy-foreground-secondary)"
				>
					{t('statement-answer-lead')}{' '}
					<strong className="font-semibold text-(--publy-foreground)">
						{t('statement-answer-emphasis')}
					</strong>{' '}
					{t('statement-answer-tail')}
				</p>
			</div>
		</div>
	);
};
