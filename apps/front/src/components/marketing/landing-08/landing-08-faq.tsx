import { IconChevronDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

type FaqItem = {
	id: '0' | '1' | '2' | '3';
	questionKey: string;
	answerKey: string;
};

const FAQ_ITEMS: readonly FaqItem[] = [
	{
		id: '0',
		questionKey: 'landing-faq-0-question',
		answerKey: 'landing-faq-0-answer',
	},
	{
		id: '1',
		questionKey: 'landing-faq-1-question',
		answerKey: 'landing-faq-1-answer',
	},
	{
		id: '2',
		questionKey: 'landing-faq-2-question',
		answerKey: 'landing-faq-2-answer',
	},
	{
		id: '3',
		questionKey: 'landing-faq-3-question',
		answerKey: 'landing-faq-3-answer',
	},
];

/**
 * Objection handling as native `<details>`/`<summary>` disclosures — no
 * React state, no `aria-expanded` bookkeeping, no measured height, so the
 * FAQ is fully operable before hydration and toggles instantly. Two columns
 * at `sm` and up so a four-question FAQ never becomes a scroll; `<details>`
 * without a shared `name` opens independently, which is the intended
 * behaviour.
 */
export const Landing08Faq = () => {
	const { t } = useTranslation('landing-08');

	return (
		<div className="publy-fold-faq mt-12 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
			{FAQ_ITEMS.map((item) => (
				<details
					key={item.id}
					className="border-t border-(--publy-border) py-6"
				>
					<summary className="flex w-full items-start justify-between gap-6 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring">
						<h3 className="publy-type-copy-mark">{t(item.questionKey)}</h3>
						<IconChevronDown
							aria-hidden="true"
							className="mt-0.5 size-5 shrink-0 text-(--publy-foreground-muted)"
						/>
					</summary>
					<p className="publy-type-copy mt-4 max-w-[54ch]">
						{t(item.answerKey)}
					</p>
				</details>
			))}
		</div>
	);
};
