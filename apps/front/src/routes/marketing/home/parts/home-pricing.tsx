import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';
import { useState } from 'react';

import { MotionViewport, varFade } from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

const noiseOverlayUrl =
	"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

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

type CreatorFeature = { label: string; included: boolean };

const CREATOR_FEATURES: CreatorFeature[] = [
	{ label: '1 User Workspace', included: true },
	{ label: 'Up to 5 Social Profiles', included: true },
	{ label: '100 Scheduled Posts/mo', included: true },
	{ label: 'Basic AI Caption Writing', included: true },
	{ label: 'Advanced Revenue Analytics', included: false },
];

const SCALE_FEATURES = [
	'5 User Workspaces',
	'Unlimited Social Profiles',
	'Unlimited Scheduled Posts',
	'Advanced AI Tone Match',
	'Deep Revenue Analytics',
	'Unified Inbox Tool',
];

const ASSURANCES = [
	'Cancel anytime',
	'No credit card for trial',
	'Priority email support',
];

const CREATOR_PRICE = { monthly: 19, annually: 15 };
const SCALE_PRICE = { monthly: 49, annually: 39 };

const TRACK_W = 288;
const TRACK_H = 44;
const THUMB_W = 136;
const THUMB_OFFSET_X = 8;
const THUMB_OFFSET_Y = 4;
const THUMB_LEFT_CHECKED = TRACK_W - THUMB_OFFSET_X - THUMB_W;

const BillingSwitch = styled(Switch)(() => {
	return {
		width: TRACK_W,
		height: TRACK_H,
		padding: 0,
		overflow: 'visible',
		'& .MuiSwitch-switchBase': {
			padding: 0,
			top: THUMB_OFFSET_Y,
			left: THUMB_OFFSET_X,
			width: THUMB_W,
			height: TRACK_H - THUMB_OFFSET_Y * 2,
			transform: 'none',
			transition: 'left 320ms cubic-bezier(0.4, 0, 0.2, 1)',
			'&.Mui-checked': {
				transform: 'none',
				left: THUMB_LEFT_CHECKED,
				'& + .MuiSwitch-track': {
					backgroundColor: '#FFFFFF',
					opacity: 1,
				},
			},
			'&:hover, &.Mui-checked:hover': {
				backgroundColor: 'transparent',
			},
		},
		'& .MuiSwitch-thumb': {
			width: THUMB_W,
			height: TRACK_H - THUMB_OFFSET_Y * 2,
			borderRadius: 999,
			backgroundColor: '#242424',
			boxShadow: '0 4px 12px -2px rgba(17, 24, 39, 0.25)',
		},
		'& .MuiSwitch-track': {
			borderRadius: 999,
			backgroundColor: '#FFFFFF',
			border: '1px solid rgba(17, 24, 39, 0.08)',
			opacity: 1,
			boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.02)',
		},
	};
});

const PricingHalo = () => {
	return (
		<Box
			sx={(theme) => {
				return {
					position: 'absolute',
					top: 0,
					right: '25%',
					width: 600,
					height: 600,
					background: `linear-gradient(to bottom, ${varAlpha(theme.vars.palette.primary.mainChannel, 0.18)}, transparent)`,
					borderRadius: '50%',
					filter: 'blur(100px)',
					opacity: 0.6,
					zIndex: -1,
					pointerEvents: 'none',
				};
			}}
		/>
	);
};

