import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { Image } from '#app/components/image/image.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import {
	customerStoryHeroImage,
	type CustomerStory,
} from '#app/routes/marketing/_data/customer-stories.ts';

// ----------------------------------------------------------------------

// Asymmetric 2-col hero: customer wordmark + headline + dual CTA on the
// left, hero photo on the right. Mirrors the canvas's content-driven
// magazine layout while staying inside the marketing rail (`Container
// maxWidth="lg"`). Below `lg` the columns stack and the photo follows
// the prose so the headline still leads.

// ----------------------------------------------------------------------

const WordmarkCard = ({ wordmark }: { wordmark: string }) => {
	return (
		<Box
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				height: 48,
				minWidth: 128,
				px: 2,
				borderRadius: '12px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 1px 2px rgba(17,24,39,0.05)',
			}}
		>
			<Typography
				sx={{
					fontSize: 20,
					fontWeight: 700,
					color: 'text.primary',
					letterSpacing: '-0.04em',
				}}
			>
				{wordmark}
			</Typography>
		</Box>
	);
};

// ----------------------------------------------------------------------

type CustomerStoryHeroProps = {
	story: CustomerStory;
};

export const CustomerStoryHero = ({ story }: CustomerStoryHeroProps) => {
	const heroImageUrl = customerStoryHeroImage(story.heroImageSlug);

	return (
		<Box
			component="header"
			sx={{
				pt: { xs: 8, md: 14 },
				pb: { xs: 8, md: 12 },
				position: 'relative',
				overflow: 'hidden',
			}}
		>
			<Container maxWidth="lg">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', lg: '1.2fr 1fr' },
						gap: { xs: 6, lg: 8 },
						alignItems: 'center',
					}}
				>
					{/* Left column: wordmark + eyebrow + headline + subhead + pills + CTAs */}
					<Box
						component={m.div}
						variants={varFade('inUp', { distance: 24 })}
						initial="initial"
						animate="animate"
					>
						<Stack
							direction="row"
							spacing={2}
							alignItems="center"
							sx={{ mb: 4 }}
						>
							<WordmarkCard wordmark={story.customerWordmark} />
							<Box
								aria-hidden="true"
								sx={{
									width: 32,
									height: '1px',
									bgcolor: 'divider',
								}}
							/>
							<Typography
								sx={{
									fontSize: 11,
									fontWeight: 700,
									letterSpacing: '0.18em',
									textTransform: 'uppercase',
									color: 'primary.main',
								}}
							>
								Customer Story
							</Typography>
						</Stack>

						<Typography
							component="h1"
							sx={{
								fontSize: { xs: 36, md: 48, lg: 54 },
								fontWeight: 800,
								color: 'text.primary',
								letterSpacing: '-0.025em',
								lineHeight: 1.1,
								mb: 3,
							}}
						>
							{story.headline}
						</Typography>

						<Typography
							sx={{
								fontSize: { xs: 16, md: 18 },
								color: 'text.secondary',
								lineHeight: 1.6,
								maxWidth: 560,
								mb: 4,
							}}
						>
							{story.subhead}
						</Typography>

						<Stack
							direction="row"
							spacing={1.5}
							sx={{ flexWrap: 'wrap', gap: 1.5, mb: 5 }}
						>
							{story.tagPills.map((pill) => {
								return (
									<Stack
										key={pill.id}
										direction="row"
										spacing={1}
										alignItems="center"
										sx={{
											px: 2,
											py: 0.75,
											borderRadius: 999,
											bgcolor: 'background.paper',
											border: '1px solid',
											borderColor: 'divider',
											boxShadow: '0 1px 2px rgba(17,24,39,0.05)',
										}}
									>
										<Iconify
											icon={pill.iconName}
											width={14}
											sx={{ color: 'text.primary' }}
										/>
										<Typography
											sx={{
												fontSize: 13,
												color: 'text.secondary',
												fontWeight: 500,
											}}
										>
											{pill.label}
										</Typography>
									</Stack>
								);
							})}
						</Stack>

						<Stack
							direction={{ xs: 'column', sm: 'row' }}
							spacing={2}
							alignItems={{ xs: 'stretch', sm: 'center' }}
						>
							<Box
								component={RouterLink}
								href={FRONT_PATH_NAMES.auth.signup}
								sx={{
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									px: 4,
									py: 1.75,
									borderRadius: '12px',
									bgcolor: 'primary.main',
									color: 'common.white',
									fontSize: 15,
									fontWeight: 700,
									textDecoration: 'none',
									boxShadow: '0 10px 30px 0 rgba(16,185,129,0.30)',
									transition:
										'transform 240ms ease, box-shadow 240ms ease, background-color 240ms ease',
									'&:hover': {
										bgcolor: 'primary.dark',
										transform: 'translateY(-1px)',
										boxShadow: '0 14px 36px 0 rgba(16,185,129,0.35)',
									},
									'&:active': { transform: 'scale(0.98)' },
								}}
							>
								Try PublyApp free
							</Box>
							<Box
								component="a"
								href="#story"
								sx={{
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									gap: 1,
									px: 3,
									py: 1.75,
									color: 'text.primary',
									fontSize: 15,
									fontWeight: 600,
									textDecoration: 'none',
									transition: 'color 240ms ease',
									'& .read-arrow': {
										transition: 'transform 240ms ease',
									},
									'&:hover': {
										color: 'primary.main',
										'& .read-arrow': { transform: 'translateY(2px)' },
									},
								}}
							>
								Read the full story
								<Iconify
									icon="ph:caret-down-bold"
									width={16}
									className="read-arrow"
								/>
							</Box>
						</Stack>
					</Box>

					{/* Right column: hero photo */}
					<Box
						component={m.div}
						variants={varFade('inUp', { distance: 24 })}
						initial="initial"
						animate="animate"
						transition={{ delay: 0.1 }}
						sx={{
							borderRadius: { xs: '20px', md: '24px' },
							overflow: 'hidden',
							border: '1px solid',
							borderColor: 'divider',
							boxShadow: '0 24px 48px -20px rgba(17,24,39,0.18)',
						}}
					>
						<Image
							src={heroImageUrl}
							alt={story.heroImageAlt}
							ratio="3/4"
							sx={{ overflow: 'hidden' }}
						/>
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
