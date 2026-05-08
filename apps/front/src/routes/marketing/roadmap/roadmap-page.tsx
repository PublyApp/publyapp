import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import { RoadmapCard } from '#app/routes/marketing/_components/roadmap-card.tsx';
import { RoadmapColumn } from '#app/routes/marketing/_components/roadmap-column.tsx';
import { RoadmapShippedTimeline } from '#app/routes/marketing/_components/roadmap-shipped-timeline.tsx';
import { RoadmapStats } from '#app/routes/marketing/_components/roadmap-stats.tsx';
import {
	getItemsForColumn,
	RECENTLY_SHIPPED,
	ROADMAP_ITEMS,
} from '#app/routes/marketing/_data/roadmap.ts';

// ----------------------------------------------------------------------

const PAGE_TITLE = `Public roadmap | ${APP_NAME}`;
const PAGE_DESCRIPTION =
	'Building in the open. See what we are shipping next, what is up for research, and what just landed.';

// Placeholder community-vote total — keeps the stats strip honest about
// being illustrative until the real votes API exists.
const PLACEHOLDER_VOTES_TOTAL = 1283;

// ----------------------------------------------------------------------

const KanbanSection = () => {
	const nowItems = getItemsForColumn('now');
	const nextItems = getItemsForColumn('next');
	const laterItems = getItemsForColumn('later');

	return (
		<Box
			component="section"
			sx={{
				bgcolor: 'background.neutral',
				borderTop: '1px solid',
				borderBottom: '1px solid',
				borderColor: 'divider',
				py: { xs: 8, md: 10 },
			}}
		>
			<Container
				maxWidth="xl"
				component={MotionViewport}
				sx={{ px: { xs: 2, sm: 3, md: 4 } }}
			>
				<Box
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							md: 'repeat(2, 1fr)',
							lg: 'repeat(3, 1fr)',
						},
						gap: { xs: 4, md: 4, xl: 5 },
					}}
				>
					<RoadmapColumn label="Now (Q2 2026)" tone="primary">
						{nowItems.map((item) => {
							return <RoadmapCard key={item.id} item={item} />;
						})}
					</RoadmapColumn>

					<RoadmapColumn
						label="Next (Q3 2026)"
						tone="amber"
						icon="ph:calendar-blank-fill"
					>
						{nextItems.map((item) => {
							return <RoadmapCard key={item.id} item={item} />;
						})}
					</RoadmapColumn>

					<RoadmapColumn
						label="Later (Q4 2026)"
						tone="neutral"
						icon="ph:archive-tray-fill"
						muted
					>
						{laterItems.map((item) => {
							return <RoadmapCard key={item.id} item={item} />;
						})}
					</RoadmapColumn>
				</Box>
			</Container>
		</Box>
	);
};

// ----------------------------------------------------------------------

const ShippedSection = () => {
	return (
		<Box component="section" sx={{ py: { xs: 8, md: 12 } }}>
			<Container maxWidth="md">
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					alignItems={{ xs: 'flex-start', sm: 'flex-end' }}
					justifyContent="space-between"
					spacing={2}
					sx={{ mb: { xs: 5, md: 7 } }}
				>
					<Box>
						<Typography
							component="h2"
							sx={{
								fontSize: { xs: 28, md: 36 },
								fontWeight: 700,
								lineHeight: 1.2,
								letterSpacing: '-0.01em',
								color: 'text.primary',
								mb: 1,
							}}
						>
							Shipped recently
						</Typography>
						<Typography
							sx={{
								fontSize: { xs: 15, md: 16 },
								color: 'text.secondary',
								lineHeight: 1.6,
							}}
						>
							A history of execution and delivered promises.
						</Typography>
					</Box>

					{FEATURES.marketing.changelog ? (
						<Box
							component={RouterLink}
							href={FRONT_PATH_NAMES.marketing.changelog}
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.75,
								color: 'primary.main',
								fontSize: 14,
								fontWeight: 700,
								textDecoration: 'none',
								'&:hover': { textDecoration: 'underline' },
							}}
						>
							View full changelog
							<Iconify icon="ph:arrow-right-bold" width={14} />
						</Box>
					) : null}
				</Stack>

				<RoadmapShippedTimeline items={RECENTLY_SHIPPED} />
			</Container>
		</Box>
	);
};

// ----------------------------------------------------------------------

type IntentCardProps = {
	icon:
		| 'ph:lightning-fill'
		| 'ph:envelope-bold'
		| 'ph:rocket-launch-fill'
		| 'ph:trend-up-fill';
	title: string;
	body: string;
	ctaLabel: string;
	ctaHref?: string; // when undefined → render plain text instead of link
};