const BillingCycleToggle = ({
	annual,
	onAnnualChange,
}: {
	annual: boolean;
	onAnnualChange: (value: boolean) => void;
}) => {
	return (
		<Box sx={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
			<BillingSwitch
				id="billing-cycle-switch"
				checked={annual}
				onChange={(_e, checked) => {
					return onAnnualChange(checked);
				}}
				inputProps={{ 'aria-label': 'Toggle annual billing' }}
			/>
			<Stack
				direction="row"
				sx={{
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
					zIndex: 2,
				}}
			>
				<Box
					onClick={() => {
						return onAnnualChange(false);
					}}
					sx={{
						flex: 1,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						cursor: 'pointer',
						pointerEvents: 'auto',
						fontSize: 14,
						fontWeight: 700,
						color: annual ? 'text.secondary' : 'common.white',
						transition: 'color 0.3s ease',
					}}
				>
					Monthly
				</Box>
				<Box
					onClick={() => {
						return onAnnualChange(true);
					}}
					sx={{
						flex: 1,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 0.75,
						cursor: 'pointer',
						pointerEvents: 'auto',
						fontSize: 14,
						fontWeight: 700,
						color: annual ? 'common.white' : 'text.secondary',
						transition: 'color 0.3s ease',
					}}
				>
					<Box component="span">Annually</Box>
					<Box
						component="span"
						sx={{
							fontSize: 10,
							color: annual ? 'common.white' : 'secondary.main',
							bgcolor: annual ? 'rgba(255,255,255,0.18)' : 'secondary.lighter',
							px: 0.75,
							py: 0.25,
							borderRadius: 999,
							fontWeight: 800,
							lineHeight: 1.2,
							transition: 'all 0.3s ease',
						}}
					>
						-20%
					</Box>
				</Box>
			</Stack>
		</Box>
	);
};

const PricingHeader = ({
	annual,
	onAnnualChange,
}: {
	annual: boolean;
	onAnnualChange: (value: boolean) => void;
}) => {
	return (
		<Box sx={{ textAlign: 'center', mb: 8, position: 'relative', zIndex: 1 }}>
			<m.div variants={varFade('inUp', { distance: 24 })}>
				<SectionEyebrow label="Pricing" />
			</m.div>

			<m.div variants={varFade('inUp', { distance: 24 })}>
				<Typography
					component="h2"
					sx={{
						fontSize: { xs: 40, md: 48 },
						fontWeight: 800,
						mb: 2,
						color: 'text.primary',
						letterSpacing: '-0.02em',
					}}
				>
					Simple, Transparent{' '}
					<Box component="span" sx={{ color: 'primary.main' }}>
						Pricing
					</Box>
				</Typography>
			</m.div>

			<m.div variants={varFade('inUp', { distance: 24 })}>
				<Typography
					sx={{
						fontSize: 18,
						color: 'text.secondary',
						maxWidth: 480,
						mx: 'auto',
						mb: 5,
					}}
				>
					Start for free, upgrade when you need more power. No hidden fees ever.
				</Typography>
			</m.div>

			<m.div variants={varFade('inUp', { distance: 24 })}>
				<BillingCycleToggle annual={annual} onAnnualChange={onAnnualChange} />
			</m.div>
		</Box>
	);
};

const CreatorFeatureItem = ({ feature }: { feature: CreatorFeature }) => {
	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={1.5}
			sx={{
				fontSize: 14,
				fontWeight: 500,
				...(feature.included ? {} : { color: 'text.disabled' }),
			}}
		>
			<Box
				sx={{
					width: 20,
					height: 20,
					borderRadius: '50%',
					bgcolor: feature.included ? 'success.lighter' : 'rgba(0, 0, 0, 0.05)',
					color: feature.included ? 'success.main' : 'text.disabled',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<Iconify
					icon={(feature.included ? 'ph:check-bold' : 'ph:x-bold') as never}
					width={10}
				/>
			</Box>
			<Box component="span">{feature.label}</Box>
		</Stack>
	);
};

const ScaleFeatureItem = ({ label }: { label: string }) => {
	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={1.5}
			sx={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}
		>
			<Box
				sx={(theme) => {
					return {
						width: 20,
						height: 20,
						borderRadius: '50%',
						bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.3),
						color: 'primary.lighter',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					};
				}}
			>
				<Iconify icon={'ph:check-bold' as never} width={10} />
			</Box>
			<Box component="span">{label}</Box>
		</Stack>
	);
};

