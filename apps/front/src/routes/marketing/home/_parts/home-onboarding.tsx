import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import type { ReactNode } from 'react';

import { MotionViewport, varFade } from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

type StepTone = {
	main: string;
	dark: string;
	rgb: string;
};

type PlatformTilePosition = {
	top?: string;
	right?: string;
	bottom?: string;
	left?: string;
};

const STEP_TONES: Record<'one' | 'two' | 'three', StepTone> = {
	one: { main: '#F97316', dark: '#C2410C', rgb: '249, 115, 22' },
	two: { main: '#A855F7', dark: '#7E22CE', rgb: '168, 85, 247' },
	three: { main: '#14B8A6', dark: '#0F766E', rgb: '20, 184, 166' },
};

const toneAlpha = (tone: StepTone, alpha: number) => {
	return `rgba(${tone.rgb}, ${alpha})`;
};

const toneGradientSx = (tone: StepTone) => {
	return {
		background: `linear-gradient(180deg, ${tone.main} 0%, ${tone.dark} 100%)`,
		WebkitBackgroundClip: 'text',
		WebkitTextFillColor: 'transparent',
		backgroundClip: 'text',
		color: 'transparent',
	} as const;
};

const platformTiles = [
	{
		key: 'linkedin',
		icon: 'ph:linkedin-logo-fill',
		color: '#0A66C2',
		position: { top: '15%', left: '5%' },
		opacity: 0.6,
		delay: 0,
		distance: -12,
	},
	{
		key: 'tiktok',
		icon: 'ph:tiktok-logo-fill',
		color: 'common.black',
		position: { top: '20%', right: '10%' },
		opacity: 0.4,
		delay: 2,
		distance: -10,
	},
	{
		key: 'x',
		icon: 'ph:x-logo-fill',
		color: 'common.black',
		position: { bottom: '10%', right: '20%' },
		opacity: 0.5,
		delay: 1,
		distance: -12,
	},
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

const StepBadge = ({ label, tone }: { label: string; tone: StepTone }) => {
	return (
		<Box
			sx={{
				display: 'inline-block',
				bgcolor: tone.main,
				color: 'common.white',
				fontSize: 10,
				fontWeight: 700,
				px: 1.5,
				py: 0.75,
				borderRadius: 999,
				mb: 2,
				textTransform: 'uppercase',
				letterSpacing: '0.1em',
			}}
		>
			{label}
		</Box>
	);
};

const WatermarkNumeral = ({
	value,
	side,
	tone,
	intensity,
}: {
	value: string;
	side: 'left' | 'right';
	tone: StepTone;
	intensity: number;
}) => {
	return (
		<Box
			sx={{
				position: 'absolute',
				top: -40,
				...(side === 'left' ? { left: -24 } : { right: -24 }),
				fontSize: 180,
				fontWeight: 900,
				lineHeight: 1,
				background: `linear-gradient(to bottom, ${toneAlpha(tone, intensity)}, transparent)`,
				WebkitBackgroundClip: 'text',
				WebkitTextFillColor: 'transparent',
				backgroundClip: 'text',
				color: 'transparent',
				zIndex: 0,
				userSelect: 'none',
				pointerEvents: 'none',
			}}
		>
			{value}
		</Box>
	);
};

const stepCardSx: SxProps<Theme> = {
	bgcolor: 'background.paper',
	borderRadius: '32px',
	p: { xs: 4, md: 6 },
	display: 'flex',
	alignItems: 'center',
	gap: 5,
	position: 'relative',
	boxShadow: '0 12px 24px -8px rgba(17,24,39,0.05)',
	border: '1px solid',
	borderColor: 'divider',
	overflow: 'hidden',
	minHeight: { md: 420 },
	transition: 'box-shadow 0.18s cubic-bezier(0.32, 0.72, 0, 1)',
	'&:hover': {
		boxShadow: '0 20px 40px -8px rgba(0,0,0,0.10)',
	},
};

const OnboardingHeader = () => {
	return (
		<Box sx={{ textAlign: 'center', mb: 12 }}>
			<m.div variants={varFade('inUp', { distance: 24 })}>
				<SectionEyebrow label="How it works" />
			</m.div>

			<m.div variants={varFade('inUp', { distance: 24 })}>
				<Typography
					component="h2"
					sx={{ fontSize: { xs: 40, md: 48 }, fontWeight: 800, mb: 2 }}
				>
					Effortless Setup in
					<br />
					<Box
						component="span"
						sx={{ color: 'primary.main', display: 'inline-flex', gap: 1 }}
					>
						<Iconify icon={'ph:clock-countdown-fill' as never} width={36} />
						Minutes
					</Box>
				</Typography>
			</m.div>

			<m.div variants={varFade('inUp', { distance: 24 })}>
				<Typography sx={{ color: 'text.secondary' }}>
					Skip the heavy manuals. PublyApp is designed to get you publishing
					immediately.
				</Typography>
			</m.div>
		</Box>
	);
};

const StepCopy = ({
	label,
	title,
	description,
	tone,
}: {
	label: string;
	title: string;
	description: string;
	tone: StepTone;
}) => {
	return (
		<Box sx={{ position: 'relative', zIndex: 1, width: { md: '50%' } }}>
			<StepBadge label={label} tone={tone} />
			<Typography
				component="h3"
				sx={{ fontSize: 24, fontWeight: 700, mb: 1.5 }}
			>
				{title}
			</Typography>
			<Typography sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
				{description}
			</Typography>
		</Box>
	);
};

const VisualFrame = ({ children }: { children: ReactNode }) => {
	return (
		<Box
			sx={{
				position: 'relative',
				zIndex: 1,
				width: { xs: '100%', md: '50%' },
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: 320,
			}}
		>
			{children}
		</Box>
	);
};

const PlatformTile = ({
	icon,
	color,
	position,
	opacity,
	delay,
	distance,
}: {
	icon: string;
	color: string;
	position: PlatformTilePosition;
	opacity: number;
	delay: number;
	distance: number;
}) => {
	return (
		<Box
			component={m.div}
			animate={{ y: [0, distance, 0] }}
			transition={{
				duration: delay === 2 ? 7 : 6,
				ease: 'easeInOut',
				repeat: Number.POSITIVE_INFINITY,
				delay,
			}}
			sx={{
				position: 'absolute',
				width: 36,
				height: 36,
				borderRadius: 1.5,
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 12px 24px -8px rgba(17,24,39,0.05)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				opacity,
				...position,
			}}
		>
			<Iconify icon={icon as never} sx={{ color }} width={20} />
		</Box>
	);
};

const ConnectPlatformsVisual = () => {
	return (
		<VisualFrame>
			<Box
				sx={{
					position: 'absolute',
					inset: 0,
					background: `radial-gradient(circle at 50% 50%, ${toneAlpha(STEP_TONES.one, 0.14)} 0%, transparent 70%)`,
				}}
			/>
			<Box
				sx={{
					position: 'absolute',
					top: '50%',
					left: '50%',
					transform: 'translate(-50%, -50%)',
					width: 220,
					height: 220,
					borderRadius: '50%',
					bgcolor: toneAlpha(STEP_TONES.one, 0.18),
					filter: 'blur(48px)',
				}}
			/>
			{platformTiles.map((tile) => {
				return (
					<PlatformTile
						key={tile.key}
						icon={tile.icon}
						color={tile.color}
						position={tile.position}
						opacity={tile.opacity}
						delay={tile.delay}
						distance={tile.distance}
					/>
				);
			})}
			<Stack
				spacing={3}
				alignItems="center"
				sx={{ position: 'relative', zIndex: 1 }}
			>
				<Box
					sx={{
						width: 96,
						height: 96,
						borderRadius: 3,
						background:
							'linear-gradient(45deg, #FFD600 0%, #FF0069 50%, #7638FA 100%)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						border: '2px solid rgba(255,255,255,0.5)',
						outline: `2px solid ${toneAlpha(STEP_TONES.one, 0.12)}`,
						outlineOffset: 2,
						boxShadow: `0 20px 40px -10px ${toneAlpha(STEP_TONES.one, 0.32)}`,
					}}
				>
					<Iconify
						icon={'ph:instagram-logo-bold' as never}
						width={48}
						sx={{ color: 'common.white' }}
					/>
				</Box>
				<Stack
					direction="row"
					alignItems="center"
					spacing={1}
					sx={{
						bgcolor: 'grey.900',
						color: 'common.white',
						px: 2,
						py: 1,
						borderRadius: 999,
						fontSize: 12,
						fontWeight: 700,
						boxShadow: `0 12px 24px -4px ${toneAlpha(STEP_TONES.one, 0.25)}`,
					}}
				>
					<Box
						component={m.span}
						animate={{ opacity: [1, 0.4, 1] }}
						transition={{
							duration: 2,
							repeat: Number.POSITIVE_INFINITY,
							ease: 'easeInOut',
						}}
						sx={{
							width: 8,
							height: 8,
							borderRadius: '50%',
							bgcolor: 'success.main',
						}}
					/>
					<Box component="span">Live & syncing</Box>
				</Stack>
			</Stack>
		</VisualFrame>
	);
};

const ContentQueueVisual = () => {
	return (
		<VisualFrame>
			<Box
				sx={{
					position: 'absolute',
					bottom: '5%',
					left: '50%',
					transform: 'translateX(-50%)',
					width: 288,
					height: 288,
					bgcolor: toneAlpha(STEP_TONES.two, 0.12),
					filter: 'blur(48px)',
					borderRadius: '50%',
				}}
			/>
			<Box
				component="svg"
				viewBox="0 0 340 160"
				fill="none"
				sx={{
					position: 'absolute',
					width: 340,
					height: 160,
					color: STEP_TONES.two.main,
					pointerEvents: 'none',
					mt: 5,
				}}
			>
				<path
					d="M 20 140 Q 150 160, 310 20"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeDasharray="6 6"
				/>
			</Box>
			<Box
				sx={{
					position: 'absolute',
					top: 88,
					right: 20,
					width: 20,
					height: 20,
					bgcolor: STEP_TONES.two.main,
					borderRadius: '50%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					boxShadow: `0 0 0 12px ${toneAlpha(STEP_TONES.two, 0.16)}`,
				}}
			>
				<Iconify
					icon={'ph:clock-bold' as never}
					width={10}
					sx={{ color: 'common.white' }}
				/>
			</Box>
			<PostQueueCard />
		</VisualFrame>
	);
};

const PostQueueCard = () => {
	return (
		<Box
			sx={{
				width: 300,
				height: 170,
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: `0 20px 60px -20px ${toneAlpha(STEP_TONES.two, 0.3)}`,
				borderRadius: 2,
				p: 2.5,
				display: 'flex',
				flexDirection: 'column',
				gap: 2,
				transform: 'rotate(-3deg)',
				transition: 'transform 0.7s ease',
				position: 'relative',
				zIndex: 1,
				'&:hover': { transform: 'rotate(0deg)' },
			}}
		>
			<Stack direction="row" alignItems="center" spacing={1.5}>
				<Box
					sx={{
						width: 44,
						height: 44,
						borderRadius: 1.5,
						background:
							'linear-gradient(45deg, #FFD600 0%, #FF0069 50%, #7638FA 100%)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						color: 'common.white',
					}}
				>
					<Iconify icon={'ph:instagram-logo-bold' as never} width={20} />
				</Box>
				<Box>
					<Typography sx={{ fontSize: 14, fontWeight: 700, mb: 0.25 }}>
						New collection drop
					</Typography>
					<Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
						Instagram • Reel
					</Typography>
				</Box>
			</Stack>
			<Stack spacing={1}>
				{['100%', '80%', '50%'].map((width) => {
					return (
						<Box
							key={width}
							sx={{
								height: 8,
								width,
								borderRadius: 999,
								bgcolor: 'rgba(31, 41, 55, 0.10)',
							}}
						/>
					);
				})}
			</Stack>
			<Box
				sx={{
					mt: 'auto',
					ml: 'auto',
					bgcolor: toneAlpha(STEP_TONES.two, 0.12),
					color: STEP_TONES.two.dark,
					fontSize: 10,
					fontWeight: 700,
					letterSpacing: '0.1em',
					px: 1.25,
					py: 0.5,
					borderRadius: 1,
				}}
			>
				TUE 9:00 AM
			</Box>
		</Box>
	);
};

const GrowthVisual = () => {
	return (
		<VisualFrame>
			<Box
				sx={{
					position: 'absolute',
					inset: 0,
					transform: 'scale(1.25)',
					background: `linear-gradient(45deg, ${toneAlpha(STEP_TONES.three, 0.22)}, transparent, ${toneAlpha(STEP_TONES.three, 0.1)})`,
					filter: 'blur(48px)',
				}}
			/>
			<Stack alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
				<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
					<Box
						sx={{
							bgcolor: 'success.lighter',
							color: 'success.dark',
							px: 1,
							py: 0.25,
							borderRadius: 999,
							fontSize: 10,
							fontWeight: 700,
						}}
					>
						↑ 12.4%
					</Box>
					<Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
						vs last week
					</Typography>
				</Stack>
				<Typography
					sx={[
						toneGradientSx(STEP_TONES.three),
						{ fontSize: { xs: 72, sm: 84 }, fontWeight: 900, lineHeight: 1 },
					]}
				>
					+1,204
				</Typography>
				<Box
					sx={{
						textTransform: 'uppercase',
						letterSpacing: '0.15em',
						fontWeight: 700,
						color: 'text.disabled',
						fontSize: 10,
						mt: 2,
						bgcolor: 'rgba(255,255,255,0.7)',
						backdropFilter: 'blur(4px)',
						px: 1.5,
						py: 0.75,
						borderRadius: 999,
					}}
				>
					New followers — last 7 days
				</Box>
			</Stack>
			<Sparkline />
		</VisualFrame>
	);
};

const Sparkline = () => {
	return (
		<Box
			sx={{
				position: 'absolute',
				bottom: '10%',
				left: '50%',
				transform: 'translateX(-50%)',
				width: 280,
				height: 80,
				pointerEvents: 'none',
			}}
		>
			<Box
				component="svg"
				viewBox="0 0 280 80"
				fill="none"
				sx={{
					width: '100%',
					height: '100%',
					overflow: 'visible',
					color: STEP_TONES.three.main,
				}}
			>
				<defs>
					<linearGradient id="sparkFill-step3" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
						<stop offset="100%" stopColor="currentColor" stopOpacity="0" />
					</linearGradient>
				</defs>
				<path
					d="M 0 60 Q 40 50, 100 40 T 200 25 T 270 5 L 280 5 L 280 80 L 0 80 Z"
					fill="url(#sparkFill-step3)"
				/>
				<path
					d="M 0 60 Q 40 50, 100 40 T 200 25 T 270 5 L 280 5"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeLinecap="round"
				/>
			</Box>
			<Box
				sx={{
					position: 'absolute',
					top: '3px',
					right: '-2px',
					width: 10,
					height: 10,
					bgcolor: STEP_TONES.three.main,
					borderRadius: '50%',
					boxShadow: `0 0 0 4px ${toneAlpha(STEP_TONES.three, 0.25)}`,
				}}
			/>
		</Box>
	);
};

const OnboardingStep = ({
	number,
	side,
	tone,
	label,
	title,
	description,
	reverse,
	children,
}: {
	number: string;
	side: 'left' | 'right';
	tone: StepTone;
	label: string;
	title: string;
	description: string;
	reverse?: boolean;
	children: ReactNode;
}) => {
	return (
		<m.div variants={varFade('inUp', { distance: 24 })}>
			<Box
				component={m.div}
				whileHover={{ y: -8, scale: 1.01 }}
				transition={{ type: 'spring', stiffness: 400, damping: 18 }}
				sx={[
					stepCardSx,
					{
						flexDirection: {
							xs: 'column',
							md: reverse ? 'row-reverse' : 'row',
						},
					},
				]}
			>
				<WatermarkNumeral
					value={number}
					side={side}
					tone={tone}
					intensity={0.08}
				/>
				<StepCopy
					label={label}
					title={title}
					description={description}
					tone={tone}
				/>
				{children}
			</Box>
		</m.div>
	);
};

export const HomeOnboarding = () => {
	return (
		<Box
			component="section"
			id="onboarding"
			sx={{
				py: { xs: 12, md: 16 },
				bgcolor: 'background.default',
				position: 'relative',
				overflow: 'hidden',
			}}
		>
			<Container maxWidth="md" component={MotionViewport}>
				<OnboardingHeader />
				<Stack spacing={6}>
					<OnboardingStep
						number="01"
						side="left"
						tone={STEP_TONES.one}
						label="Step 1"
						title="Connect your platforms"
						description="Securely authenticate your social profiles with one click. We support all major networks natively with zero-downtime APIs."
					>
						<ConnectPlatformsVisual />
					</OnboardingStep>
					<OnboardingStep
						number="02"
						side="right"
						tone={STEP_TONES.two}
						label="Step 2"
						title="Build your content queues"
						description="Set up custom time slots for different types of content. Let our algorithm find the optimal times for your specific audience."
						reverse
					>
						<ContentQueueVisual />
					</OnboardingStep>
					<OnboardingStep
						number="03"
						side="left"
						tone={STEP_TONES.three}
						label="Step 3"
						title="Grow on autopilot"
						description="Watch the metrics roll in. Our smart system recycles your best performing evergreen content so your feeds are never empty."
					>
						<GrowthVisual />
					</OnboardingStep>
				</Stack>
			</Container>
		</Box>
	);
};
