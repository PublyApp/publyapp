import {
	IconArrowRight,
	IconCalendar,
	IconChevronRight,
	IconFileDescription,
	IconLayoutDashboard,
	IconPencil,
	IconShieldCheck,
	IconStack2,
	IconUsers,
	IconUsersGroup,
	IconSparkles,
	IconBuilding,
} from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TabId = 'calendar' | 'composer' | 'approvals' | 'profiles' | 'dashboards';

type TourTab = {
	id: TabId;
	labelKey: string;
	titleKey: string;
	descriptionKey: string;
	icon: ReactElement;
};

type TrialStep = {
	titleKey: string;
	labelKey: string;
	descriptionKey: string;
};

type ClaimCard = {
	key: string;
	valueKey: string;
	icon: ReactElement;
};

type BentoCard = {
	key: string;
	watermark: ReactElement;
};

type FaqItem = {
	questionKey: string;
	answerKey: string;
};

const TOUR_TABS: readonly TourTab[] = [
	{
		id: 'calendar',
		labelKey: 'landing-tour-tab-calendar-label',
		titleKey: 'landing-tour-tab-calendar-title',
		descriptionKey: 'landing-tour-tab-calendar-description',
		icon: <IconCalendar className="size-4" />,
	},
	{
		id: 'composer',
		labelKey: 'landing-tour-tab-composer-label',
		titleKey: 'landing-tour-tab-composer-title',
		descriptionKey: 'landing-tour-tab-composer-description',
		icon: <IconPencil className="size-4" />,
	},
	{
		id: 'approvals',
		labelKey: 'landing-tour-tab-approvals-label',
		titleKey: 'landing-tour-tab-approvals-title',
		descriptionKey: 'landing-tour-tab-approvals-description',
		icon: <IconShieldCheck className="size-4" />,
	},
	{
		id: 'profiles',
		labelKey: 'landing-tour-tab-profiles-label',
		titleKey: 'landing-tour-tab-profiles-title',
		descriptionKey: 'landing-tour-tab-profiles-description',
		icon: <IconUsersGroup className="size-4" />,
	},
	{
		id: 'dashboards',
		labelKey: 'landing-tour-tab-dashboards-label',
		titleKey: 'landing-tour-tab-dashboards-title',
		descriptionKey: 'landing-tour-tab-dashboards-description',
		icon: <IconLayoutDashboard className="size-4" />,
	},
];

const CLAIM_TRIO: readonly ClaimCard[] = [
	{
		key: 'landing-claim-plan',
		valueKey: 'landing-claim-plan-value',
		icon: <IconCalendar className="size-6" />,
	},
	{
		key: 'landing-claim-teamwork',
		valueKey: 'landing-claim-teamwork-value',
		icon: <IconUsers className="size-6" />,
	},
	{
		key: 'landing-claim-traceability',
		valueKey: 'landing-claim-traceability-value',
		icon: <IconFileDescription className="size-6" />,
	},
];

const BENTO_TILES: readonly BentoCard[] = [
	{
		key: 'landing-bento-shared-queue',
		watermark: <IconStack2 className="size-[175px]" />,
	},
	{
		key: 'landing-bento-role-access',
		watermark: <IconShieldCheck className="size-[175px]" />,
	},
	{
		key: 'landing-bento-teams-agencies',
		watermark: <IconBuilding className="size-[175px]" />,
	},
	{
		key: 'landing-bento-inhouse-operations',
		watermark: <IconUsers className="size-[175px]" />,
	},
	{
		key: 'landing-bento-small-studios',
		watermark: <IconSparkles className="size-[175px]" />,
	},
];

const TRIAL_STEPS: readonly TrialStep[] = [
	{
		titleKey: 'landing-trial-today-title',
		labelKey: 'landing-trial-today-label',
		descriptionKey: 'landing-trial-today-description',
	},
	{
		titleKey: 'landing-trial-day-3-title',
		labelKey: 'landing-trial-day-3-label',
		descriptionKey: 'landing-trial-day-3-description',
	},
	{
		titleKey: 'landing-trial-day-10-title',
		labelKey: 'landing-trial-day-10-label',
		descriptionKey: 'landing-trial-day-10-description',
	},
];

const FAQ_ITEMS: readonly FaqItem[] = [
	{
		questionKey: 'landing-faq-0-question',
		answerKey: 'landing-faq-0-answer',
	},
	{
		questionKey: 'landing-faq-1-question',
		answerKey: 'landing-faq-1-answer',
	},
	{
		questionKey: 'landing-faq-2-question',
		answerKey: 'landing-faq-2-answer',
	},
	{
		questionKey: 'landing-faq-3-question',
		answerKey: 'landing-faq-3-answer',
	},
] as const;

