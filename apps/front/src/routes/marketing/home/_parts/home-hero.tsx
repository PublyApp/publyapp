import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';
import type { ReactNode } from 'react';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';

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

const curvedBgUrl =
	"url(\"data:image/svg+xml,%3Csvg width='1440' height='400' viewBox='0 0 1440 400' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M-30 200C250 350 450 -50 780 150C1110 350 1250 50 1500 250' stroke='%23E2E2E2' stroke-width='2' stroke-linecap='round' stroke-dasharray='8 8'/%3E%3C/svg%3E\")";

const queueItems = [
	{
		icon: 'ph:x-logo-fill',
		color: 'text.primary',
		bgcolor: 'action.hover',
		lineWidth: '75%',
		sublineWidth: '50%',
		time: 'Tue 9AM',
	},
	{
		icon: 'ph:instagram-logo-fill',
		color: '#E1306C',
		bgcolor: 'rgba(225, 48, 108, 0.10)',
		lineWidth: '100%',
		sublineWidth: '67%',
		time: 'Wed 2PM',
	},
];

const MotionButtonWrap = ({ children }: { children: ReactNode }) => {
	return (
		<Box
			component={m.div}
			initial="rest"
			animate="rest"
			whileHover="hover"
			whileTap={{ scale: 0.97 }}
			variants={{
				rest: { y: 0, scale: 1 },
				hover: { y: -6, scale: 1.04 },
			}}
			transition={{ type: 'spring', stiffness: 400, damping: 18 }}
			sx={{ display: 'inline-flex' }}
		>
			{children}
		</Box>
	);
};

const HeroGlows = () => {
	return (
		<>
			<Box
				sx={(theme) => {
					return {
						position: 'absolute',
						// Use fixed offsets instead of percentage positioning. This
						// keeps decorative glows stable while streamed content changes
						// the hero section height during first load.
						top: { xs: 120, md: 180 },
						left: '25%',
						width: 384,
						height: 384,
						bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.18),
						borderRadius: '50%',
						filter: 'blur(120px)',
						zIndex: -1,
						pointerEvents: 'none',
					};
				}}
			/>
			<Box
				sx={(theme) => {
					return {
						position: 'absolute',
						// Keep this independent from section height for the same reason
						// as the primary glow above: percentage bottom shifts during SSR
						// streaming as more homepage sections arrive.
						top: { xs: 360, md: 420 },
						right: '25%',
						width: 384,
						height: 384,
						bgcolor: varAlpha(theme.vars.palette.secondary.mainChannel, 0.12),
						borderRadius: '50%',
						filter: 'blur(120px)',
						zIndex: -1,
						pointerEvents: 'none',
					};
				}}
			/>
		</>
	);
};

const HeroBadge = () => {
	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={1}
			sx={{
				display: 'inline-flex',
				px: 2,
				py: 1,
				bgcolor: 'background.paper',
				borderRadius: 999,
				boxShadow: '0 12px 24px -8px rgba(17,24,39,0.05)',
				border: '1px solid',
				borderColor: 'divider',
				mb: 4,
			}}
		>
			<Box
				sx={{
					width: 20,
					height: 20,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					borderRadius: '50%',
					bgcolor: 'primary.lighter',
					color: 'primary.main',
				}}
			>
				<Iconify width={12} icon={'ph:rocket-launch-fill' as never} />
			</Box>
			<Typography sx={{ fontSize: 14, fontWeight: 600 }}>
				Built for Social Teams
			</Typography>
		</Stack>
	);
};