const CreatorPlanCard = ({ price }: { price: number }) => {
	return (
		<m.div variants={varFade('inUp', { distance: 24 })}>
			<Box
				component={m.div}
				whileHover={{ y: -12, scale: 1.02 }}
				transition={{ type: 'spring', stiffness: 280, damping: 20 }}
				sx={{
					bgcolor: 'background.paper',
					borderRadius: '32px',
					p: 5,
					boxShadow: '0 12px 24px -8px rgba(17,24,39,0.05)',
					border: '1px solid',
					borderColor: 'divider',
					position: 'relative',
					display: 'flex',
					flexDirection: 'column',
					height: '100%',
				}}
			>
				<Typography
					component="h3"
					sx={{ fontSize: 24, fontWeight: 700, mb: 1 }}
				>
					Creator
				</Typography>
				<Typography
					sx={{
						fontSize: 14,
						color: 'text.secondary',
						mb: 3,
						pb: 3,
						borderBottom: '1px solid',
						borderBottomColor: 'divider',
					}}
				>
					Perfect for solo creators and emerging brands.
				</Typography>
				<Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 4 }}>
					<Typography
						sx={{ fontSize: 48, fontWeight: 900, color: 'text.primary' }}
					>
						{`$${price}`}
					</Typography>
					<Typography sx={{ color: 'text.secondary', fontSize: 18 }}>
						/mo
					</Typography>
				</Stack>
				<Stack spacing={2} sx={{ mb: 5, flex: 1 }}>
					{CREATOR_FEATURES.map((feature) => {
						return <CreatorFeatureItem key={feature.label} feature={feature} />;
					})}
				</Stack>
				<Button
					fullWidth
					size="large"
					sx={(theme) => {
						return {
							borderRadius: 2,
							fontWeight: 700,
							bgcolor: 'grey.900',
							color: 'common.white',
							mt: 'auto',
							transition: 'transform 0.3s ease, box-shadow 0.3s ease',
							'&:hover': {
								bgcolor: 'grey.900',
								transform: 'translateY(-2px)',
								boxShadow: '0 12px 24px -8px rgba(17,24,39,0.30)',
							},
							...theme.applyStyles('dark', {
								bgcolor: 'common.white',
								color: 'grey.900',
								'&:hover': {
									bgcolor: 'common.white',
									transform: 'translateY(-2px)',
									boxShadow: '0 12px 24px -8px rgba(0,0,0,0.40)',
								},
							}),
						};
					}}
				>
					Start 14-Day Trial
				</Button>
			</Box>
		</m.div>
	);
};

const ScalePlanCard = ({ price }: { price: number }) => {
	return (
		<m.div variants={varFade('inUp', { distance: 24 })}>
			<Box
				component={m.div}
				whileHover={{ y: -14, scale: 1.025 }}
				transition={{ type: 'spring', stiffness: 260, damping: 20 }}
				sx={(theme) => {
					return {
						bgcolor: '#242424',
						color: 'common.white',
						borderRadius: '32px',
						p: 5,
						boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
						position: 'relative',
						overflow: 'hidden',
						transition: 'box-shadow 0.4s ease',
						display: 'flex',
						flexDirection: 'column',
						border: '1px solid rgba(255,255,255,0.10)',
						height: '100%',
						'&:hover': {
							boxShadow: `0 30px 60px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.32)}`,
						},
					};
				}}
			>
				<ScaleCardDecor />
				<Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flex: 1 }}>
					<Stack sx={{ flex: 1 }}>
						<Typography component="h3" sx={{ fontSize: 24, fontWeight: 700 }}>
							Scale
						</Typography>
						<Typography
							sx={{
								fontSize: 14,
								color: 'rgba(255,255,255,0.6)',
								mb: 3,
								pb: 3,
								borderBottom: '1px solid rgba(255,255,255,0.10)',
							}}
						>
							For growing teams, agencies, and heavy-duty publishers.
						</Typography>
						<Stack
							direction="row"
							alignItems="baseline"
							spacing={1}
							sx={{ mb: 4 }}
						>
							<Typography sx={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>
								{`$${price}`}
							</Typography>
							<Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }}>
								/mo
							</Typography>
						</Stack>
						<Stack spacing={2} sx={{ mb: 5, flex: 1 }}>
							{SCALE_FEATURES.map((label) => {
								return <ScaleFeatureItem key={label} label={label} />;
							})}
						</Stack>
						<Button
							fullWidth
							size="large"
							sx={(theme) => {
								return {
									borderRadius: 2,
									fontWeight: 700,
									bgcolor: 'primary.main',
									color: 'common.white',
									boxShadow: `0 10px 30px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.3)}`,
									mt: 'auto',
									'&:hover': {
										bgcolor: 'primary.main',
										transform: 'translateY(-2px)',
										boxShadow: `0 16px 40px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.45)}`,
									},
								};
							}}
						>
							Get Started
						</Button>
					</Stack>
				</Box>
			</Box>
		</m.div>
	);
};

