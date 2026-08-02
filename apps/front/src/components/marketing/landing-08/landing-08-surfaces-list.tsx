import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';
import { cn } from '~/lib/utils';

type SurfaceEntry = {
	id: 'calendar' | 'composer' | 'approvals' | 'profiles' | 'dashboards';
	labelKey: string;
	titleKey: string;
	descriptionKey: string;
	slotId: string;
	slotSubject: string;
};

const SURFACE_ENTRIES: SurfaceEntry[] = [
	{
		id: 'calendar',
		labelKey: 'landing-tour-tab-calendar-label',
		titleKey: 'landing-tour-tab-calendar-title',
		descriptionKey: 'landing-tour-tab-calendar-description',
		slotId: 'surface-calendar',
		slotSubject:
			'The cross-profile week calendar, wide crop — one week row across four profiles',
	},
	{
		id: 'composer',
		labelKey: 'landing-tour-tab-composer-label',
		titleKey: 'landing-tour-tab-composer-title',
		descriptionKey: 'landing-tour-tab-composer-description',
		slotId: 'surface-composer',
		slotSubject: 'One draft with its per-channel variants side by side',
	},
	{
		id: 'approvals',
		labelKey: 'landing-tour-tab-approvals-label',
		titleKey: 'landing-tour-tab-approvals-title',
		descriptionKey: 'landing-tour-tab-approvals-description',
		slotId: 'surface-approvals',
		slotSubject: 'A post at the approval step, showing who may publish',
	},
	{
		id: 'profiles',
		labelKey: 'landing-tour-tab-profiles-label',
		titleKey: 'landing-tour-tab-profiles-title',
		descriptionKey: 'landing-tour-tab-profiles-description',
		slotId: 'surface-profiles',
		slotSubject: 'The profiles list with per-profile membership',
	},
	{
		id: 'dashboards',
		labelKey: 'landing-tour-tab-dashboards-label',
		titleKey: 'landing-tour-tab-dashboards-title',
		descriptionKey: 'landing-tour-tab-dashboards-description',
		slotId: 'surface-dashboards',
		slotSubject: 'The weekly cross-profile summary',
	},
];

/**
 * The five product surfaces as a plain, always-open ruled list — not a tab
 * strip and not an accordion. Zero JavaScript, zero interactive state: a
 * screen reader or a crawler gets all five before hydration.
 *
 * Text alternates left/right/left/right/left across a 12-column grid at `lg`
 * and up (a constant row height with an alternating column swap is the
 * cheapest way to get rhythm without a grid system). Below `lg` every row is
 * a single column and the slot renders nothing at all — no box, no reserved
 * height, no gap; nothing indicates an image is missing because nothing was
 * reserved.
 *
 * The slot is sized to the text block, not the text to the slot: a 16:9 slot
 * at the 540px column width measures 304px, close to the text column's own
 * ~268px natural height, so the empty half of the row reads as a margin
 * rather than a hole. That inversion is deliberately the opposite of the
 * `mt-431`-style reservation this direction rejects.
 */
export const Landing08SurfacesList = () => {
	const { t } = useTranslation('landing-08');

	return (
		<ol className="mt-12 flex flex-col">
			{SURFACE_ENTRIES.map((entry, index) => {
				const textFirst = index % 2 === 0;

				return (
					<li
						key={entry.id}
						className="border-t border-(--publy-border) pt-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6"
					>
						<div
							className={
								textFirst
									? 'lg:col-span-5 lg:col-start-1'
									: 'lg:col-span-5 lg:col-start-8'
							}
						>
							<div className="flex items-center gap-2">
								<span className="publy-type-mono">
									{String(index + 1).padStart(2, '0')}
								</span>
								<span className="publy-type-mono text-(--publy-foreground)">
									{t(entry.labelKey)}
								</span>
							</div>
							<h3 className="publy-type-subtitle mt-3">{t(entry.titleKey)}</h3>
							<p className="publy-type-copy mt-4">{t(entry.descriptionKey)}</p>
						</div>
						<MarketingImageSlot
							slot={entry.slotId}
							subject={entry.slotSubject}
							ratio="16 / 9"
							className={cn(
								'hidden w-full lg:block',
								textFirst
									? 'lg:col-span-6 lg:col-start-7'
									: 'lg:col-span-6 lg:col-start-1',
							)}
						/>
					</li>
				);
			})}
		</ol>
	);
};