export const IndexRoute = () => {
	const { t } = useTranslation('common');
	const [activeTab, setActiveTab] = useState<TabId>('calendar');
	const activeTabIndex = TOUR_TABS.findIndex((tab) => tab.id === activeTab);

	return (
		<div className="space-y-0">
			<section className="text-center pt-[clamp(52px,9.5cqw,116px)]">
				<div className="mx-auto max-w-[44ch]">
					<p
						className="publy-marketing-eyebrow publy-marketing-fade-up"
						data-stagger="1"
					>
						{t('landing-hero-eyebrow')}
					</p>
					<h1
						className="mt-4 text-[clamp(38px,7.2cqw,72px)] leading-[1.02] tracking-[-0.04em]"
						data-stagger="2"
					>
						{t('landing-hero-title')}
					</h1>
					<p
						className="mx-auto mt-[18px] max-w-[55ch] text-[16px] leading-[1.65] text-(--publy-foreground-secondary)"
						data-stagger="3"
					>
						{t('landing-hero-description')}
					</p>
					<div
						className="mt-9 flex flex-wrap justify-center gap-3"
						data-stagger="4"
					>
						<Link
							to="/signup"
							className="inline-flex h-11 items-center rounded-[var(--publy-radius-control)] bg-(--publy-foreground) px-6 text-sm font-semibold tracking-[0.01em] text-(--publy-background)"
						>
							{t('landing-hero-primary-cta')}
						</Link>
						<a
							href="#product-tour"
							className="inline-flex h-11 items-center rounded-[var(--publy-radius-control)] border border-(--publy-border) px-5 text-sm font-semibold tracking-[0.01em] text-(--publy-foreground)"
						>
							<IconChevronRight className="size-4" />
							{t('landing-hero-secondary-cta')}
						</a>
					</div>
				</div>
			</section>

			<section className="pt-[clamp(34px,6cqw,88px)]">
				<div className="mx-auto w-full rounded-[var(--publy-radius-control)] border border-(--publy-border) bg-(--publy-surface-raised) shadow-[var(--publy-shadow-ring)]">
					<div className="flex h-10 items-center gap-3 border-b border-(--publy-border) px-3.5">
						<div className="flex gap-1.5">
							<span className="size-2 rounded-[var(--publy-radius-circular)] bg-(--publy-border-strong)" />
							<span className="size-2 rounded-[var(--publy-radius-circular)] bg-(--publy-border-strong)" />
							<span className="size-2 rounded-[var(--publy-radius-circular)] bg-(--publy-border-strong)" />
						</div>
						<div className="mx-auto flex flex-1 justify-center">
							<div className="inline-flex h-6 min-w-[min(220px,55%)] items-center justify-center rounded-[var(--publy-radius-small-control)] border border-(--publy-border) bg-(--publy-background) px-3 text-[11px] leading-none text-(--publy-foreground-muted)">
								{t('landing-hero-frame-url')}
							</div>
						</div>
						<div className="size-9 shrink-0" />
					</div>
					<div className="aspect-[16/9] bg-(--publy-row-border)" />
				</div>
			</section>

			<section className="pt-[clamp(70px,9.5cqw,150px)]">
				<div className="grid gap-[clamp(24px,3.5cqw,56px)] grid-cols-[repeat(auto-fit,minmax(210px,1fr))] text-center">
					{CLAIM_TRIO.map((card) => (
						<article key={card.key} className="publy-marketing-fade-up">
							<div className="mb-3 flex justify-center text-(--publy-primary)">
								{card.icon}
							</div>
							<p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-(--publy-primary)">
								{t(`${card.key}-title`)}
							</p>
							<p className="mt-2 text-[clamp(34px,5.2cqw,57px)] font-semibold leading-tight tracking-[-0.04em] text-(--publy-foreground)">
								{t(card.valueKey)}
							</p>
							<p className="mt-2.5 px-1 text-[15px] leading-[1.65] text-(--publy-foreground-secondary)">
								{t(`${card.key}-details`)}
							</p>
						</article>
					))}
				</div>
			</section>

			<section id="product-tour" className="pt-[clamp(74px,10.5cqw,156px)]">
				<div className="mx-auto max-w-[48ch] text-center">
					<p className="publy-marketing-eyebrow">{t('landing-tour-eyebrow')}</p>
					<h2 className="mt-3 text-[clamp(32px,4.2cqw,52px)] leading-[1.08] tracking-[-0.035em]">
						{t('landing-tour-title')}
					</h2>
					<p className="mx-auto mt-4 max-w-[58ch] text-[16px] leading-[1.68] text-(--publy-foreground-secondary)">
						{t('landing-tour-description')}
					</p>
				</div>
				<div
					className="mt-8 flex flex-wrap items-start justify-center gap-2"
					role="tablist"
					aria-label={t('landing-tour-tablist-aria')}
				>
					{TOUR_TABS.map((tab) => (
						<button
							type="button"
							onClick={() => setActiveTab(tab.id)}
							role="tab"
							aria-selected={activeTab === tab.id}
							aria-controls={`tour-panel-${tab.id}`}
							className={`inline-flex items-center gap-2 rounded-[var(--publy-radius-small-control)] px-4 py-2.5 text-sm font-semibold transition-colors ${
								activeTab === tab.id
									? 'bg-(--publy-foreground) text-(--publy-background)'
									: 'border border-(--publy-border) bg-(--publy-background) text-(--publy-foreground-secondary)'
							}`}
						>
							<span className="text-(--publy-foreground)" aria-hidden="true">
								{tab.icon}
							</span>
							{t(tab.labelKey)}
						</button>
					))}
				</div>
				<div className="mt-8 flex flex-col gap-6 rounded-[var(--publy-radius-control)] lg:flex-row lg:items-start">
					<div className="min-w-0 flex-1">
						{TOUR_TABS.map((tab, index) => (
							<div
								key={tab.id}
								id={`tour-panel-${tab.id}`}
								hidden={activeTabIndex !== index}
								aria-hidden={activeTabIndex !== index}
							>
								<h3 className="text-[clamp(28px,3.4cqw,42px)] leading-[1.12] tracking-[-0.035em]">
									{t(tab.titleKey)}
								</h3>
								<p className="mt-4 max-w-[52ch] text-[16px] leading-[1.68] text-(--publy-foreground-secondary)">
									{t(tab.descriptionKey)}
								</p>
								<a
									href="/signup"
									className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-(--publy-foreground)"
								>
									{t('landing-tour-learn-more')}
									<IconArrowRight className="size-3.5" />
								</a>
							</div>
						))}
					</div>
					<div className="relative min-h-0 min-w-[min(100%,640px)] flex-1 overflow-hidden rounded-[var(--publy-radius-control)] border border-(--publy-border) bg-(--publy-row-border) aspect-[16/10]">
						{TOUR_TABS.map((tab, index) => (
							<div
								key={tab.id}
								className="absolute inset-0 bg-(--publy-row-border)"
								hidden={activeTabIndex !== index}
								aria-hidden={activeTabIndex !== index}
							>
								<span className="sr-only">
									{t(tab.labelKey)} {t('landing-tour-plate-placeholder')}
								</span>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="pt-[clamp(74px,10.5cqw,156px)]">
				<div className="mx-auto max-w-[52ch] text-center">
					<p className="publy-marketing-eyebrow">
						{t('landing-bento-eyebrow')}
					</p>
					<h2 className="mt-3 text-[clamp(32px,4.2cqw,52px)] leading-[1.08] tracking-[-0.035em]">
						{t('landing-bento-title')}
					</h2>
				</div>
				<div className="mt-10 flex flex-col gap-4">
					<div className="flex flex-wrap gap-4">
						{BENTO_TILES.slice(0, 2).map((tile) => (
							<article
								key={tile.key}
								className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[var(--publy-radius-control)] border border-(--publy-border) bg-(--publy-background) p-6"
							>
								<div className="pointer-events-none absolute -right-12 -top-10 text-(--publy-foreground-muted)">
									{tile.watermark}
								</div>
								<h3 className="relative text-[clamp(22px,2.4cqw,30px)] leading-[1.15] font-semibold tracking-[-0.03em] text-(--publy-foreground)">
									{t(`${tile.key}-title`)}
								</h3>
								<p className="relative mt-2.5 max-w-[44ch] text-[15px] leading-[1.65] text-(--publy-foreground-secondary)">
									{t(`${tile.key}-body`)}
								</p>
								<div className="relative z-10 mt-5 rounded-[var(--publy-radius-small-control)] border border-(--publy-border) bg-(--publy-surface-raised) aspect-[16/9]" />
							</article>
						))}
					</div>
					<div className="flex flex-col gap-4 md:flex-row">
						{BENTO_TILES.slice(2, 5).map((tile) => (
							<article
								key={tile.key}
								className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[var(--publy-radius-control)] border border-(--publy-border) bg-(--publy-background) p-6"
							>
								<div className="pointer-events-none absolute -right-12 -top-10 text-(--publy-foreground-muted)">
									{tile.watermark}
								</div>
								<h3 className="relative text-[clamp(22px,2.4cqw,30px)] leading-[1.15] font-semibold tracking-[-0.03em] text-(--publy-foreground)">
									{t(`${tile.key}-title`)}
								</h3>
								<p className="relative mt-2.5 max-w-[44ch] text-[15px] leading-[1.65] text-(--publy-foreground-secondary)">
									{t(`${tile.key}-body`)}
								</p>
								<div className="relative z-10 mt-5 rounded-[var(--publy-radius-small-control)] border border-(--publy-border) bg-(--publy-surface-raised) aspect-[16/9]" />
							</article>
						))}
					</div>
				</div>
			</section>

			<section className="pt-[clamp(74px,10.5cqw,156px)]">
				<div className="mx-auto max-w-[760px] text-center">
					<p className="publy-marketing-eyebrow">
						{t('landing-timeline-eyebrow')}
					</p>
					<h2 className="mt-3 text-[clamp(32px,4.2cqw,52px)] leading-[1.08] tracking-[-0.035em]">
						{t('landing-timeline-title')}
					</h2>
				</div>
				<div className="publy-marketing-hairline-grid mt-8 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
					{TRIAL_STEPS.map((step) => (
						<article key={step.titleKey} className="px-6 py-7 sm:px-8">
							<p className="text-sm font-semibold tracking-[0.01em] text-(--publy-primary)">
								{t(step.labelKey)}
							</p>
							<p className="mt-1 text-[18px] font-semibold leading-tight tracking-[-0.02em] text-(--publy-foreground)">
								{t(step.titleKey)}
							</p>
							<p className="mt-3 text-[15px] leading-[1.65] text-(--publy-foreground-secondary)">
								{t(step.descriptionKey)}
							</p>
						</article>
					))}
				</div>
			</section>

			<section className="pt-[clamp(74px,10.5cqw,156px)]" id="faq">
				<div className="mx-auto max-w-[760px] text-center">
					<p className="publy-marketing-eyebrow">{t('landing-faq-eyebrow')}</p>
					<h2 className="mt-3 text-[clamp(32px,4.2cqw,52px)] leading-[1.08] tracking-[-0.035em]">
						{t('landing-faq-title')}
					</h2>
				</div>
				<div className="mx-auto mt-8 max-w-[760px]">
					{FAQ_ITEMS.map((item, index) => (
						<div
							key={item.questionKey}
							className={`border-t border-(--publy-border) py-6${
								index === FAQ_ITEMS.length - 1 ? ' border-b' : ''
							}`}
						>
							<h3 className="text-[20px] leading-[1.2] font-semibold tracking-[-0.02em] text-(--publy-foreground)">
								{t(item.questionKey)}
							</h3>
							<p className="mt-2 text-[15.5px] leading-[1.7] text-(--publy-foreground-secondary)">
								{t(item.answerKey)}
							</p>
						</div>
					))}
				</div>
			</section>

			<section className="pt-[clamp(74px,10.5cqw,156px)] pb-[clamp(52px,9cqw,124px)]">
				<div className="rounded-[28px] bg-(--publy-foreground) px-[clamp(24px,4cqw,56px)] py-[clamp(42px,8cqw,100px)] text-center">
					<h2 className="mx-auto max-w-[18ch] text-[clamp(34px,5cqw,60px)] leading-[1.07] font-semibold tracking-[-0.035em] text-(--publy-background)">
						{t('landing-closing-title')}
					</h2>
					<p className="mx-auto mt-4 max-w-[54ch] text-[17px] leading-[1.67] text-(--publy-background)">
						{t('landing-closing-description')}
					</p>
					<div className="mt-8 flex flex-wrap justify-center gap-3">
						<Link
							to="/signup"
							className="inline-flex h-[48px] items-center rounded-[var(--publy-radius-control)] bg-(--publy-background) px-6 text-[16px] font-semibold tracking-[0.01em] text-(--publy-foreground)"
						>
							{t('landing-closing-primary-cta')}
						</Link>
						<a
							href="#product-tour"
							className="inline-flex h-[48px] items-center rounded-[var(--publy-radius-control)] border border-(--publy-border) px-6 text-[16px] font-semibold tracking-[0.01em] text-(--publy-background)"
						>
							<IconChevronRight className="size-4" />
							{t('landing-closing-secondary-cta')}
						</a>
					</div>
				</div>
			</section>
		</div>
	);
};

export const Route = createFileRoute('/')({
	staticData: { crumbs: 'shell' },
	component: IndexRoute,
});
