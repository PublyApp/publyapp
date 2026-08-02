import {
	IconCalendar,
	IconLayoutDashboard,
	IconPencil,
	IconShieldCheck,
	IconUsersGroup,
	type Icon,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';
import { cn } from '~/lib/utils';

import { useTourRailActiveIndex } from './use-tour-rail-active-index';

// Keep in sync with `--publy-landing-06-rail-item-h` in landing-06.css — the
// the indicator translateY is index times this, not a measured offset.
const RAIL_ITEM_HEIGHT_PX = 40;

const SCENES: readonly {
	id: string;
	icon: Icon;
	subject: string;
}[] = [
	{
		id: 'tour-calendar',
		icon: IconCalendar,
		subject: 'Month view, one region filter applied',
	},
	{
		id: 'tour-composer',
		icon: IconPencil,
		subject: 'Composer with the per-channel variant tabs open',
	},
	{
		id: 'tour-approvals',
		icon: IconShieldCheck,
		subject: 'An approval queue row mid-review, permissions visible',
	},
	{
		id: 'tour-profiles',
		icon: IconUsersGroup,
		subject: 'Profile list with membership counts',
	},
	{
		id: 'tour-dashboards',
		icon: IconLayoutDashboard,
		subject: 'Weekly cross-profile summary',
	},
];

const SCENE_IDS = SCENES.map((scene) => scene.id);

const scenePrefix = (sceneId: string) => sceneId.replace('tour-', '');

/**
 * The product tour (PROMPT.md §6): a sticky, indicator-driven rail over five
 * stacked scenes — one per live product surface (calendar, composer,
 * approvals, profiles, dashboards). Scroll is the only advance mechanism;
 * there is no auto-advancing carousel (§6.1 rules that out explicitly).
 * Empty, each scene is a real heading, a real paragraph and a 460px framed
 * interval — five equal beats read as a series, not five failures (§6.4).
 */
export const LandingProductTour = () => {
	const { t } = useTranslation('landing-06');
	const activeIndex = useTourRailActiveIndex(SCENE_IDS);

	return (
		<div className="lg:grid lg:grid-cols-24 lg:gap-(--publy-landing-06-tier-gutter)">
			<div className="lg:col-[1/8]">
				<div className="lg:sticky lg:top-[calc(var(--publy-landing-06-header-height-condensed)+32px)]">
					<p className="publy-landing-06-eyebrow-mono">
						{t('landing-06-tour-eyebrow')}
					</p>
					<h2 className="publy-landing-06-type-display-2 mt-3 text-balance">
						<span className="text-(--publy-foreground)">
							{t('landing-06-tour-title-claim')}
						</span>{' '}
						<span className="text-(--publy-foreground-muted)">
							{t('landing-06-tour-title-elaboration')}
						</span>
					</h2>
					<p className="publy-landing-06-type-deck mt-3 text-(--publy-foreground-secondary)">
						{t('landing-06-tour-description')}
					</p>
					<nav
						aria-label={t('landing-06-tour-rail-aria')}
						className="relative mt-8 flex flex-col pl-4"
					>
						<span
							aria-hidden="true"
							className="publy-landing-06-tour-rail-indicator"
							style={{
								transform: `translateY(${activeIndex * RAIL_ITEM_HEIGHT_PX}px)`,
							}}
						/>
						{SCENES.map((scene, index) => (
							<Link
								key={scene.id}
								to="/temp/landing-06"
								hash={scene.id}
								aria-current={activeIndex === index ? 'location' : undefined}
								className={cn(
									'publy-landing-06-tour-rail-link publy-landing-06-interactive publy-landing-06-type-small-label no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring',
									activeIndex === index
										? 'text-(--publy-foreground)'
										: 'text-(--publy-foreground-muted) hover:text-(--publy-foreground-secondary)',
								)}
							>
								{t(`landing-06-tour-${scenePrefix(scene.id)}-label`)}
							</Link>
						))}
					</nav>
				</div>
			</div>
			<div className="mt-14 flex flex-col gap-16 lg:col-[10/-1] lg:mt-0 lg:gap-24">
				{SCENES.map((scene) => {
					const SceneIcon = scene.icon;
					const prefix = scenePrefix(scene.id);
					return (
						<article
							key={scene.id}
							id={scene.id}
							className="publy-marketing-anchor"
						>
							<SceneIcon
								aria-hidden="true"
								className="size-[18px] text-(--publy-marketing-eyebrow-accent)"
							/>
							<h3 className="publy-landing-06-type-display-4 mt-3">
								{t(`landing-06-tour-${prefix}-title`)}
							</h3>
							<p className="publy-landing-06-type-body mt-2 max-w-[54ch] text-(--publy-foreground-secondary)">
								{t(`landing-06-tour-${prefix}-description`)}
							</p>
							<div className="publy-landing-06-frame mt-6">
								<div className="publy-landing-06-frame-inner publy-landing-06-inset-hairline">
									<MarketingImageSlot
										slot={scene.id}
										subject={scene.subject}
										ratio="16 / 10"
										alt={`landing-06-tour-${prefix}-image-alt`}
										className="publy-landing-06-slot-16-10 publy-landing-06-slot-tier-d1"
									/>
								</div>
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
};
