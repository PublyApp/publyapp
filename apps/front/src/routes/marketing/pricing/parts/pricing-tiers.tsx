import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import {
	type Billing,
	type PricingTier,
	TIERS,
} from '#app/routes/marketing/_data/pricing.ts';

// ----------------------------------------------------------------------

type PricingTiersProps = {
	billing: Billing;
};

const TRUST_SIGNALS = [
	'Cancel anytime',
	'No credit card for trial',
	'Priority email support',
];

const TierFeatureItem = ({
	label,
	highlighted,
}: {
	label: string;
	highlighted: boolean;
}) => {
	return (
		<Stack direction="row" alignItems="flex-start" spacing={1.5}>
			<Iconify
				icon="ph:check-circle-fill"
				width={18}
				sx={{ color: 'primary.main', mt: 0.25, flexShrink: 0 }}
			/>
			<Box
				component="span"
				sx={{
					fontSize: 14,
					fontWeight: 500,
					color: highlighted ? 'rgba(255,255,255,0.9)' : 'text.primary',
				}}
			>
				{label}
			</Box>
		</Stack>
	);
};

const TierCard = ({
	tier,
	billing,
}: {
	tier: PricingTier;
	billing: Billing;
}) => {
	const highlighted = !!tier.highlighted;
	const price = tier.pricing[billing];
	const isCustom = price === 'custom';
	const billingLabel =
		billing === 'monthly' ? 'Billed monthly' : 'Billed annually';

	let buttonSx: Record<string, unknown>;

	if (highlighted) {
		buttonSx = {
			bgcolor: 'primary.main',
			color: 'common.white',
			boxShadow: '0 10px 30px -10px rgba(16,185,129,0.4)',
			'&:hover': {
				transform: 'translateY(-1px)',
				boxShadow: '0 14px 36px -10px rgba(16,185,129,0.5)',
			},
		};
	} else if (tier.id === 'creator') {
		buttonSx = {
			bgcolor: '#242424',
			color: 'common.white',
			'&:hover': {
				transform: 'translateY(-1px)',
			},
		};
	} else {
		buttonSx = {
			bgcolor: 'background.paper',
			color: 'text.primary',
			border: '1px solid',
			borderColor: 'divider',
			'&:hover': {
				transform: 'translateY(-1px)',
			},
		};
	}

	const isMailto = tier.cta.href.startsWith('mailto:');

	return (
		<Box
			sx={{
				position: 'relative',
				bgcolor: highlighted ? '#242424' : 'background.paper',
				color: highlighted ? 'common.white' : 'text.primary',
				borderRadius: highlighted ? '24px' : '20px',
				border: '1px solid',
				borderColor: highlighted ? 'rgba(51,51,51,0.5)' : 'divider',
				p: { xs: 4, md: highlighted ? 5 : 4 },
				display: 'flex',
				flexDirection: 'column',
				height: '100%',
				mt: highlighted ? 0 : { xs: 1, md: 2 },
				transform: highlighted ? { md: 'translateY(-16px)' } : 'none',
				overflow: 'hidden',
				transition: 'transform 500ms, box-shadow 500ms',
				'&:hover': {
					transform: highlighted
						? { md: 'translateY(-20px)' }
						: 'translateY(-4px)',
					boxShadow: '0 20px 40px -15px rgba(31,41,55,0.12)',
				},
			}}
		>
			{/* Highlighted-only inner glow at top-right */}
			{highlighted && (
				<Box
					sx={{
						position: 'absolute',
						top: -96,
						right: -96,
						width: 256,
						height: 256,
						bgcolor: 'rgba(16,185,129,0.10)',
						borderRadius: '50%',
						filter: 'blur(60px)',
						pointerEvents: 'none',
					}}
				/>
			)}

			{/* Header: name + tagline + (highlighted only) "Most Popular" pill */}
			<Box
				sx={{
					position: 'relative',
					zIndex: 1,
					mb: 3,
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'flex-start',
					gap: 1,
				}}
			>
				<Box>
					<Typography
						component="h3"
						sx={{ fontSize: 20, fontWeight: 700, mb: 1 }}
					>
						{tier.name}
					</Typography>
					<Typography
						sx={{
							fontSize: 14,
							color: highlighted ? 'rgba(255,255,255,0.6)' : 'text.secondary',
						}}
					>
						{tier.tagline}
					</Typography>
				</Box>

				{highlighted && (
					<Box
						component="span"
						sx={{
							bgcolor: 'primary.main',
							color: 'common.white',
							px: 1.5,
							py: 0.5,
							fontSize: 10,
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							borderRadius: 999,
							flexShrink: 0,
							mt: 0.5,
						}}
					>
						Most Popular
					</Box>
				)}
			</Box>

			<Box
				sx={{
					borderTop: '1px solid',
					borderColor: highlighted ? 'rgba(255,255,255,0.1)' : 'divider',
					mb: 3,
				}}
			/>

			{/* Price block */}
			<Box sx={{ position: 'relative', zIndex: 1, mb: 4, minHeight: 60 }}>
				{isCustom ? (
					<Typography
						sx={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}
					>
						Let&apos;s talk
					</Typography>
				) : (
					<Stack direction="row" alignItems="flex-end" spacing={0.5}>
						<Typography sx={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>
							$
						</Typography>
						<Typography
							sx={{
								fontSize: 48,
								fontWeight: 800,
								lineHeight: 1,
								letterSpacing: '-0.04em',
							}}
						>
							{price}
						</Typography>
						<Typography
							sx={{
								color: highlighted ? 'rgba(255,255,255,0.6)' : 'text.secondary',
								fontWeight: 500,
								mb: 0.5,
							}}
						>
							/mo
						</Typography>
					</Stack>
				)}
				<Typography
					sx={{
						fontSize: 12,
						color: highlighted ? 'rgba(255,255,255,0.6)' : 'text.secondary',
						fontWeight: 500,
						mt: 0.5,
					}}
				>
					{isCustom ? 'Custom pricing' : billingLabel}
				</Typography>
			</Box>

			{/* Features */}
			<Stack
				spacing={2}
				sx={{ position: 'relative', zIndex: 1, flex: 1, mb: 5 }}
			>
				{tier.features.map((label) => {
					return (
						<TierFeatureItem
							key={label}
							label={label}
							highlighted={highlighted}
						/>
					);
				})}
			</Stack>

			{/* CTA */}
			<Button
				component={isMailto ? 'a' : RouterLink}
				{...(isMailto ? { href: tier.cta.href } : { href: tier.cta.href })}
				variant="contained"
				disableElevation
				sx={{
					position: 'relative',
					zIndex: 1,
					py: 1.75,
					borderRadius: '12px',
					fontSize: 15,
					fontWeight: 600,
					textTransform: 'none',
					transition: 'transform 240ms ease, box-shadow 240ms ease',
					...buttonSx,
				}}
			>
				{tier.cta.label}
			</Button>
		</Box>
	);
};

export const PricingTiers = ({ billing }: PricingTiersProps) => {
	return (
		<Box component="section" sx={{ pb: { xs: 12, md: 12 } }}>
			<Container maxWidth="lg">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
						gap: { xs: 3, md: 4 },
						alignItems: 'flex-start',
					}}
				>
					{TIERS.map((tier) => {
						return <TierCard key={tier.id} tier={tier} billing={billing} />;
					})}
				</Box>

				{/* Trust signals */}
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					spacing={{ xs: 1.5, sm: 6 }}
					justifyContent="center"
					alignItems="center"
					sx={{ mt: 6, pt: 1 }}
				>
					{TRUST_SIGNALS.map((label) => {
						return (
							<Stack
								key={label}
								direction="row"
								alignItems="center"
								spacing={1}
							>
								<Iconify
									icon="ph:check-circle-fill"
									width={18}
									sx={{ color: 'primary.main' }}
								/>
								<Box
									component="span"
									sx={{
										fontSize: 14,
										color: 'text.secondary',
										fontWeight: 500,
									}}
								>
									{label}
								</Box>
							</Stack>
						);
					})}
				</Stack>
			</Container>
		</Box>
	);
};
