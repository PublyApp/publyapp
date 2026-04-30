import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';

import { MotionViewport, varFade } from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

const textGradientSx: SxProps<Theme> = (theme) => {
	return {
		background: `linear-gradient(180deg, ${theme.vars.palette.primary.main} 0%, ${theme.vars.palette.primary.dark} 100%)`,
		WebkitBackgroundClip: 'text',
		WebkitTextFillColor: 'transparent',
		backgroundClip: 'text',
		color: 'transparent',
	};
};

const noiseOverlayUrl =
	"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

const calendarDays = [
	{ label: 'MON', value: '12', active: false },
	{ label: 'TUE', value: '13', active: true },
	{ label: 'WED', value: '14', active: false },
];

const chartBars = [
	{ id: 'b1', height: '30%', highlight: false },
	{ id: 'b2', height: '50%', highlight: false },
	{ id: 'b3', height: '80%', highlight: true },
	{ id: 'b4', height: '40%', highlight: false },
	{ id: 'b5', height: '60%', highlight: false },
];

const SectionEyebrow = ({ label }: { label: string }) => {
	return (
		<Box
			sx={{
				display: 'inline-block',
				px: 1.5,
				py: 0.5,
				bgcolor: 'background.paper',
				borderRadius: '6px',
				boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				mb: 2,
				fontSize: 12,
				fontWeight: 700,
				color: 'primary.main',
				letterSpacing: '0.1em',
				textTransform: 'uppercase',
			}}
		>
			{label}
		</Box>
	);
};

const FeatureIcon = ({
	icon,
	color = 'primary.main',
	bgcolor = 'primary.lighter',
}: {
	icon: string;
	color?: string;
	bgcolor?: string;
}) => {
	return (
		<Box
			sx={{
				width: 48,
				height: 48,
				bgcolor,
				borderRadius: 2,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				color,
				mb: 3,
			}}
		>
			<Iconify icon={icon as never} width={24} />
		</Box>
	);
};

const FeatureHeader = () => {
	return (
		<Box sx={{ textAlign: 'center', mb: 10 }}>
			<m.div variants={varFade('inUp', { distance: 24 })}>
				<SectionEyebrow label="Features" />
			</m.div>

			<m.div variants={varFade('inUp', { distance: 24 })}>
				<Typography
					component="h2"
					sx={{
						fontSize: 48,
						fontWeight: 800,
						letterSpacing: '-0.02em',
						mb: 2,
						maxWidth: 720,
						mx: 'auto',
						lineHeight: 1.15,
					}}
				>
					Transform Your Strategy Into a
					<br />
					<Box component="span" sx={{ display: 'inline-flex', gap: 1.5 }}>
						<Iconify
							icon={'ph:lightning-fill' as never}
							width={40}
							sx={{ color: 'secondary.main' }}
						/>
						<Box component="span" sx={textGradientSx}>
							Powerhouse
						</Box>
					</Box>
				</Typography>
			</m.div>

			<m.div variants={varFade('inUp', { distance: 24 })}>
				<Typography
					sx={{
						fontSize: 18,
						color: 'text.secondary',
						maxWidth: 640,
						mx: 'auto',
					}}
				>
					Stop hopping between 5 different apps. Write, schedule, engage, and
					analyze—everything happening seamlessly in one unified dashboard.
				</Typography>
			</m.div>
		</Box>
	);
};

const CalendarDay = ({
	label,
	value,
	active,
}: {
	label: string;
	value: string;
	active: boolean;
}) => {
	return (
		<Box
			className={active ? 'calendar-active-day' : undefined}
			sx={{
				width: 40,
				height: 40,
				bgcolor: active ? undefined : 'background.paper',
				color: active ? 'common.white' : 'text.primary',
				borderRadius: 1,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				boxShadow: active ? undefined : '0 1px 2px 0 rgba(0,0,0,0.05)',
			}}
		>
			<Typography
				sx={{
					fontSize: 8,
					color: active ? 'rgba(255,255,255,0.7)' : 'text.secondary',
				}}
			>
				{label}
			</Typography>
			<Typography sx={{ fontSize: 12, fontWeight: 700 }}>{value}</Typography>
		</Box>
	);
};

