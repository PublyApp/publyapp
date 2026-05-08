import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';
import { buildSeoMeta } from '#app/lib/seo/meta.ts';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	COMPANY_VALUES,
	TEAM_MEMBERS,
} from '#app/routes/marketing/_data/about.ts';

import type { Route } from './+types/about-page';

export const meta = ({ location }: Route.MetaArgs) => {
	return buildSeoMeta({
		title: 'About — PublyApp',
		description:
			'Built by operators who got tired of managing 14 platforms in 14 tabs. Today we power the social ops of 10,000+ brands worldwide.',
		pathname: location.pathname,
	});
};

// ----------------------------------------------------------------------

const FOUNDER_QUOTE = {
	memberId: 'marcus-reynolds',
	quote:
		"We didn't set out to build a SaaS company. We just wanted our Fridays back. It turns out, thousands of other operators did too.",
} as const;

// ----------------------------------------------------------------------

const MISSION_PARAGRAPHS = [
	"PublyApp wasn't built in a boardroom. It was founded in 2022 by ex-operators at high-growth SaaS companies who were drowning in calendar chaos. We were spending more time updating status spreadsheets than actually creating content.",
	"What started as a weekend hackathon project to automate our own team's publishing logic quickly became an internal dependency. By 2023, we opened a private beta. The response was visceral. By 2025, over 10,000 marketing teams rely on our infrastructure to execute predictably every day.",
] as const;

// ----------------------------------------------------------------------

const OurStorySection = () => {
	const founder = TEAM_MEMBERS.find((member) => {
		return member.id === FOUNDER_QUOTE.memberId;
	});

	return (
		<Box component="section" sx={{ py: { xs: 8, md: 12 } }}>
			<Container maxWidth="lg">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' },
						gap: { xs: 5, md: 8, lg: 12 },
						alignItems: 'center',
					}}
				>
					{/* Left: text content */}
					<Stack spacing={3} alignItems="flex-start" sx={{ textAlign: 'left' }}>
						<MarketingEyebrow label="Our story" />
						<Typography
							component="h2"
							sx={{
								fontSize: { xs: 28, md: 40 },
								fontWeight: 700,
								lineHeight: 1.15,
								letterSpacing: '-0.02em',
								color: 'text.primary',
							}}
						>
							From an internal tool to 10,000+ brands
						</Typography>
						<Stack spacing={3}>
							{MISSION_PARAGRAPHS.map((paragraph) => {
								return (
									<Typography
										key={paragraph}
										sx={{
											fontSize: { xs: 15, md: 17 },
											color: 'text.secondary',
											lineHeight: 1.75,
										}}
									>
										{paragraph}
									</Typography>
								);
							})}
						</Stack>
					</Stack>

					{/* Right: founder quote card */}
					{founder ? (
						<Box
							sx={{
								position: 'relative',
								p: { xs: 4, sm: 5 },
								borderRadius: '20px',
								bgcolor: 'background.paper',
								border: '1px solid',
								borderColor: 'divider',
								boxShadow: '0 4px 6px -1px rgba(17,24,39,0.05)',
								overflow: 'hidden',
							}}
						>
							{/* Decorative quote glyph in the corner */}
							<Iconify
								icon="ph:quotes-fill"
								width={64}
								sx={{
									position: 'absolute',
									top: 24,
									right: 24,
									color: 'primary.main',
									opacity: 0.08,
									pointerEvents: 'none',
								}}
							/>

							<Box
								component="img"
								src={founder.photoUrl}
								alt={`${founder.name}, ${founder.role}`}
								loading="lazy"
								sx={{
									width: 64,
									height: 64,
									borderRadius: '50%',
									objectFit: 'cover',
									bgcolor: 'background.neutral',
									border: '2px solid',
									borderColor: 'background.paper',
									boxShadow: '0 1px 2px rgba(17,24,39,0.05)',
									mb: 3,
								}}
							/>

							<Typography
								component="blockquote"
								sx={{
									fontSize: { xs: 18, md: 20 },
									fontWeight: 500,
									fontStyle: 'italic',
									color: 'text.primary',
									lineHeight: 1.45,
									m: 0,
									mb: 3,
								}}
							>
								&ldquo;{FOUNDER_QUOTE.quote}&rdquo;
							</Typography>

							<Box>
								<Typography
									sx={{
										fontSize: 14,
										fontWeight: 700,
										color: 'text.primary',
									}}
								>
									{founder.name}
								</Typography>
								<Typography
									sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}
								>
									{founder.role}
								</Typography>
							</Box>
						</Box>
					) : null}
				</Box>
			</Container>
		</Box>
	);
};

