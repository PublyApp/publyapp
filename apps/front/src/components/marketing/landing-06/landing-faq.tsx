import { IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

const COLUMNS = [
	['0', '1', '2'],
	['3', '4', '5'],
] as const;

/**
 * FAQ (PROMPT.md §11): the tightest tier on the page — `col-[4/-4]` (960px),
 * display-4 headings, `--publy-border-strong` hairlines. A two-column
 * accordion (`todesktop-33`) using this repo's own `grid-template-rows`
 * disclosure pattern (already used elsewhere in `app.css`) rather than that
 * dossier's measured-height technique, which predates the `fr` trick. The
 * collapsed panel stays `inert` so its (currently absent) focusable content
 * can never be tabbed into while hidden (§15.4) — a `0fr` grid row is still
 * keyboard-reachable otherwise.
 */
export const LandingFaq = () => {
	const { t } = useTranslation('landing-06');
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
			<p className="publy-landing-06-eyebrow-mono">
				{t('landing-06-faq-eyebrow')}
			</p>
			<h2 className="publy-landing-06-type-display-4 mt-3 max-w-[32ch] text-balance">
				<span className="text-(--publy-foreground)">
					{t('landing-06-faq-title-claim')}
				</span>{' '}
				<span className="text-(--publy-foreground-muted)">
					{t('landing-06-faq-title-elaboration')}
				</span>
			</h2>
			<div className="mt-8 flex flex-col gap-0 sm:flex-row sm:gap-4">
				{COLUMNS.map((column, columnIndex) => (
					<div key={columnIndex} className="flex flex-1 flex-col sm:gap-4">
						{column.map((id) => {
							const open = openIds.has(id);
							const buttonId = `landing-06-faq-button-${id}`;
							const panelId = `landing-06-faq-panel-${id}`;
							return (
								<div
									key={id}
									data-open={open ? 'true' : undefined}
									className="publy-landing-06-faq-item overflow-hidden border-x border-t border-(--publy-border-strong) first:rounded-t-[var(--publy-radius-medium-control)] sm:rounded-[var(--publy-radius-medium-control)] sm:border-b"
								>
									<button
										type="button"
										id={buttonId}
										aria-expanded={open}
										aria-controls={panelId}
										onClick={() => toggle(id)}
										className="publy-landing-06-interactive flex w-full cursor-pointer items-start justify-between gap-4 px-5 py-5 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring"
									>
										<span className="publy-landing-06-type-body-label flex-1">
											{t(`landing-06-faq-${id}-question`)}
										</span>
										<IconChevronDown
											aria-hidden="true"
											className="publy-landing-06-faq-chevron mt-0.5 size-[18px] shrink-0"
										/>
									</button>
									<div
										id={panelId}
										role="region"
										aria-labelledby={buttonId}
										inert={!open}
										className="publy-landing-06-faq-panel"
									>
										<div className="publy-landing-06-faq-panel-inner">
											<p
												className={cn(
													'publy-landing-06-faq-answer publy-landing-06-type-body px-5 pb-5 text-(--publy-foreground-secondary)',
												)}
											>
												{t(`landing-06-faq-${id}-answer`)}
											</p>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
};
