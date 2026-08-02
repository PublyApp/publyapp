import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';

/**
 * §5 — who it is for (attio-15's `gap-px` hairline grid, reused rather than
 * a second one). The lead cell carries the page's second image strategy
 * (todesktop-36): the copy column has its own max-width and never reacts to
 * the pane beside it, so deleting the slot leaves a clean, left-aligned cell
 * with nothing missing — below `lg` the pane does not render at all.
 */
const AUDIENCE_CELLS = [
	'role-access',
	'teams-agencies',
	'inhouse-operations',
	'small-studios',
] as const;

// Documentation only, never rendered — kept as its own reference (not an
// inline JSX literal) for the same reason `landing-05-tour-tabs.ts` stores
// `slotSubject` on the data table instead of inlining it: a full-sentence
// English literal sitting directly in a JSX attribute reads as unescaped
// copy to the i18n-key-coverage sweep, regardless of the attribute's name.
const SHARED_QUEUE_SLOT_SUBJECT =
	'A shared draft queue moving through review stages';

export const Landing05AAudience = () => {
	const { t } = useTranslation('landing-05-a');

	return (
		<div className="publy-marketing-hairline-grid publy-l05a-section-body grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
			<article className="relative overflow-hidden p-8 lg:col-span-2 lg:py-12 lg:pl-12">
				<div className="lg:max-w-[440px]">
					<h3 className="publy-type-sky-display-3 publy-l05a-optical-flush text-balance text-(--publy-foreground)">
						{t('landing-bento-shared-queue-title')}
					</h3>
					<p className="publy-type-sky-body mt-3 max-w-[46ch] text-(--publy-foreground-secondary)">
						{t('landing-bento-shared-queue-body')}
					</p>
				</div>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 right-0 hidden lg:flex lg:w-[420px] lg:items-center lg:justify-center"
				>
					<MarketingImageSlot
						slot="audience-shared-queue"
						subject={SHARED_QUEUE_SLOT_SUBJECT}
						ratio="7 / 5"
						alt={t('landing-slot-alt-audience-shared-queue')}
						className="w-full"
					/>
				</div>
			</article>
			{AUDIENCE_CELLS.map((key) => (
				<article key={key} className="p-8">
					<h3 className="publy-type-sky-display-3 publy-l05a-optical-flush text-balance text-(--publy-foreground)">
						{t(`landing-bento-${key}-title`)}
					</h3>
					<p className="publy-type-sky-body mt-3 max-w-[46ch] text-(--publy-foreground-secondary)">
						{t(`landing-bento-${key}-body`)}
					</p>
				</article>
			))}
		</div>
	);
};