// ----------------------------------------------------------------------

const AboutPage = () => {
	return (
		<>
			<MarketingHero
				eyebrow="About"
				title="We help brands organize the chaos of social"
				subhead="Built by operators who got tired of managing 14 platforms in 14 tabs. Today we power the social ops of 10,000+ brands worldwide."
			/>

			{/* Our Story — 2-col split: text left, founder quote card right */}
			<OurStorySection />

			{/* Values */}
			<ContentBand eyebrow="Values" title="What we believe">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, 1fr)',
							md: 'repeat(4, 1fr)',
						},
						gap: 3,
					}}
				>
					{COMPANY_VALUES.map((value) => {
						return (
							<Box
								key={value.id}
								sx={{
									p: 3,
									borderRadius: '20px',
									bgcolor: 'background.paper',
									border: '1px solid',
									borderColor: 'divider',
								}}
							>
								<Box
									sx={{
										width: 48,
										height: 48,
										borderRadius: '12px',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										bgcolor: 'primary.lighter',
										color: 'primary.main',
										mb: 3,
									}}
								>
									<Iconify icon={value.icon} width={24} />
								</Box>
								<Typography
									sx={{
										fontSize: 18,
										fontWeight: 700,
										color: 'text.primary',
										mb: 1,
									}}
								>
									{value.title}
								</Typography>
								<Typography
									sx={{
										fontSize: 14,
										color: 'text.secondary',
										lineHeight: 1.6,
									}}
								>
									{value.body}
								</Typography>
							</Box>
						);
					})}
				</Box>
			</ContentBand>

			{/* Team */}
			<ContentBand
				eyebrow="The team"
				title="Small team, big ambitions"
				subhead="32 people across 8 timezones, all remote."
			>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: 'repeat(2, 1fr)',
							sm: 'repeat(3, 1fr)',
							md: 'repeat(4, 1fr)',
						},
						gap: 3,
					}}
				>
					{TEAM_MEMBERS.map((member) => {
						return (
							<Stack
								key={member.id}
								spacing={1.5}
								alignItems="center"
								sx={{ textAlign: 'center' }}
							>
								<Box
									component="img"
									src={member.photoUrl}
									alt={`${member.name}, ${member.role}`}
									loading="lazy"
									sx={{
										width: 96,
										height: 96,
										borderRadius: '50%',
										objectFit: 'cover',
										bgcolor: 'background.neutral',
										border: '1px solid',
										borderColor: 'divider',
									}}
								/>
								<Typography
									sx={{
										fontSize: 15,
										fontWeight: 700,
										color: 'text.primary',
									}}
								>
									{member.name}
								</Typography>
								<Typography
									sx={{
										fontSize: 13,
										color: 'text.secondary',
									}}
								>
									{member.role}
								</Typography>
							</Stack>
						);
					})}
				</Box>
			</ContentBand>

			{/* We're hiring */}
			<ContentBand eyebrow="We're hiring" title="Join the team">
				<Stack spacing={3} alignItems="center" sx={{ textAlign: 'center' }}>
					<Typography
						sx={{
							fontSize: 16,
							color: 'text.secondary',
							maxWidth: 640,
							lineHeight: 1.6,
						}}
					>
						We're growing fast and looking for forward-thinking engineers,
						designers, and customer success leads. All remote, all async-first.
					</Typography>
					{FEATURES.marketing.contact ? (
						<Box
							component={RouterLink}
							href={FRONT_PATH_NAMES.marketing.contact}
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								py: 1.5,
								px: 3,
								borderRadius: 2,
								fontWeight: 700,
								fontSize: 15,
								textDecoration: 'none',
								cursor: 'pointer',
								bgcolor: 'primary.main',
								color: 'common.white',
								transition: 'transform 240ms ease, box-shadow 240ms ease',
								'&:hover': {
									transform: 'translateY(-2px)',
									boxShadow: '0 8px 16px -4px rgba(17,24,39,0.12)',
								},
							}}
						>
							Get in touch
						</Box>
					) : null}
				</Stack>
			</ContentBand>

			{/* Bottom CTA */}
			<CtaBand
				eyebrowLabel="Get started"
				title="Try PublyApp free for 14 days"
				subhead="Stop managing spreadsheets. Start managing strategy."
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="14-day free trial. No credit card required."
			/>
		</>
	);
};

export default AboutPage;
