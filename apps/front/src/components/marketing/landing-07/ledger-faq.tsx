import { IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

import { LedgerRowHeader } from './ledger-row-header';
import { useLedgerReveal } from './use-ledger-reveal';

type FaqEntry = {
	id: string;
	questionI18nKey: string;
	answerI18nKey: string;
};

const FAQ_ENTRIES: readonly FaqEntry[] = [
	{ id: '0', questionI18nKey: 'faq-0-question', answerI18nKey: 'faq-0-answer' },
	{ id: '1', questionI18nKey: 'faq-1-question', answerI18nKey: 'faq-1-answer' },
	{ id: '2', questionI18nKey: 'faq-2-question', answerI18nKey: 'faq-2-answer' },
	{ id: '3', questionI18nKey: 'faq-3-question', answerI18nKey: 'faq-3-answer' },
];

/**
 * One FAQ item. Its own component (rather than inlined in the `.map()`
 * below) because it calls the reveal hook — a hook call inside a `.map()`
 * callback is a rules-of-hooks violation.
 */
const FaqEntryItem = ({
	entry,
	index,
	isOpen,
	onToggle,
}: {
	entry: FaqEntry;
	index: number;
	isOpen: boolean;
	onToggle: () => void;
}) => {
	const { t } = useTranslation('landing-07');
	const reveal = useLedgerReveal<HTMLDivElement>(index);

	return (
		<div {...reveal} className="bg-(--publy-surface-raised) px-1 md:px-2">
			<h3>
				<button
					type="button"
					aria-expanded={isOpen}
					aria-controls={`faq-panel-${entry.id}`}
					id={`faq-trigger-${entry.id}`}
					onClick={onToggle}
					className="flex w-full items-center justify-between gap-4 py-5 pr-4 pl-0 text-start text-[16px]/[26px] font-medium text-(--publy-foreground)"
				>
					{t(entry.questionI18nKey)}
					<IconChevronDown
						aria-hidden="true"
						className={cn(
							'size-5 shrink-0 text-(--publy-foreground-muted) transition-transform duration-300 ease-in-out',
							isOpen && 'rotate-180',
						)}
					/>
				</button>
			</h3>
			<div
				id={`faq-panel-${entry.id}`}
				role="region"
				aria-labelledby={`faq-trigger-${entry.id}`}
				data-open={isOpen}
				className="ld07-accordion-panel"
			>
				<div className="overflow-hidden">
					<div className="ld07-accordion-content pb-6">
						<p className="ld07-body-small max-w-[62ch] text-(--publy-foreground-secondary)">
							{t(entry.answerI18nKey)}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

/**
 * Row 11 — Questions (PROMPT.md §4 Row 11, `todesktop-33`). Ground: raised.
 * Two columns at `sm`+, one below; items are rows of a `gap-px` grid rather
 * than rounded cards, reusing the accordion CSS pair built for Row 04's
 * mobile tour (`.ld07-accordion-panel` / `.ld07-accordion-content`) — the
 * same timing triple covers both accordions with one set of numbers, and its
 * `@media (scripting: none)` fallback already forces every panel open, so
 * this FAQ needs no separate no-JS rule.
 *
 * Multiple items may be open at once — a reader comparing two answers should
 * not have to lose one, so this deliberately does not build an exclusive
 * accordion.
 *
 * Empty-slot reading: no slot.
 */
export const LedgerFaq = ({ rowNumber }: { rowNumber: string }) => {
	const { t } = useTranslation('landing-07');
	const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

	const toggle = (id: string) => {
		setOpenIds((current) => {
			const next = new Set(current);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	return (
		<div>
			<LedgerRowHeader
				number={rowNumber}
				eyebrow={t('faq-eyebrow')}
				title={t('faq-title')}
				raised
			/>
			<div className="grid grid-cols-1 gap-px bg-(--publy-rule) sm:grid-cols-2">
				{FAQ_ENTRIES.map((entry, index) => (
					<FaqEntryItem
						key={entry.id}
						entry={entry}
						index={index}
						isOpen={openIds.has(entry.id)}
						onToggle={() => toggle(entry.id)}
					/>
				))}
			</div>
		</div>
	);
};