const CalendarMock = () => {
	return (
		<Box
			sx={(theme) => {
				return {
					position: 'absolute',
					top: 40,
					right: -80,
					width: 450,
					bgcolor: 'background.default',
					borderRadius: 2,
					p: 2,
					boxShadow:
						'0 20px 40px -4px rgba(17,24,39,0.08), 0 8px 16px -4px rgba(17,24,39,0.04)',
					border: '1px solid #fff',
					display: { xs: 'none', md: 'block' },
					'& .calendar-active-day': {
						bgcolor: theme.vars.palette.primary.main,
						boxShadow: `0 8px 16px -4px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.3)}`,
					},
				};
			}}
		>
			<Stack direction="row" spacing={1} sx={{ mb: 2 }}>
				{calendarDays.map((day) => {
					return <CalendarDay key={day.label} {...day} />;
				})}
			</Stack>
			<Stack
				direction="row"
				spacing={1.5}
				alignItems="center"
				sx={{
					bgcolor: 'background.paper',
					p: 1.5,
					borderRadius: 1.5,
					boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
				}}
			>
				<Box
					sx={{
						width: 48,
						height: 48,
						borderRadius: 1,
						overflow: 'hidden',
						backgroundImage:
							'url(https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=150&q=80)',
						backgroundSize: 'cover',
						backgroundPosition: 'center',
					}}
				/>
				<Box>
					<Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>
						New Collection Drop
					</Typography>
					<Stack direction="row" spacing={0.5}>
						<Iconify
							icon={'ph:instagram-logo-fill' as never}
							width={12}
							sx={{ color: '#E1306C' }}
						/>
						<Iconify
							icon={'ph:facebook-logo-fill' as never}
							width={12}
							sx={{ color: '#1877F2' }}
						/>
					</Stack>
				</Box>
			</Stack>
		</Box>
	);
};

const CalendarFeatureCard = () => {
	return (
		<Box
			component={m.div}
			whileHover={{ y: -10, rotate: -0.4 }}
			transition={{ type: 'spring', stiffness: 260, damping: 22 }}
			sx={{
				gridColumn: { md: 'span 2' },
				bgcolor: 'background.paper',
				borderRadius: '32px',
				p: 5,
				boxShadow: '0 12px 24px -8px rgba(17,24,39,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				position: 'relative',
				overflow: 'hidden',
				'&:hover': { boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' },
			}}
		>
			<Box sx={{ position: 'relative', zIndex: 1, width: { md: '50%' } }}>
				<FeatureIcon icon="ph:calendar-blank-fill" />
				<Typography
					component="h3"
					sx={{ fontSize: 24, fontWeight: 700, mb: 1.5 }}
				>
					Drag & Drop Calendar
				</Typography>
				<Typography sx={{ color: 'text.secondary', lineHeight: 1.6, mb: 4 }}>
					Visualize your entire month at a glance. Easily move campaigns, adjust
					times, and ensure your feed looks flawless before you hit publish.
				</Typography>
				<Button
					variant="contained"
					size="large"
					sx={(theme) => {
						return {
							bgcolor: 'grey.900',
							color: 'common.white',
							borderRadius: 2,
							fontWeight: 600,
							'&:hover': { bgcolor: 'grey.900', transform: 'translateY(-2px)' },
							...theme.applyStyles('dark', {
								bgcolor: 'common.white',
								color: 'grey.900',
								'&:hover': { bgcolor: 'common.white' },
							}),
						};
					}}
				>
					Explore Calendar
				</Button>
			</Box>
			<CalendarMock />
		</Box>
	);
};

const AiCaptionCard = () => {
	return (
		<Box
			component={m.div}
			whileHover={{ y: -12, scale: 1.02 }}
			transition={{ type: 'spring', stiffness: 280, damping: 20 }}
			sx={{
				bgcolor: 'background.paper',
				borderRadius: '32px',
				p: 4,
				boxShadow: '0 12px 24px -8px rgba(17,24,39,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'space-between',
				'&:hover': { boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' },
			}}
		>
			<Box>
				<FeatureIcon icon="ph:magic-wand-fill" />
				<Typography
					component="h3"
					sx={{ fontSize: 20, fontWeight: 700, mb: 1 }}
				>
					AI Caption Writer
				</Typography>
				<Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 3 }}>
					Stuck on what to say? Generate platform-specific, engaging captions in
					seconds using your brand voice.
				</Typography>
			</Box>
			<Box sx={{ bgcolor: 'background.default', p: 2, borderRadius: 2 }}>
				<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
					<Iconify
						icon={'ph:sparkle-duotone' as never}
						width={16}
						sx={{ color: 'primary.main' }}
					/>
					<Typography sx={{ fontSize: 12, fontWeight: 600 }}>
						Generate Tone: Humorous
					</Typography>
				</Stack>
				<Box
					sx={{
						bgcolor: 'background.paper',
						p: 1.5,
						borderRadius: 1,
						fontSize: 10,
						color: 'text.secondary',
						lineHeight: 1.6,
					}}
				>
					"When you realize it's only Tuesday but you've already had 4 coffees
					☕️🫠 Keep grinding! #TuesdayThoughts"
				</Box>
			</Box>
		</Box>
	);
};

