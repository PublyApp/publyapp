import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { ContentBand } from '#app/routes/marketing/_components/content-band.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingHero } from '#app/routes/marketing/_components/marketing-hero.tsx';
import {
	COMPANY_VALUES,
	TEAM_MEMBERS,
} from '#app/routes/marketing/_data/about.ts';

// ----------------------------------------------------------------------

const MISSION_PARAGRAPHS = [
	"PublyApp wasn't built in a boardroom. It was founded in 2022 by ex-operators at high-growth SaaS companies who were drowning in calendar chaos. We were spending more time updating status spreadsheets than actually creating content.",
	"What started as a weekend hackathon project to automate our own team's publishing logic quickly became an internal dependency. By 2023, we opened a private beta. The response was visceral. By 2025, over 10,000 marketing teams rely on our infrastructure to execute predictably every day.",
] as const;

// ----------------------------------------------------------------------

const AboutPage = () => {
	return (
		<>
			<MarketingHero
				eyebrow="About"
				title="We help brands organize the chaos of social"
				subhead="Built by operators who got tired of managing 14 platforms in 14 tabs. Today we power the social ops of 10,000+ brands worldwide."
			/>

			{/* Mission */}
			<ContentBand
				eyebrow="Our story"
				title="From an internal tool to 10,000+ brands"
			>
				<Stack spacing={3} sx={{ maxWidth: 720 }}>
					{MISSION_PARAGRAPHS.map((paragraph, index) => {
						return (
							<Typography
								key={index}
								sx={{
									fontSize: 16,
									color: 'text.secondary',
									lineHeight: 1.75,
								}}
							>
								{paragraph}
							</Typography>
						);
					})}
				</Stack>
			</ContentBand>

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
				<Stack spacing={3} alignItems="flex-start">
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