const HeroHeadline = () => {
	return (
		<Typography
			component="h1"
			sx={{
				fontWeight: 800,
				letterSpacing: '-0.02em',
				color: 'text.primary',
				lineHeight: 1.1,
				fontSize: { xs: 48, md: 78 },
				maxWidth: 880,
				mx: 'auto',
				mb: 3,
			}}
		>
			Turn Your Followers
			<br />
			Into{' '}
			<Box component="span" sx={{ position: 'relative', whiteSpace: 'nowrap' }}>
				<Box component="span" sx={textGradientSx}>
					Brand Advocates
				</Box>
				<Box
					component="svg"
					viewBox="0 0 200 9"
					fill="none"
					sx={(theme) => {
						return {
							position: 'absolute',
							left: 0,
							bottom: { xs: -8, md: -16 },
							width: '100%',
							height: { xs: 12, md: 20 },
							color: varAlpha(theme.vars.palette.primary.mainChannel, 0.2),
							zIndex: -1,
						};
					}}
				>
					<path
						d="M2.0002 6.55135C58.3888 1.55134 140.231 -1.44866 198.001 6.55135"
						stroke="currentColor"
						strokeWidth="3"
						strokeLinecap="round"
					/>
				</Box>
			</Box>
		</Typography>
	);
};

const PrimaryHeroButton = () => {
	return (
		<MotionButtonWrap>
			<Button
				component={RouterLink}
				href={FRONT_PATH_NAMES.auth.signup}
				size="large"
				variant="contained"
				sx={(theme) => {
					return {
						bgcolor: 'grey.900',
						color: 'common.white',
						px: 6,
						py: 2.75,
						borderRadius: 2,
						fontWeight: 600,
						fontSize: 20,
						boxShadow: '0 12px 24px -8px rgba(17,24,39,0.20)',
						'&:hover': { bgcolor: 'grey.900' },
						...theme.applyStyles('dark', {
							bgcolor: 'common.white',
							color: 'grey.900',
							'&:hover': { bgcolor: 'common.white' },
						}),
					};
				}}
			>
				Start Your Free Trial
			</Button>
		</MotionButtonWrap>
	);
};

const DemoButton = () => {
	return (
		<Button
			component={m.button}
			size="large"
			variant="outlined"
			initial="rest"
			animate="rest"
			whileHover="hover"
			whileTap={{ scale: 0.97 }}
			variants={{
				rest: { y: 0, scale: 1 },
				hover: { y: -6, scale: 1.04 },
			}}
			transition={{ type: 'spring', stiffness: 400, damping: 18 }}
			startIcon={
				<Box
					component={m.span}
					variants={{
						rest: { scale: 1, rotate: 0 },
						hover: { scale: 1.2, rotate: 8 },
					}}
					transition={{ type: 'spring', stiffness: 500, damping: 14 }}
					sx={{ display: 'inline-flex' }}
				>
					<Iconify
						width={24}
						icon={'ph:play-circle-fill' as never}
						sx={{ color: 'primary.main' }}
					/>
				</Box>
			}
			sx={{
				bgcolor: 'background.paper',
				backdropFilter: 'blur(12px)',
				borderColor: 'divider',
				color: 'text.primary',
				px: 6,
				py: 2.75,
				borderRadius: 2,
				fontWeight: 600,
				fontSize: 20,
				'&:hover': {
					bgcolor: 'background.paper',
					color: 'text.primary',
					borderColor: 'divider',
					boxShadow: '0 16px 32px -10px rgba(17,24,39,0.18)',
				},
			}}
		>
			Watch Demo
		</Button>
	);
};

const HeroActions = () => {
	return (
		<Stack
			direction={{ xs: 'column', sm: 'row' }}
			spacing={2}
			sx={{ alignItems: 'center', justifyContent: 'center' }}
		>
			<PrimaryHeroButton />
			<DemoButton />
		</Stack>
	);
};