const AnalyticsBars = () => {
	return (
		<Box
			sx={{
				height: 96,
				display: 'flex',
				alignItems: 'flex-end',
				justifyContent: 'space-between',
				gap: 1,
				px: 1,
			}}
		>
			{chartBars.map((bar) => {
				return (
					<Box
						key={bar.id}
						sx={(theme) => {
							return {
								flex: 1,
								height: bar.height,
								bgcolor: bar.highlight ? 'primary.main' : 'primary.lighter',
								borderTopLeftRadius: 2,
								borderTopRightRadius: 2,
								position: 'relative',
								...(bar.highlight && {
									boxShadow: `0 0 10px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.3)}`,
								}),
							};
						}}
					>
						{bar.highlight && (
							<Typography
								sx={{
									position: 'absolute',
									top: -24,
									left: '50%',
									transform: 'translateX(-50%)',
									fontSize: 10,
									fontWeight: 700,
									color: 'primary.main',
									bgcolor: 'primary.lighter',
									px: 0.75,
									py: 0.25,
									borderRadius: 0.5,
								}}
							>
								+42%
							</Typography>
						)}
					</Box>
				);
			})}
		</Box>
	);
};

const AnalyticsCard = () => {
	return (
		<Box
			component={m.div}
			whileHover={{ y: -10, scale: 1.015 }}
			transition={{ type: 'spring', stiffness: 320, damping: 18 }}
			sx={{
				bgcolor: 'background.paper',
				borderRadius: '32px',
				p: 4,
				boxShadow: '0 12px 24px -8px rgba(17,24,39,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				'&:hover': { boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' },
			}}
		>
			<FeatureIcon
				icon="ph:chart-line-up-fill"
				bgcolor="secondary.lighter"
				color="secondary.main"
			/>
			<Typography component="h3" sx={{ fontSize: 20, fontWeight: 700, mb: 1 }}>
				Actionable Insights
			</Typography>
			<Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 3 }}>
				Don't guess what works. Get clear data on engagement rates, best times
				to post, and audience demographics.
			</Typography>
			<AnalyticsBars />
		</Box>
	);
};

const TeammateStack = () => {
	return (
		<Stack direction="row" sx={{ '& > *': { ml: -1.5 } }}>
			<Box
				component="img"
				src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=50&q=80"
				sx={{
					width: 32,
					height: 32,
					borderRadius: '50%',
					border: '2px solid #242424',
					ml: 0,
				}}
			/>
			<Box
				component="img"
				src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=50&q=80"
				sx={{
					width: 32,
					height: 32,
					borderRadius: '50%',
					border: '2px solid #242424',
				}}
			/>
			<Box
				sx={{
					width: 32,
					height: 32,
					borderRadius: '50%',
					border: '2px solid #242424',
					bgcolor: 'primary.main',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: 10,
					fontWeight: 700,
				}}
			>
				+3
			</Box>
		</Stack>
	);
};

