import { useTranslation } from 'react-i18next';

import { useLedgerReveal } from './use-ledger-reveal';

type IndexEntry = {
	rowNumber: string;
	// Deliberately not `labelKey`: the i18n coverage guard special-cases that
	// exact property name to always resolve against the 'common' namespace
	// (it exists for app-shell.tsx's breadcrumb declarations), which would
	// misfile every key below as `common:index-0N-label` instead of this
	// namespace. See src/lib/i18n-key-coverage.test.ts's
	// `extractLabelKeyPropertyUsages`.
	i18nKey: string;
};

// Six cells, in document order, pointing at the rows that earn a table-of-
// contents entry (PROMPT.md §4 Row 02). Row numbers are literal here — they
// are anchor targets (`#row-0N`), not the census's computed numbers — because
// this is the one row that names *other* rows rather than itself.
const INDEX_ENTRIES: readonly IndexEntry[] = [
	{ rowNumber: '03', i18nKey: 'index-03-label' },
	{ rowNumber: '04', i18nKey: 'index-04-label' },
	{ rowNumber: '05', i18nKey: 'index-05-label' },
	{ rowNumber: '06', i18nKey: 'index-06-label' },
	{ rowNumber: '10', i18nKey: 'index-10-label' },
	{ rowNumber: '11', i18nKey: 'index-11-label' },
];

/**
 * One table-of-contents cell. Its own component (rather than inlined in the
 * `.map()` below) because it calls the reveal hook — a hook call inside a
 * `.map()` callback is a rules-of-hooks violation, since it isn't a fixed
 * position within one component's render.
 */
const IndexCell = ({ entry, index }: { entry: IndexEntry; index: number }) => {
	const { t } = useTranslation('landing-07');
	const reveal = useLedgerReveal<HTMLAnchorElement>(index);

	return (
		<a
			{...reveal}
			href={`#row-${entry.rowNumber}`}
			className="group relative flex min-h-[84px] flex-col justify-center gap-1.5 bg-(--publy-surface-raised) px-4 py-5 no-underline before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:origin-top before:scale-y-0 before:bg-(--publy-primary) before:transition-transform before:duration-300 before:ease-(--publy-motion-ease) before:content-[''] hover:before:scale-y-100 hover:before:duration-50 focus-visible:before:scale-y-100 focus-visible:before:duration-50"
		>
			{/* Real, visible link content (not aria-hidden, unlike every other
			    row's decorative number, §8's stated exception) — so it must clear
			    the 4.5:1 small-text floor itself. --publy-foreground-subtle only
			    reaches ~2.5:1 on this raised ground; -muted clears ~4.6:1/6.4:1
			    (light/dark), verified in .dump/report-t4.md. */}
			<span className="ld07-row-number text-(--publy-foreground-muted)">
				{entry.rowNumber}
			</span>
			<span className="text-[14px]/[22px] font-medium tracking-(--publy-tracking-text) text-(--publy-foreground)">
				{t(entry.i18nKey)}
			</span>
		</a>
	);
};

/**
 * Row 02 — The index (PROMPT.md §4 Row 02). A table of contents for the page
 * itself, replacing the invented logo wall and the invented rating: a beta
 * product has no borrowed trust to show, but it does have real structure, and
 * showing the reader that structure costs nothing and asserts nothing untrue.
 *
 * Empty-slot reading: no slot. Text and rules only.
 */
export const LedgerIndex = () => {
	const { t } = useTranslation('landing-07');

	return (
		<div>
			<h2 className="publy-type-eyebrow mb-6 text-(--publy-foreground-secondary) md:mb-8">
				{t('index-eyebrow')}
			</h2>
			<nav
				aria-label={t('index-aria')}
				className="grid grid-cols-2 gap-px bg-(--publy-rule) sm:grid-cols-3 lg:grid-cols-6"
			>
				{INDEX_ENTRIES.map((entry, index) => (
					<IndexCell key={entry.rowNumber} entry={entry} index={index} />
				))}
			</nav>
		</div>
	);
};
