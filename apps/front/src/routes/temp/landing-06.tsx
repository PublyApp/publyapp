import { createFileRoute } from '@tanstack/react-router';
import { LandingFooter } from '~/components/marketing/landing-06/landing-footer';
import { LandingHeader } from '~/components/marketing/landing-06/landing-header';
import { LandingPageWash } from '~/components/marketing/landing-06/landing-page-wash';
import {
	LandingTierSection,
	type LandingTierSectionProps,
} from '~/components/marketing/landing-06/landing-tier-section';

export const Route = createFileRoute('/temp/landing-06')({
	component: LandingExploration06,
	staticData: { i18nNamespaces: ['landing-06'], crumbs: 'shell' },
});

/**
 * The census this subtask scaffolds (PROMPT.md §3.1/§4–§12). Every entry
 * inherits a single density tier from `landing-06.css`'s `[data-tier]`
 * ladder; `overlap` pulls a section up by its own top padding (todesktop-20)
 * so tier changes happen inside a continuous surface, never at a seam. The
 * closing CTA deliberately breaks back to D1 — the one backward step on the
 * page — and does not overlap, so the frame visibly releases.
 *
 * Sections render empty here: heading copy, decks, ornaments and imagery
 * slots land in the subtasks that follow (see .dump/report-t1.md).
 */
const SECTIONS: readonly Omit<LandingTierSectionProps, 'children'>[] = [
	{ id: 'hero', testId: 'landing-06-section-hero', tier: 'd0', anchor: false },
	{
		id: 'capabilities',
		testId: 'landing-06-section-capabilities',
		tier: 'd1',
		overlap: true,
	},
	{ id: 'tour', testId: 'landing-06-section-tour', tier: 'd1' },
	{
		id: 'differentiators',
		testId: 'landing-06-section-differentiators',
		tier: 'd2',
		band: 'inverted',
		overlap: true,
	},
	{ id: 'who', testId: 'landing-06-section-who', tier: 'd2' },
	{
		id: 'timeline',
		testId: 'landing-06-section-timeline',
		tier: 'd3',
		overlap: true,
	},
	{ id: 'pricing', testId: 'landing-06-section-pricing', tier: 'd3' },
	{ id: 'faq', testId: 'landing-06-section-faq', tier: 'd4', overlap: true },
	{ id: 'closing-cta', testId: 'landing-06-section-closing-cta', tier: 'd1' },
];

function LandingExploration06() {
	return (
		<div
			data-testid="landing-06-page"
			className="publy-landing-06 flex min-h-dvh flex-col"
		>
			<LandingHeader />
			{/* The header goes `fixed` once condensed and leaves the flow; this
			    spacer reserves the space it occupied while `sticky`, so nothing
			    below jumps at the threshold (§2.2). */}
			<div aria-hidden="true" className="h-(--publy-header-height)" />
			<main
				id="landing-06-main"
				className="relative isolate flex-1 overflow-x-clip"
			>
				<LandingPageWash />
				{SECTIONS.map((section) => (
					<LandingTierSection key={section.id} {...section} />
				))}
			</main>
			<LandingFooter />
		</div>
	);
}
