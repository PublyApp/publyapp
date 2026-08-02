import { useTranslation } from 'react-i18next';

/**
 * The footer frame (subtask 1 of 5 — see .dump/report-t1.md). Brand mark and
 * a copyright line only; the two-tone column layout PROMPT.md §12.4
 * specifies (faint group headings, loud links) lands with the section
 * content in a later subtask, once there are real destinations to link to.
 */
export const LandingFooter = () => {
	const { t } = useTranslation('landing-06');

	return (
		<footer
			data-testid="landing-06-footer"
			className="mt-auto border-t border-(--publy-border)"
		>
			<div className="mx-auto flex w-full max-w-(--publy-container-reading) flex-wrap items-center justify-between gap-4 px-4 py-10 sm:px-6">
				<div className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className="grid size-6 shrink-0 place-items-center rounded-[var(--publy-radius-chip)] bg-primary text-[12.5px] font-semibold text-primary-foreground"
					>
						P
					</span>
					<span className="text-[15.5px] font-semibold tracking-[-0.02em] text-foreground">
						PublyApp
					</span>
				</div>
				<p className="publy-landing-06-type-small text-(--publy-foreground-muted)">
					{t('landing-06-footer-copyright', { year: new Date().getFullYear() })}
				</p>
			</div>
		</footer>
	);
};