const FloatingCreatorCard = () => {
	return (
		<Box
			component={m.div}
			animate={{ y: [0, -12, 0] }}
			transition={{
				duration: 6,
				ease: 'easeInOut',
				repeat: Number.POSITIVE_INFINITY,
			}}
			sx={{
				position: 'absolute',
				top: '25%',
				left: '10%',
				bgcolor: 'background.paper',
				p: 1.5,
				borderRadius: '20px',
				boxShadow: '0 20px 40px -4px rgba(17,24,39,0.08)',
				border: '1px solid',
				borderColor: 'divider',
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
			}}
		>
			<Avatar
				sx={{ width: 40, height: 40, bgcolor: 'grey.200' }}
				src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80"
				alt="Sarah"
			/>
			<Box>
				<Typography sx={{ fontSize: 12, fontWeight: 700 }}>
					@sarahcreates
				</Typography>
				<Typography sx={{ fontSize: 10, color: 'text.secondary' }}>
					Drafting Content...
				</Typography>
			</Box>
		</Box>
	);
};

const QueueItem = ({
	icon,
	color,
	bgcolor,
	lineWidth,
	sublineWidth,
	time,
}: {
	icon: string;
	color: string;
	bgcolor: string;
	lineWidth: string;
	sublineWidth: string;
	time: string;
}) => {
	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={1}
			sx={{
				bgcolor: 'background.paper',
				p: 1,
				borderRadius: 1.5,
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Box
				sx={{
					width: 24,
					height: 24,
					borderRadius: 0.5,
					bgcolor,
					color,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<Iconify icon={icon as never} width={14} />
			</Box>
			<Box sx={{ flex: 1 }}>
				<Box
					sx={{
						height: 8,
						width: lineWidth,
						bgcolor: 'action.disabledBackground',
						borderRadius: 999,
						mb: 0.5,
					}}
				/>
				<Box
					sx={{
						height: 6,
						width: sublineWidth,
						bgcolor: 'action.hover',
						borderRadius: 999,
					}}
				/>
			</Box>
			<Typography
				sx={{
					fontSize: 9,
					fontWeight: 700,
					color: 'primary.main',
					bgcolor: 'primary.lighter',
					px: 1,
					py: 0.25,
					borderRadius: 999,
				}}
			>
				{time}
			</Typography>
		</Stack>
	);
};

const QueueCard = () => {
	return (
		<Box
			sx={(theme) => {
				return {
					position: 'absolute',
					top: '50%',
					left: '50%',
					transform: 'translate(-50%, -50%)',
					bgcolor: varAlpha(theme.vars.palette.background.paperChannel, 0.7),
					backdropFilter: 'blur(24px)',
					p: 2.5,
					borderRadius: '24px',
					boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
					border: '1px solid',
					borderColor: 'divider',
					width: 320,
					zIndex: 2,
				};
			}}
		>
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="space-between"
				sx={{ mb: 2 }}
			>
				<Typography sx={{ fontSize: 14, fontWeight: 700 }}>
					Next Week's Queue
				</Typography>
				<Iconify
					icon={'ph:calendar-check-fill' as never}
					sx={{ color: 'primary.main' }}
				/>
			</Stack>
			<Stack spacing={1}>
				{queueItems.map((item) => {
					return <QueueItem key={item.time} {...item} />;
				})}
			</Stack>
		</Box>
	);
};

const EngagementCard = () => {
	return (
		<Box
			component={m.div}
			animate={{ y: [0, -10, 0] }}
			transition={{
				duration: 7,
				ease: 'easeInOut',
				repeat: Number.POSITIVE_INFINITY,
				delay: 2,
			}}
			sx={{
				position: 'absolute',
				top: '15%',
				right: '20%',
				bgcolor: 'background.paper',
				p: 1.5,
				borderRadius: '20px',
				boxShadow: '0 20px 40px -4px rgba(17,24,39,0.08)',
				border: '1px solid',
				borderColor: 'divider',
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
			}}
		>
			<Box sx={{ position: 'relative' }}>
				<Box
					sx={{
						width: 48,
						height: 48,
						borderRadius: '50%',
						background: 'linear-gradient(45deg, #FF0080 0%, #7928CA 100%)',
						p: '2px',
					}}
				>
					<Avatar
						sx={{
							width: '100%',
							height: '100%',
							border: '2px solid',
							borderColor: 'background.paper',
						}}
						src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=100&q=80"
						alt="Post"
					/>
				</Box>
				<Box
					sx={{
						position: 'absolute',
						bottom: -4,
						right: -4,
						width: 20,
						height: 20,
						bgcolor: 'success.main',
						borderRadius: '50%',
						border: '2px solid',
						borderColor: 'background.paper',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Iconify
						icon={'ph:check-bold' as never}
						width={10}
						sx={{ color: 'common.white' }}
					/>
				</Box>
			</Box>
			<Box>
				<Typography sx={{ fontSize: 12, fontWeight: 700 }}>
					+2,400 Likes
				</Typography>
				<Typography
					sx={{ fontSize: 10, color: 'success.dark', fontWeight: 600 }}
				>
					Going Viral
				</Typography>
			</Box>
		</Box>
	);
};

const FollowersCard = () => {
	return (
		<Box
			component={m.div}
			animate={{ y: [0, -12, 0] }}
			transition={{
				duration: 6,
				ease: 'easeInOut',
				repeat: Number.POSITIVE_INFINITY,
				delay: 1,
			}}
			sx={{
				position: 'absolute',
				bottom: '20%',
				right: '15%',
				bgcolor: 'background.paper',
				px: 2,
				py: 1.5,
				borderRadius: '20px',
				boxShadow: '0 20px 40px -4px rgba(17,24,39,0.08)',
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
				<Iconify
					icon={'ph:trend-up-fill' as never}
					sx={{ color: 'secondary.main' }}
					width={14}
				/>
				<Typography
					sx={{
						fontSize: 10,
						color: 'text.secondary',
						fontWeight: 700,
						textTransform: 'uppercase',
						letterSpacing: '0.1em',
					}}
				>
					Followers
				</Typography>
			</Stack>
			<Typography sx={{ fontSize: 20, fontWeight: 800 }}>12.5K</Typography>
		</Box>
	);
};

const WorkflowGraphic = () => {
	return (
		<Box
			sx={{
				position: 'relative',
				width: '100%',
				maxWidth: 1152,
				mx: 'auto',
				mt: 10,
				height: 400,
				display: { xs: 'none', md: 'block' },
				backgroundImage: curvedBgUrl,
				backgroundRepeat: 'no-repeat',
				backgroundPosition: 'center',
			}}
		>
			<FloatingCreatorCard />
			<QueueCard />
			<EngagementCard />
			<FollowersCard />
		</Box>
	);
};

export const HomeHero = () => {
	return (
		<Box
			component="section"
			sx={(theme) => {
				return {
					position: 'relative',
					overflow: 'hidden',
					pt: { xs: 14, md: 18 },
					pb: { xs: 12, md: 16 },
					minHeight: { md: '90vh' },
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					bgcolor: 'background.default',
					backgroundImage: `radial-gradient(at 10% 20%, ${varAlpha(theme.vars.palette.primary.mainChannel, 0.12)} 0px, transparent 50%), radial-gradient(at 90% 80%, ${varAlpha(theme.vars.palette.secondary.mainChannel, 0.08)} 0px, transparent 50%)`,
				};
			}}
		>
			<HeroGlows />
			<Container
				maxWidth="lg"
				sx={{ position: 'relative', textAlign: 'center', zIndex: 1 }}
			>
				<HeroBadge />
				<HeroHeadline />
				<Typography
					sx={{
						fontSize: { xs: 18, md: 20 },
						color: 'text.secondary',
						maxWidth: 640,
						mx: 'auto',
						mb: 5,
						lineHeight: 1.6,
						fontWeight: 500,
					}}
				>
					From ideation to execution: master your social calendar, auto-publish
					across platforms, and grow your audience on autopilot.
				</Typography>
				<HeroActions />
			</Container>
			<WorkflowGraphic />
		</Box>
	);
};