const IntentCard = ({
	icon,
	title,
	body,
	ctaLabel,
	ctaHref,
}: IntentCardProps) => {
	return (
		<Box
			sx={{
				p: { xs: 4, md: 5 },
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 1px 2px rgba(17,24,39,0.04)',
				display: 'flex',
				flexDirection: 'column',
				gap: 2,
			}}
		>
			<Box
				sx={{
					width: 44,
					height: 44,
					borderRadius: '12px',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					bgcolor: 'primary.lighter',
					color: 'primary.main',
				}}
			>
				<Iconify icon={icon} width={20} />
			</Box>
			<Typography
				component="h3"
				sx={{
					fontSize: 20,
					fontWeight: 700,
					color: 'text.primary',
					letterSpacing: '-0.01em',
				}}
			>
				{title}
			</Typography>
			<Typography
				sx={{
					fontSize: 14,
					color: 'text.secondary',
					lineHeight: 1.6,
				}}
			>
				{body}
			</Typography>
			{ctaHref ? (
				<Box
					component={RouterLink}
					href={ctaHref}
					sx={{
						alignSelf: 'flex-start',
						display: 'inline-flex',
						alignItems: 'center',
						gap: 0.75,
						mt: 1,
						py: 1.25,
						px: 2.5,
						borderRadius: 2,
						fontWeight: 700,
						fontSize: 14,
						textDecoration: 'none',
						bgcolor: 'primary.main',
						color: 'common.white',
						transition: 'transform 240ms ease, box-shadow 240ms ease',
						'&:hover': {
							transform: 'translateY(-2px)',
							boxShadow: '0 8px 16px -4px rgba(17,24,39,0.12)',
						},
					}}
				>
					{ctaLabel}
					<Iconify icon="ph:arrow-right-bold" width={14} />
				</Box>
			) : (
				<Typography
					sx={{
						fontSize: 13,
						color: 'text.disabled',
						mt: 1,
						fontStyle: 'italic',
					}}
				>
					{ctaLabel}
				</Typography>
			)}
		</Box>
	);
};

// ----------------------------------------------------------------------

const HelpShapeSection = () => {
	const contactHref = FEATURES.marketing.contact
		? FRONT_PATH_NAMES.marketing.contact
		: undefined;

	return (
		<ContentBand
			eyebrow="Help shape PublyApp"
			title="What should we build next?"
			subhead="Have an idea? Want roadmap updates? We read every message — top-voted features ship faster."
		>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
					gap: 3,
				}}
			>
				<IntentCard
					icon="ph:lightning-fill"
					title="Suggest a feature"
					body="Tell us what would unlock your workflow. We triage every submission within a week and add the strongest ideas to the public board."
					ctaLabel={contactHref ? 'Send us your idea' : 'Coming soon'}
					ctaHref={contactHref}
				/>
				<IntentCard
					icon="ph:envelope-bold"
					title="Get roadmap updates"
					body="A monthly email recap of what shipped and what just moved into Now. No spam, easy unsubscribe."
					ctaLabel={contactHref ? 'Subscribe' : 'Coming soon'}
					ctaHref={contactHref}
				/>
			</Box>
		</ContentBand>
	);
};

// ----------------------------------------------------------------------

const RoadmapPage = () => {
	const inProgressCount = ROADMAP_ITEMS.filter((item) => {
		return item.status === 'in-progress';
	}).length;

	return (
		<>
			<MarketingHero
				eyebrow="Public roadmap · Updated weekly"
				eyebrowIcon="ph:rocket-launch-fill"
				title="What we're building next"
				subhead="We build PublyApp in the open. See what's shipping next, what's up for research, and tell us exactly what tools you need."
			/>

			<RoadmapStats
				shipped={RECENTLY_SHIPPED.length + 44}
				inProgress={inProgressCount}
				votes={PLACEHOLDER_VOTES_TOTAL}
			/>

			<KanbanSection />

			<ShippedSection />

			<HelpShapeSection />

			<CtaBand
				eyebrowLabel="Build with us"
				title={'Building in public\nworks better with you.'}
				subhead="Join thousands of teams turning their followers into active brand advocates."
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default RoadmapPage;

// ----------------------------------------------------------------------

export const meta = () => [
	{ title: PAGE_TITLE },
	{ name: 'description', content: PAGE_DESCRIPTION },
	{ property: 'og:title', content: PAGE_TITLE },
	{ property: 'og:description', content: PAGE_DESCRIPTION },
	{ property: 'og:type', content: 'website' },
];
