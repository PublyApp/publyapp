import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';
import { ComparisonFeatureTable } from '#app/routes/marketing/_components/comparison-feature-table.tsx';
import { ComparisonMigrationTimeline } from '#app/routes/marketing/_components/comparison-migration-timeline.tsx';
import { ComparisonPricingPair } from '#app/routes/marketing/_components/comparison-pricing-pair.tsx';
import { ComparisonQuickVerdictCards } from '#app/routes/marketing/_components/comparison-quick-verdict-cards.tsx';
import { ComparisonTestimonialCard } from '#app/routes/marketing/_components/comparison-testimonial-card.tsx';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingFaqAccordion } from '#app/routes/marketing/_components/marketing-faq-accordion.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	type Competitor,
	findCompetitor,
} from '#app/routes/marketing/_data/comparisons.ts';

// ----------------------------------------------------------------------

type MetaArgs = { params: { competitor?: string } };

// Tiny presentational wordmark cloud — kept inside the page (not extracted)
// because it's specific to this surface and reads as document content, not a
// reusable primitive.
const TRUSTED_BY_WORDMARKS = [
	'Acme Corp',
	'Globex',
	'Initech',
	'Stark Ind.',
	'Hooli',
] as const;

// ----------------------------------------------------------------------

const HeroEyebrowPill = ({ label }: { label: string }) => {
	return (
		<Box
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 1,
				px: 2,
				py: 0.75,
				borderRadius: 999,
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 1px 2px 0 rgba(17,24,39,0.04)',
				color: 'text.primary',
				fontSize: 13,
				fontWeight: 600,
				mb: 2,
			}}
		>
			<Iconify
				icon="ph:check-circle-fill"
				width={16}
				sx={{ color: 'primary.main' }}
			/>
			{label}
		</Box>
	);
};

const TrustedByStrip = ({ label }: { label: string }) => {
	return (
		<Box
			component="section"
			sx={{ pb: { xs: 4, md: 6 }, px: { xs: 2, md: 3 } }}
		>
			<Container maxWidth="lg">
				<Stack spacing={2.5} sx={{ alignItems: 'center', textAlign: 'center' }}>
					<Typography
						sx={{
							fontSize: 12,
							fontWeight: 700,
							letterSpacing: '0.18em',
							textTransform: 'uppercase',
							color: 'text.secondary',
						}}
					>
						{label}
					</Typography>
					<Stack
						direction="row"
						sx={{
							flexWrap: 'wrap',
							justifyContent: 'center',
							rowGap: 2,
							columnGap: { xs: 3, md: 5 },
							opacity: 0.6,
							color: 'text.secondary',
							transition: 'opacity 240ms ease',
							'&:hover': { opacity: 1 },
						}}
					>
						{TRUSTED_BY_WORDMARKS.map((name) => {
							return (
								<Typography
									key={name}
									sx={{
										fontSize: { xs: 14, md: 16 },
										fontWeight: 700,
										color: 'text.primary',
									}}
								>
									{name}
								</Typography>
							);
						})}
					</Stack>
				</Stack>
			</Container>
		</Box>
	);
};

// ----------------------------------------------------------------------

const ComparisonPageBody = ({ competitor }: { competitor: Competitor }) => {
	const demoCtaHref = FEATURES.marketing.contact
		? FRONT_PATH_NAMES.marketing.contact
		: FRONT_PATH_NAMES.auth.signup;

	return (
		<>
			<Container
				maxWidth="lg"
				sx={{ pt: { xs: 4, md: 6 }, textAlign: 'center' }}
			>
				<HeroEyebrowPill label={competitor.hero.eyebrowPill} />
			</Container>

			<MarketingHero
				eyebrow={`vs ${competitor.displayName}`}
				title={competitor.hero.title}
				subhead={competitor.hero.subhead}
				primaryCta={{
					label: 'Start free trial',
					href: FRONT_PATH_NAMES.auth.signup,
				}}
				secondaryCta={{
					label: 'Book a demo',
					href: demoCtaHref,
				}}
			/>

			<TrustedByStrip label={competitor.trustedByLabel} />

			<ComparisonQuickVerdictCards items={competitor.quickVerdict} />

			<ComparisonFeatureTable
				title="Feature head-to-head"
				subhead="A detailed breakdown of how our platforms compare across key functions."
				usDisplayName="PublyApp"
				themDisplayName={competitor.displayName}
				usInitial="P"
				themInitial={competitor.initial}
				groups={competitor.featureGroups}
			/>

			<ComparisonPricingPair
				title="Honest, scalable pricing"
				subhead="Don't get penalized for growing your channels. Compare our flat-rate structure against per-channel billing."
				us={competitor.pricing.us}
				them={competitor.pricing.them}
				recommendedLabel="Recommended Scale"
			/>

			<ComparisonMigrationTimeline
				eyebrow={competitor.migration.eyebrow}
				title={competitor.migration.title}
				steps={competitor.migration.steps}
				ctaLabel={competitor.migration.ctaLabel}
				ctaHref={competitor.migration.ctaHref}
			/>

			<ContentBand title="Hear from teams who switched">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							md: 'repeat(3, 1fr)',
						},
						gap: { xs: 4, md: 4 },
						alignItems: 'stretch',
					}}
				>
					{competitor.testimonials.map((t) => {
						return (
							<ComparisonTestimonialCard
								key={t.id}
								testimonial={t}
								badgeLabel={competitor.testimonialBadgeLabel}
							/>
						);
					})}
				</Box>
			</ContentBand>

			<ContentBand title="Common questions">
				<Box sx={{ maxWidth: 720, mx: 'auto' }}>
					<MarketingFaqAccordion items={competitor.faq} />
				</Box>
			</ContentBand>

			<CtaBand
				eyebrowLabel={competitor.bottomCta.eyebrow}
				title={competitor.bottomCta.title}
				subhead={competitor.bottomCta.subhead}
				ctaLabel={competitor.bottomCta.ctaLabel}
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="No credit card required. Cancel anytime."
			/>
		</>
	);
};

// ----------------------------------------------------------------------

const ComparisonPage = () => {
	const { competitor: slug } = useParams<{ competitor: string }>();
	const competitor = findCompetitor(slug);

	if (!competitor) {
		// Falls through to the marketing layout's `*` catch-all 404 route.
		throw new Response('Not Found', { status: 404 });
	}

	return <ComparisonPageBody competitor={competitor} />;
};

export default ComparisonPage;

// ----------------------------------------------------------------------

// Per-competitor SEO meta. Mirrors the route component's lookup so the
// crawler doesn't see a title for an unknown competitor that 404s in body.
export const meta = ({ params }: MetaArgs) => {
	const competitor = findCompetitor(params.competitor);

	if (!competitor) {
		return [{ title: `Comparison | ${APP_NAME}` }];
	}

	const title = `${APP_NAME} vs ${competitor.displayName} | Comparison`;
	const description = competitor.hero.subhead;

	return [
		{ title },
		{ name: 'description', content: description },
		{ property: 'og:title', content: title },
		{ property: 'og:description', content: description },
		{ property: 'og:type', content: 'website' },
	];
};
