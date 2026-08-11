import {
	IconCalendar,
	IconLayoutDashboard,
	IconPencil,
	IconShieldCheck,
	type TablerIcon,
	IconUsersGroup,
} from '@tabler/icons-react';

/**
 * The product window's five surfaces (§2 — todesktop-28 tab strip driving
 * todesktop-29's framed, correctly-sized empty slot). One physical aperture,
 * one tab at a time: `slot`/`slotSubject`/`altKey` back the six-slot register
 * in report-t2.md, not `*_KEYS` — that suffix would pull `slot` into the
 * i18n-key-coverage sweep, and `subject` is documentation, never rendered.
 *
 * THE KEYS ARE NAMESPACE-QUALIFIED, and they have to be. This is a data module
 * with no `useTranslation()` call, so the i18n-key-coverage sweep has nothing
 * to read the namespace from and falls back to `common` — under which these
 * keys do not exist. Qualifying each literal states the namespace where the
 * key is written instead of leaving the sweep to guess it, and `t()` resolves
 * an `ns:key` literal the same way at runtime. (Before the landing page was
 * promoted to `/`, the bare keys resolved by accident: the previous index page
 * lived in `common` and carried keys of the same names.)
 */
export type TourTabId =
	| 'calendar'
	| 'composer'
	| 'approvals'
	| 'profiles'
	| 'dashboards';

export type TourTab = {
	id: TourTabId;
	Icon: TablerIcon;
	labelKey: string;
	titleKey: string;
	descriptionKey: string;
	slot: string;
	slotSubject: string;
	altKey: string;
};

export const TOUR_TABS: readonly TourTab[] = [
	{
		id: 'calendar',
		Icon: IconCalendar,
		labelKey: 'landing:landing-tour-tab-calendar-label',
		titleKey: 'landing:landing-tour-tab-calendar-title',
		descriptionKey: 'landing:landing-tour-tab-calendar-description',
		slot: 'tour-calendar',
		slotSubject: 'One week across several brand profiles, one timeline',
		altKey: 'landing:landing-slot-alt-tour-calendar',
	},
	{
		id: 'composer',
		Icon: IconPencil,
		labelKey: 'landing:landing-tour-tab-composer-label',
		titleKey: 'landing:landing-tour-tab-composer-title',
		descriptionKey: 'landing:landing-tour-tab-composer-description',
		slot: 'tour-composer',
		slotSubject: 'One draft, two channel variants side by side',
		altKey: 'landing:landing-slot-alt-tour-composer',
	},
	{
		id: 'approvals',
		Icon: IconShieldCheck,
		labelKey: 'landing:landing-tour-tab-approvals-label',
		titleKey: 'landing:landing-tour-tab-approvals-title',
		descriptionKey: 'landing:landing-tour-tab-approvals-description',
		slot: 'tour-approvals',
		slotSubject: 'An approval queue with one post awaiting sign-off',
		altKey: 'landing:landing-slot-alt-tour-approvals',
	},
	{
		id: 'profiles',
		Icon: IconUsersGroup,
		labelKey: 'landing:landing-tour-tab-profiles-label',
		titleKey: 'landing:landing-tour-tab-profiles-title',
		descriptionKey: 'landing:landing-tour-tab-profiles-description',
		slot: 'tour-profiles',
		slotSubject: 'A profile list with membership and per-profile permissions',
		altKey: 'landing:landing-slot-alt-tour-profiles',
	},
	{
		id: 'dashboards',
		Icon: IconLayoutDashboard,
		labelKey: 'landing:landing-tour-tab-dashboards-label',
		titleKey: 'landing:landing-tour-tab-dashboards-title',
		descriptionKey: 'landing:landing-tour-tab-dashboards-description',
		slot: 'tour-dashboards',
		slotSubject: 'The weekly cross-profile summary',
		altKey: 'landing:landing-slot-alt-tour-dashboards',
	},
] as const;
