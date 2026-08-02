import { IconChevronRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/**
 * Row 01 — Hero (PROMPT.md §4 Row 01). Typography and two buttons, nothing
 * else — `padyna-02` adopted whole: a beta product with no imagery has a
 * hero that contains nothing it doesn't have. Left-aligned, not centred, so
 * the `<h1>`'s left edge sits on the same vertical as every other row.
 *
 * Empty-slot reading: there is no slot in this row. It is the design.
 */
export const LedgerHero = () => {
	const { t } = useTranslation('landing-07');

	return (
		<div className="flex flex-col items-start">
			<span className="inline-flex h-7 items-center gap-1.5 rounded-[var(--publy-radius-chip)] border border-(--publy-rule) bg-(--publy-primary-soft) pr-2 pl-2.5 text-[13px]/[18px] font-medium text-(--publy-primary-soft-foreground)">
				{t('hero-announcement')}
				<IconChevronRight aria-hidden="true" className="size-3.5" />
			</span>

			<span className="publy-type-eyebrow mt-6 text-(--publy-foreground-muted)">
				{t('hero-eyebrow')}
			</span>

			<h1 className="ld07-display-1 mt-3 max-w-[16ch] text-balance">
				<span className="text-(--publy-foreground)">{t('hero-title')}</span>{' '}
				<span className="text-(--publy-foreground-muted)">
					{t('hero-title-continuation')}
				</span>
			</h1>

			<p className="ld07-lede mt-5 max-w-[58ch] text-pretty text-(--publy-foreground-muted)">
				{t('hero-description')}
			</p>

			<div className="mt-8 flex flex-wrap items-center gap-3">
				<Link
					to="/signup"
					className="inline-flex h-11 items-center rounded-[var(--publy-radius-control)] bg-(--publy-primary) px-5 text-[15px]/[20px] font-semibold tracking-(--publy-tracking-text) text-(--publy-primary-foreground) shadow-[var(--publy-shadow-cta)] no-underline transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px active:shadow-none active:duration-50"
				>
					{t('hero-primary-cta')}
				</Link>
				<a
					href="#row-04"
					className="inline-flex h-11 items-center rounded-[var(--publy-radius-control)] border border-(--publy-rule-strong) bg-transparent px-5 text-[15px]/[20px] font-semibold tracking-(--publy-tracking-text) text-(--publy-foreground) no-underline transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px active:duration-50"
				>
					{t('hero-secondary-cta')}
				</a>
			</div>

			<span className="publy-type-eyebrow mt-5 text-(--publy-foreground-muted)">
				{t('hero-note')}
			</span>
		</div>
	);
};
