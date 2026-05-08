import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import {
	asHoverRoot,
	hoverLift,
} from '#app/components/animate/variants/hover.ts';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { RouterLink } from '#app/components/router-link.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';

// ----------------------------------------------------------------------

type CtaConfig = {
	label: string;
	href: string;
};

type FeatureHeroProps = {
	eyebrow: string;
	eyebrowIcon?: IconifyName;
	title: string;
	subhead: string;
	primaryCta: CtaConfig;
	secondaryCta: CtaConfig;
	socialProofText: string;
};

// ----------------------------------------------------------------------

const isExternalHref = (href: string): boolean => {
	return (
		href.startsWith('http') ||
		href.startsWith('mailto:') ||
		href.startsWith('#')
	);
};

// ----------------------------------------------------------------------

// CSS-only stylized "calendar mockup" — no images, no client JS. Mirrors
// the canvas's right-column visual without depending on assets we don't
// own. Uses neutral surface colors so it composes cleanly in both light
// and dark themes.
const CalendarMockup = () => {
	const lift = hoverLift({ y: -6, scale: 1.02 });

	return (
		<Box
			component={m.div}
			{...asHoverRoot(lift)}
			sx={{
				position: 'relative',
				width: '100%',
				aspectRatio: '4 / 5',
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				overflow: 'hidden',
				display: 'flex',
				flexDirection: 'column',
				transform: 'rotate(2deg)',
				transformOrigin: 'center',
				boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)',
				willChange: 'transform',
			}}
		>
			{/* Header bar */}
			<Box
				sx={{
					height: 56,
					px: 2,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					borderBottom: '1px solid',
					borderColor: 'divider',
					bgcolor: 'background.paper',
				}}
			>
				<Stack direction="row" spacing={1} alignItems="center">
					<Typography
						sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}
					>
						October 2024
					</Typography>
					<Iconify
						icon="ph:caret-down-bold"
						width={12}
						sx={{ color: 'text.disabled' }}
					/>
				</Stack>
				<Stack direction="row" spacing={1} alignItems="center">
					<Box
						sx={{
							width: 80,
							height: 24,
							borderRadius: 999,
							bgcolor: 'background.neutral',
						}}
					/>
					<Box
						sx={{
							width: 24,
							height: 24,
							borderRadius: '6px',
							bgcolor: 'primary.lighter',
							color: 'primary.main',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<Iconify icon="ph:plus-bold" width={12} />
					</Box>
				</Stack>
			</Box>

			{/* Calendar body — pseudo content blocks */}
			<Box
				sx={{
					flex: 1,
					p: 1.5,
					bgcolor: 'background.neutral',
					position: 'relative',
				}}
			>
				{/* Block 1 — top-left */}
				<Box
					sx={{
						position: 'absolute',
						top: '10%',
						left: 12,
						width: 'calc(33% - 6px)',
						height: 80,
						bgcolor: 'background.paper',
						border: '1px solid',
						borderColor: 'divider',
						borderRadius: 1.5,
						boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
						p: 1,
						display: 'flex',
						flexDirection: 'column',
						gap: 0.75,
					}}
				>
					<Box
						sx={{
							width: 16,
							height: 16,
							borderRadius: '4px',
							bgcolor: '#1DA1F2',
						}}
					/>
					<Box
						sx={{
							flex: 1,
							borderRadius: 0.75,
							bgcolor: 'background.neutral',
						}}
					/>
				</Box>

				{/* Block 2 — middle, accent (approved) */}
				<Box
					sx={(theme) => ({
						position: 'absolute',
						top: '28%',
						left: 'calc(33% + 8px)',
						width: 'calc(40% - 8px)',
						height: 96,
						bgcolor: 'background.paper',
						border: '1px solid',
						borderColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.25),
						borderRadius: 1.5,
						boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
						p: 1,
						display: 'flex',
						flexDirection: 'column',
						gap: 0.75,
						zIndex: 1,
					})}
				>
					<Stack
						direction="row"
						alignItems="center"
						justifyContent="space-between"
					>
						<Box
							sx={{
								width: 16,
								height: 16,
								borderRadius: '4px',
								bgcolor: '#0A66C2',
							}}
						/>
						<Box
							sx={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								bgcolor: 'primary.main',
							}}
						/>
					</Stack>
					<Box
						sx={{
							flex: 1,
							borderRadius: 0.75,
							bgcolor: 'background.neutral',
						}}
					/>
				</Box>

				{/* Block 3 — lower-left */}
				<Box
					sx={{
						position: 'absolute',
						top: '55%',
						left: 12,
						width: 'calc(50% - 6px)',
						height: 64,
						bgcolor: 'background.paper',
						border: '1px solid',
						borderColor: 'divider',
						borderRadius: 1.5,
						boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
						p: 1,
						display: 'flex',
						flexDirection: 'column',
						gap: 0.75,
					}}
				>
					<Box
						sx={{
							width: 16,
							height: 16,
							borderRadius: '4px',
							bgcolor: '#E1306C',
						}}
					/>
					<Box
						sx={{
							flex: 1,
							borderRadius: 0.75,
							bgcolor: 'background.neutral',
						}}
					/>
				</Box>
			</Box>

			{/* Floating "Post Published" pill */}
			<Box
				sx={{
					position: 'absolute',
					right: -12,
					bottom: -12,
					px: 1.5,
					py: 1,
					borderRadius: 2,
					bgcolor: 'background.paper',
					border: '1px solid',
					borderColor: 'divider',
					display: 'inline-flex',
					alignItems: 'center',
					gap: 1.25,
					boxShadow: '0 20px 40px -15px rgba(0,0,0,0.10)',
					zIndex: 2,
				}}
			>
				<Box
					sx={{
						width: 32,
						height: 32,
						borderRadius: '50%',
						bgcolor: 'primary.lighter',
						color: 'primary.main',
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Iconify icon="ph:check-circle-fill" width={18} />
				</Box>
				<Box>
					<Typography
						sx={{
							fontSize: 12,
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.2,
						}}
					>
						Post Published
					</Typography>
					<Typography
						sx={{
							fontSize: 11,
							color: 'text.secondary',
							lineHeight: 1.2,
						}}
					>
						To 3 networks safely.
					</Typography>
				</Box>
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

const PrimaryCtaButton = ({ cta }: { cta: CtaConfig }) => {
	const external = isExternalHref(cta.href);

	return (
		<Box
			component={external ? 'a' : RouterLink}
			href={cta.href}
			sx={(theme) => ({
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				py: 1.75,
				px: 4,
				borderRadius: 2,
				fontWeight: 700,
				fontSize: 16,
				textDecoration: 'none',
				cursor: 'pointer',
				bgcolor: 'primary.main',
				color: 'common.white',
				boxShadow: `0 12px 24px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.5)}`,
				transition: 'transform 240ms ease, box-shadow 240ms ease',
				'&:hover': {
					transform: 'translateY(-2px)',
					boxShadow: `0 16px 32px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.6)}`,
				},
			})}
		>
			{cta.label}
		</Box>
	);
};

const SecondaryCtaButton = ({ cta }: { cta: CtaConfig }) => {
	const external = isExternalHref(cta.href);

	return (
		<Box
			component={external ? 'a' : RouterLink}
			href={cta.href}
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				py: 1.75,
				px: 3,
				fontWeight: 600,
				fontSize: 16,
				textDecoration: 'none',
				cursor: 'pointer',
				color: 'text.primary',
				transition: 'color 240ms ease',
				'& .feature-hero-arrow': {
					transition: 'transform 240ms ease',
				},
				'&:hover': {
					color: 'primary.main',
					'& .feature-hero-arrow': {
						transform: 'translateX(4px)',
					},
				},
			}}
		>
			{cta.label}
			<Iconify
				icon="ph:arrow-right-bold"
				width={16}
				className="feature-hero-arrow"
				sx={{ ml: 0.75 }}
			/>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const FeatureHero = ({
	eyebrow,
	eyebrowIcon,
	title,
	subhead,
	primaryCta,
	secondaryCta,
	socialProofText,
}: FeatureHeroProps) => {
	return (
		<Box component="section" sx={{ position: 'relative', overflow: 'hidden' }}>
			{/* Decorative ambient glow */}
			<Box
				aria-hidden="true"
				sx={(theme) => ({
					position: 'absolute',
					top: -160,
					right: -160,
					width: 640,
					height: 640,
					borderRadius: '50%',
					background: `radial-gradient(circle, ${varAlpha(theme.vars.palette.primary.mainChannel, 0.1)} 0%, transparent 70%)`,
					filter: 'blur(48px)',
					pointerEvents: 'none',
				})}
			/>

			<Container
				maxWidth="lg"
				component={MotionViewport}
				sx={{ pt: { xs: 6, md: 12 }, pb: { xs: 8, md: 14 } }}
			>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' },
						gap: { xs: 6, md: 8, lg: 12 },
						alignItems: 'center',
					}}
				>
					{/* Left: copy */}
					<Stack spacing={3} alignItems="flex-start" sx={{ textAlign: 'left' }}>
						<Box component={m.div} variants={varFade('inUp', { distance: 24 })}>
							<MarketingEyebrow label={eyebrow} icon={eyebrowIcon} />
						</Box>
						<Typography
							component={m.h1}
							variants={varFade('inUp', { distance: 24 })}
							sx={{
								fontSize: { xs: 40, md: 56, lg: 64 },
								fontWeight: 800,
								lineHeight: 1.05,
								letterSpacing: '-0.02em',
								color: 'text.primary',
								m: 0,
							}}
						>
							{title}
						</Typography>
						<Typography
							component={m.p}
							variants={varFade('inUp', { distance: 24 })}
							sx={{
								fontSize: { xs: 16, md: 19 },
								color: 'text.secondary',
								lineHeight: 1.6,
								maxWidth: 560,
								m: 0,
							}}
						>
							{subhead}
						</Typography>
						<Box component={m.div} variants={varFade('inUp', { distance: 24 })}>
							<Stack
								direction={{ xs: 'column', sm: 'row' }}
								spacing={2}
								alignItems={{ xs: 'stretch', sm: 'center' }}
							>
								<PrimaryCtaButton cta={primaryCta} />
								<SecondaryCtaButton cta={secondaryCta} />
							</Stack>
						</Box>
						<Stack
							component={m.div}
							variants={varFade('inUp', { distance: 24 })}
							direction="row"
							spacing={2}
							alignItems="center"
							sx={{ mt: 1 }}
						>
							<Stack
								direction="row"
								sx={{
									'& > *:not(:first-of-type)': { ml: -1 },
								}}
							>
								{[1, 2, 3].map((id) => {
									return (
										<Box
											key={id}
											sx={{
												width: 32,
												height: 32,
												borderRadius: '50%',
												border: '2px solid',
												borderColor: 'background.default',
												bgcolor: 'background.neutral',
											}}
										/>
									);
								})}
							</Stack>
							<Typography
								sx={{
									fontSize: 13,
									color: 'text.secondary',
								}}
							>
								{socialProofText}
							</Typography>
						</Stack>
					</Stack>

					{/* Right: visual mockup (hidden on small screens for breathing room) */}
					<Box
						component={m.div}
						variants={varFade('inUp', { distance: 24 })}
						sx={{
							display: { xs: 'none', lg: 'block' },
							position: 'relative',
						}}
					>
						<CalendarMockup />
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
