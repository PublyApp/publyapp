import { type ReactElement, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
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

type TabId =
	| 'calendar'
	| 'composer'
	| 'approvals'
	| 'profiles'
	| 'dashboards';

type TourTab = {
	id: TabId;
	label: string;
	title: string;
	description: string;
	icon: ReactElement;
};

type TrialStep = {
	title: string;
	label: string;
	description: string;
};

const TOUR_TABS: readonly TourTab[] = [
	{
		id: 'calendar',
		label: 'Calendar',
		title: 'Calendar that follows every brand in one week',
		description:
			'A single timeline gives your team a shared view of planned and queued content, per profile and per region, without opening another tool.',
		icon: <IconCalendar className="size-4" />,
	},
	{
		id: 'composer',
		label: 'Composer',
		title: 'Build one draft, shape one version per audience',
		description:
			'Reuse copy and assets across profiles, then adapt only what changes for a channel or brand voice.',
		icon: <IconPencil className="size-4" />,
	},
	{
		id: 'approvals',
		label: 'Approvals',
		title: 'No silent publishing, no guessing, no surprises',
		description:
			'Approval and publish permissions are clear at every step, so no one can move a post without the right sign-off.',
		icon: <IconShieldCheck className="size-4" />,
	},
	{
		id: 'profiles',
		label: 'Profiles',
		title: 'Profile-level controls for every client account',
		description:
			'Store each account profile once, manage membership and permissions by profile, and keep context clean when teams grow.',
		icon: <IconUsersGroup className="size-4" />,
	},
	{
		id: 'dashboards',
		label: 'Dashboards',
		title: 'See what moved and what is still waiting',
		description:
			'Use a single weekly view or cross-profile summary to review pacing, execution, and pending work at a glance.',
		icon: <IconLayoutDashboard className="size-4" />,
	},
];

const CLAIM_TRIO = [
	{
		title: 'One place to plan',
		value: 'One',
		details: 'calendar to replace profile-by-profile planning',
		icon: <IconCalendar className="size-6" />,
	},
	{
		title: 'Built for teamwork',
		value: 'Four',
		details: 'role-based actions without ad-hoc spreadsheets',
		icon: <IconUsers className="size-6" />,
	},
	{
		title: 'Every action tracked',
		value: 'Every',
		details: 'post keeps draft, approval, and publish traceability',
		icon: <IconFileDescription className="size-6" />,
	},
] as const;

const BENTO_TILES = [
	{
		heading: 'Shared queue',
		body: 'Drafts enter a single workflow and move visibly across review stages. No silent edits from outside the process.',
		watermark: <IconStack2 className="size-[175px]" />,
	},
	{
		heading: 'Role-aware access',
		body: 'Draft, approve, and publish permissions stay scoped by profile and are easy to adjust per team need.',
		watermark: <IconShieldCheck className="size-[175px]" />,
	},
	{
		heading: 'Teams and agencies',
		body: 'Invite colleagues quickly, keep client profiles isolated, and keep context stable across handovers.',
		watermark: <IconBuilding className="size-[175px]" />,
	},
	{
		heading: 'In-house operations',
		body: 'Keep weekly planning close to your core team while still allowing delegated approvals and publishing.',
		watermark: <IconUsers className="size-[175px]" />,
	},
	{
		heading: 'Small studios',
		body: 'Use a lightweight flow before you scale teams or tools, with room to grow into heavier operations.',
		watermark: <IconSparkles className="size-[175px]" />,
	},
];

const TRIAL_STEPS: readonly TrialStep[] = [
	{
		title: 'Today',
		label: 'Set up',
		description: 'Create your first profile and invite your team members.',
	},
	{
		title: 'Day 3',
		label: 'Publish',
		description: 'Start weekly planning with approvals in place and shared queue habits established.',
	},
	{
		title: 'Day 10',
		label: 'Stabilize',
		description: 'Keep the same rhythm with less back-and-forth and cleaner handoffs.',
	},
];

const FAQ_ITEMS = [
	{
		question: 'Can I run this alongside another scheduling tool?',
		answer:
			'Yes. Teams usually run both for a short period while they move workflows. You can keep an external tool connected while shifting teams over profile by profile.',
	},
	{
		question: 'What does onboarding require before I can draft?',
		answer:
			'You need one project team and one profile, then your workflow settings and approvals can be added in the same screen.',
	},
	{
		question: 'How are approvals protected?',
		answer:
			'Approvals are first-class actions in the post lifecycle. Every change keeps context and the history of who approved it.',
	},
	{
		question: 'What support is available if I get stuck?',
		answer:
			'You can start in the app and ask inside the existing support flow from your account settings as soon as your trial is active.',
	},
] as const;

export const IndexRoute = () => {
	const [activeTab, setActiveTab] = useState<TabId>('calendar');
	const activeTabIndex = TOUR_TABS.findIndex((tab) => tab.id === activeTab);

	return (
		<div className="space-y-0">
			<section className="text-center pt-[clamp(52px,9.5cqw,116px)]">
				<div className="mx-auto max-w-[44ch]">
					<p className="publy-marketing-eyebrow publy-marketing-fade-up" data-stagger="1">
						For teams publishing across more than one brand
					</p>
					<h1
						className="mt-4 text-[clamp(38px,7.2cqw,72px)] leading-[1.02] tracking-[-0.04em]"
						data-stagger="2"
					>
						Publish everywhere your brands live
					</h1>
					<p
						className="mx-auto mt-[18px] max-w-[55ch] text-[16px] leading-[1.65] text-(--publy-foreground-secondary)"
						data-stagger="3"
					>
						One calendar for planning, approvals, and publishing across all your profiles. Draft once, route with context, and launch together.
					</p>
					<div className="mt-9 flex flex-wrap justify-center gap-3" data-stagger="4">
						<Link
							to="/signup"
							className="inline-flex h-11 items-center rounded-[var(--publy-radius-control)] bg-(--publy-foreground) px-6 text-sm font-semibold tracking-[0.01em] text-(--publy-background)"
						>
							Start free trial
						</Link>
						<a
							href="#product-tour"
							className="inline-flex h-11 items-center rounded-[var(--publy-radius-control)] border border-(--publy-border) px-5 text-sm font-semibold tracking-[0.01em] text-(--publy-foreground)"
						>
							<IconChevronRight className="size-4" />
							Watch tour
						</a>
					</div>
				</div>
			</section>

			<section className="pt-[clamp(34px,6cqw,88px)]">
				<div className="mx-auto w-full rounded-[var(--publy-radius-control)] border border-(--publy-border) bg-(--publy-surface-raised) shadow-[inset_0_0_0_1px_var(--publy-border),0_8px_24px_-18px_rgba(0,0,0,0.22)]">
					<div className="flex h-10 items-center gap-3 border-b border-(--publy-border) px-3.5">
						<div className="flex gap-1.5">
							<span className="size-2 rounded-full bg-(--publy-border-strong)" />
							<span className="size-2 rounded-full bg-(--publy-border-strong)" />
							<span className="size-2 rounded-full bg-(--publy-border-strong)" />
						</div>
						<div className="mx-auto flex flex-1 justify-center">
							<div className="inline-flex h-6 min-w-[min(220px,55%)] items-center justify-center rounded-[var(--publy-radius-small-control)] border border-(--publy-border) bg-(--publy-background) px-3 text-[11px] leading-none text-(--publy-foreground-muted)">
								app.publy.com / calendar
							</div>
						</div>
						<div className="size-9 shrink-0" />
					</div>
					<div className="aspect-[16/9] bg-[#f1f1f3]" />
				</div>
			</section>

			<section className="pt-[clamp(70px,9.5cqw,150px)]">
				<div className="grid gap-[clamp(24px,3.5cqw,56px)] grid-cols-[repeat(auto-fit,minmax(210px,1fr))] text-center">
					{CLAIM_TRIO.map((card) => (
						<article key={card.title} className="publy-marketing-fade-up">
							<div className="mb-3 flex justify-center text-(--publy-primary)">
								{card.icon}
							</div>
							<p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-(--publy-primary)">
								{card.title}
							</p>
							<p className="mt-2 text-[clamp(34px,5.2cqw,57px)] font-semibold leading-tight tracking-[-0.04em] text-(--publy-foreground)">
								{card.value}
							</p>
							<p className="mt-2.5 px-1 text-[15px] leading-[1.65] text-(--publy-foreground-secondary)">
								{card.details}
							</p>
						</article>
					))}
				</div>
			</section>

			<section id="product-tour" className="pt-[clamp(74px,10.5cqw,156px)]">
				<div className="mx-auto max-w-[48ch] text-center">
					<p className="publy-marketing-eyebrow">Product tour</p>
					<h2 className="mt-3 text-[clamp(32px,4.2cqw,52px)] leading-[1.08] tracking-[-0.035em]">
						Everything your week needs, connected
					</h2>
					<p className="mx-auto mt-4 max-w-[58ch] text-[16px] leading-[1.68] text-(--publy-foreground-secondary)">
						Move from draft to publish with one timeline, one approval flow, and one source of truth.
					</p>
				</div>
				<div
					className="mt-8 flex flex-wrap items-start justify-center gap-2"
					role="tablist"
					aria-label="Product tour tabs"
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
							{tab.label}
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
									{tab.title}
								</h3>
								<p className="mt-4 max-w-[52ch] text-[16px] leading-[1.68] text-(--publy-foreground-secondary)">
									{tab.description}
								</p>
								<a
									href="/signup"
									className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-(--publy-foreground)"
								>
									Learn more
									<IconArrowRight className="size-3.5" />
								</a>
							</div>
						))}
					</div>
					<div className="relative min-h-0 min-w-[min(100%,640px)] flex-1 overflow-hidden rounded-[var(--publy-radius-control)] border border-(--publy-border) bg-(--publy-row-border) aspect-[16/10]">
						{TOUR_TABS.map((tab, index) => (
							<div
								key={tab.id}
								className="absolute inset-0 bg-[#f1f1f3]"
								hidden={activeTabIndex !== index}
								aria-hidden={activeTabIndex !== index}
							>
								<span className="sr-only">{tab.label} screenshot placeholder</span>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="pt-[clamp(74px,10.5cqw,156px)]">
				<div className="mx-auto max-w-[52ch] text-center">
					<p className="publy-marketing-eyebrow">Who it is for</p>
					<h2 className="mt-3 text-[clamp(32px,4.2cqw,52px)] leading-[1.08] tracking-[-0.035em]">
						Built for the work that does not fit in one inbox
					</h2>
				</div>
				<div className="mt-10 flex flex-col gap-4">
					<div className="flex flex-wrap gap-4">
						{BENTO_TILES.slice(0, 2).map((tile) => (
							<article
								key={tile.heading}
								className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[var(--publy-radius-control)] border border-(--publy-border) bg-(--publy-background) p-6"
							>
								<div className="pointer-events-none absolute -right-12 -top-10 text-(--publy-foreground-muted)">
									{tile.watermark}
								</div>
								<h3 className="relative text-[clamp(22px,2.4cqw,30px)] leading-[1.15] font-semibold tracking-[-0.03em] text-(--publy-foreground)">
									{tile.heading}
								</h3>
								<p className="relative mt-2.5 max-w-[44ch] text-[15px] leading-[1.65] text-(--publy-foreground-secondary)">
									{tile.body}
								</p>
								<div className="relative z-10 mt-5 rounded-[var(--publy-radius-small-control)] border border-(--publy-border) bg-(--publy-surface-raised) aspect-[16/9]" />
							</article>
						))}
					</div>
					<div className="flex flex-col gap-4 md:flex-row">
						{BENTO_TILES.slice(2, 5).map((tile) => (
							<article
								key={tile.heading}
								className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[var(--publy-radius-control)] border border-(--publy-border) bg-(--publy-background) p-6"
							>
								<div className="pointer-events-none absolute -right-12 -top-10 text-(--publy-foreground-muted)">
									{tile.watermark}
								</div>
								<h3 className="relative text-[clamp(22px,2.4cqw,30px)] leading-[1.15] font-semibold tracking-[-0.03em] text-(--publy-foreground)">
									{tile.heading}
								</h3>
								<p className="relative mt-2.5 max-w-[44ch] text-[15px] leading-[1.65] text-(--publy-foreground-secondary)">
									{tile.body}
								</p>
								<div className="relative z-10 mt-5 rounded-[var(--publy-radius-small-control)] border border-(--publy-border) bg-(--publy-surface-raised) aspect-[16/9]" />
							</article>
						))}
					</div>
				</div>
			</section>

			<section className="pt-[clamp(74px,10.5cqw,156px)]">
				<div className="mx-auto max-w-[760px] text-center">
					<p className="publy-marketing-eyebrow">Trial timeline</p>
					<h2 className="mt-3 text-[clamp(32px,4.2cqw,52px)] leading-[1.08] tracking-[-0.035em]">
						Try it in a short, predictable cadence
					</h2>
				</div>
				<div className="publy-marketing-hairline-grid mt-8 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] bg-[#ececef]">
					{TRIAL_STEPS.map((step) => (
						<article
							key={step.title}
							className="px-6 py-7 sm:px-8"
						>
							<p className="text-sm font-semibold tracking-[0.01em] text-(--publy-primary)">{step.label}</p>
							<p className="mt-1 text-[18px] font-semibold leading-tight tracking-[-0.02em] text-(--publy-foreground)">
								{step.title}
							</p>
							<p className="mt-3 text-[15px] leading-[1.65] text-(--publy-foreground-secondary)">
								{step.description}
							</p>
						</article>
					))}
				</div>
			</section>

			<section className="pt-[clamp(74px,10.5cqw,156px)]" id="faq">
				<div className="mx-auto max-w-[760px] text-center">
					<p className="publy-marketing-eyebrow">FAQs</p>
					<h2 className="mt-3 text-[clamp(32px,4.2cqw,52px)] leading-[1.08] tracking-[-0.035em]">
						Questions teams ask at first look
					</h2>
				</div>
				<div className="mx-auto mt-8 max-w-[760px]">
					{FAQ_ITEMS.map((item, index) => (
						<div
							key={item.question}
							className={`border-t border-(--publy-border) py-6${
								index === FAQ_ITEMS.length - 1 ? ' border-b' : ''
							}`}
						>
							<h3 className="text-[20px] leading-[1.2] font-semibold tracking-[-0.02em] text-(--publy-foreground)">
								{item.question}
							</h3>
							<p className="mt-2 text-[15.5px] leading-[1.7] text-(--publy-foreground-secondary)">
								{item.answer}
							</p>
						</div>
					))}
				</div>
			</section>

			<section className="pt-[clamp(74px,10.5cqw,156px)] pb-[clamp(52px,9cqw,124px)]">
				<div className="rounded-[28px] bg-(--publy-foreground) px-[clamp(24px,4cqw,56px)] py-[clamp(42px,8cqw,100px)] text-center">
					<h2 className="mx-auto max-w-[18ch] text-[clamp(34px,5cqw,60px)] leading-[1.07] font-semibold tracking-[-0.035em] text-(--publy-background)">
						Put your publishing team in one shared workflow
					</h2>
					<p className="mx-auto mt-4 max-w-[54ch] text-[17px] leading-[1.67] text-(--publy-background)">
						One plan. One calendar. One set of approvals. Start with a lightweight
						trial and keep the rhythm your team can own.
					</p>
					<div className="mt-8 flex flex-wrap justify-center gap-3">
						<Link
							to="/signup"
							className="inline-flex h-[48px] items-center rounded-[var(--publy-radius-control)] bg-(--publy-background) px-6 text-[16px] font-semibold tracking-[0.01em] text-(--publy-foreground)"
						>
							Start free trial
						</Link>
						<a
							href="#product-tour"
							className="inline-flex h-[48px] items-center rounded-[var(--publy-radius-control)] border border-[rgba(255,255,255,0.34)] px-6 text-[16px] font-semibold tracking-[0.01em] text-(--publy-background)"
						>
							<IconChevronRight className="size-4" />
							Watch tour
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