const InboxMock = () => {
	return (
		<Box
			sx={{
				position: 'absolute',
				top: '50%',
				right: 40,
				transform: 'translateY(-50%)',
				width: 256,
				zIndex: 1,
				display: { xs: 'none', md: 'block' },
			}}
		>
			<Box
				sx={{
					bgcolor: 'rgba(255,255,255,0.10)',
					backdropFilter: 'blur(12px)',
					p: 2,
					borderRadius: 2,
					border: '1px solid rgba(255,255,255,0.10)',
					mb: 1.5,
					transform: 'translateX(16px)',
				}}
			>
				<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
					<Iconify
						icon={'ph:x-logo-fill' as never}
						width={14}
						sx={{ color: 'common.white' }}
					/>
					<Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
						Mentioned you
					</Typography>
				</Stack>
				<Typography sx={{ fontSize: 12 }}>
					Love the new update! 😍 Is there a tutorial?
				</Typography>
			</Box>
			<Box
				sx={{
					bgcolor: 'common.white',
					p: 1.5,
					borderRadius: 2,
					ml: 4,
					boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
				}}
			>
				<Typography sx={{ fontSize: 12, color: 'grey.900', fontWeight: 500 }}>
					Thanks! Yes, check our bio link. 🚀
				</Typography>
			</Box>
		</Box>
	);
};

const UnifiedInboxCard = () => {
	return (
		<Box
			component={m.div}
			whileHover={{ y: -10, rotate: 0.4 }}
			transition={{ type: 'spring', stiffness: 260, damping: 22 }}
			sx={(theme) => {
				return {
					gridColumn: { md: 'span 2' },
					bgcolor: '#242424',
					color: 'common.white',
					borderRadius: '32px',
					p: 5,
					border: '1px solid rgba(255,255,255,0.05)',
					position: 'relative',
					overflow: 'hidden',
					'&:hover': {
						boxShadow: `0 25px 50px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.22)}`,
					},
				};
			}}
		>
			<Box
				sx={{
					position: 'absolute',
					inset: 0,
					backgroundImage: noiseOverlayUrl,
					opacity: 0.04,
					mixBlendMode: 'overlay',
					pointerEvents: 'none',
				}}
			/>
			<Box sx={{ position: 'relative', zIndex: 1, width: { md: '50%' } }}>
				<Typography
					component="h3"
					sx={{ fontSize: 24, fontWeight: 700, mb: 1.5 }}
				>
					One Unified Inbox
				</Typography>
				<Typography
					sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, mb: 3 }}
				>
					Reply to Instagram DMs, X mentions, and Facebook comments from a
					single, collaborative queue. Never miss a customer interaction again.
				</Typography>
				<Stack direction="row" alignItems="center" spacing={2}>
					<TeammateStack />
					<Typography sx={{ fontSize: 12, color: 'primary.lighter' }}>
						Assign tickets to team members
					</Typography>
				</Stack>
			</Box>
			<InboxMock />
		</Box>
	);
};

const FeaturesGrid = () => {
	return (
		<Box
			sx={{
				display: 'grid',
				gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
				gap: 3,
			}}
		>
			<CalendarFeatureCard />
			<AiCaptionCard />
			<AnalyticsCard />
			<UnifiedInboxCard />
		</Box>
	);
};

export const HomeFeatures = () => {
	return (
		<Box
			component="section"
			id="features"
			sx={{ py: { xs: 12, md: 16 }, position: 'relative' }}
		>
			<Container maxWidth="lg" component={MotionViewport}>
				<FeatureHeader />
				<FeaturesGrid />
			</Container>
		</Box>
	);
};
