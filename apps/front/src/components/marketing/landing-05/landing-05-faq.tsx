import { IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

const FAQ_ITEMS = ['0', '1', '2', '3'] as const;

/**
 * §8 — FAQ (todesktop-33). A CSS multi-column layout keeps the four items in
 * one DOM order at every breakpoint — below 640 that is a single continuous
 * list, at 640+ the same order flows into two balanced columns — so nothing
 * has to be re-split by hand. Each panel reuses the §2 mobile accordion's
 * `grid-template-rows: 0fr → 1fr` technique instead of a JS-measured
 * `--original-height`: it reaches the same goal the prompt asks for (no
 * `max-height: 9999px` lag on a short answer) without measuring anything,
 * and it is already proven elsewhere on this page. The answer's own
 * opacity + 1px blur reveal is what makes it read as text arriving rather
 * than a box growing. SSR: the first question opens from `useState`'s
 * initial value, so it is present before hydration, same as the tour's
 * default tab.
 */
export const Landing05Faq = () => {
	const { t } = useTranslation('landing-05');
	const [openItem, setOpenItem] = useState<string | null>('0');

	return (
		<div className="mt-8 columns-1 sm:columns-2 sm:gap-4">
			{FAQ_ITEMS.map((item) => {
				const isOpen = item === openItem;
				return (
					<div
						key={item}
						className="break-inside-avoid-column border-x border-t border-(--publy-border) first:rounded-t-[var(--publy-radius-card)] last:border-b sm:mb-4 sm:rounded-[var(--publy-radius-card)] sm:border-b"
					>
						<button
							type="button"
							id={`faq-trigger-${item}`}
							aria-expanded={isOpen}
							aria-controls={`faq-panel-${item}`}
							onClick={() => setOpenItem(isOpen ? null : item)}
							className="publy-l05-pressable flex w-full items-center justify-between gap-3 py-6 pr-4 pl-6 text-start"
						>
							<span className="publy-type-sky-display-4 text-(--publy-foreground)">
								{t(`landing-faq-${item}-question`)}
							</span>
							<IconChevronDown
								aria-hidden="true"
								className={cn(
									'publy-l05-faq-chevron size-6 shrink-0 text-(--publy-foreground-secondary)',
									isOpen && 'rotate-180',
								)}
							/>
						</button>
						<div
							id={`faq-panel-${item}`}
							role="region"
							aria-labelledby={`faq-trigger-${item}`}
							className={cn(
								'publy-l05-faq-panel',
								isOpen && 'publy-l05-faq-panel-open',
							)}
						>
							<div className="publy-l05-faq-panel-inner px-6 pb-6">
								<p className="publy-type-sky-body max-w-[66ch] text-pretty text-(--publy-foreground-secondary)">
									{t(`landing-faq-${item}-answer`)}
								</p>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
};