const ScaleCardDecor = () => {
	return (
		<>
			<Box
				sx={(theme) => {
					return {
						position: 'absolute',
						inset: 0,
						borderRadius: '32px',
						pointerEvents: 'none',
						background: `radial-gradient(circle at 100% 0%, ${varAlpha(theme.vars.palette.primary.mainChannel, 0.09)} 0%, transparent 35%)`,
					};
				}}
			/>
			<Box
				sx={{
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					height: '1px',
					background:
						'linear-gradient(to right, transparent, rgba(255,255,255,0.10), transparent)',
				}}
			/>
			<Box
				sx={{
					position: 'absolute',
					inset: 0,
					backgroundImage: noiseOverlayUrl,
					opacity: 0.04,
					mixBlendMode: 'overlay',
					pointerEvents: 'none',
					borderRadius: '32px',
				}}
			/>
			<Box
				sx={{
					position: 'absolute',
					top: 24,
					right: 24,
					bgcolor: 'primary.main',
					color: 'common.white',
					fontSize: 10,
					fontWeight: 700,
					px: 2,
					py: 0.75,
					borderRadius: 999,
					textTransform: 'uppercase',
					letterSpacing: '0.1em',
				}}
			>
				Most Popular
			</Box>
		</>
	);
};

const PricingPlans = ({ annual }: { annual: boolean }) => {
	const creatorPrice = annual ? CREATOR_PRICE.annually : CREATOR_PRICE.monthly;
	const scalePrice = annual ? SCALE_PRICE.annually : SCALE_PRICE.monthly;

	return (
		<Box
			sx={{
				display: 'grid',
				gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
				gap: 4,
				maxWidth: 880,
				mx: 'auto',
				position: 'relative',
				zIndex: 1,
			}}
		>
			<CreatorPlanCard price={creatorPrice} />
			<ScalePlanCard price={scalePrice} />
		</Box>
	);
};

const PricingAssurances = () => {
	return (
		<Stack
			direction="row"
			justifyContent="center"
			alignItems="center"
			sx={{
				mt: 8,
				flexWrap: 'wrap',
				gap: 4,
				fontSize: 14,
				color: 'text.secondary',
				fontWeight: 600,
				maxWidth: 640,
				mx: 'auto',
			}}
		>
			{ASSURANCES.map((label) => {
				return (
					<Stack key={label} direction="row" alignItems="center" spacing={1}>
						<Iconify
							icon={'ph:check-circle-fill' as never}
							sx={{ color: 'primary.main' }}
							width={16}
						/>
						<Box component="span">{label}</Box>
					</Stack>
				);
			})}
		</Stack>
	);
};

export const HomePricing = () => {
	const [annual, setAnnual] = useState(false);

	return (
		<Box
			component="section"
			id="pricing"
			sx={{
				py: { xs: 12, md: 16 },
				bgcolor: 'background.default',
				position: 'relative',
				overflow: 'hidden',
			}}
		>
			<PricingHalo />

			<Container maxWidth="lg" component={MotionViewport}>
				<PricingHeader annual={annual} onAnnualChange={setAnnual} />
				<PricingPlans annual={annual} />
				<PricingAssurances />
			</Container>
		</Box>
	);
};
