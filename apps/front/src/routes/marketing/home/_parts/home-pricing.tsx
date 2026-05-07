import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';
import { useState } from 'react';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { BillingCycleToggle } from '#app/routes/marketing/_components/billing-cycle-toggle.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import { PricingTierCard } from '#app/routes/marketing/_components/pricing-tier-card.tsx';
import { type Billing, TIERS } from '#app/routes/marketing/_data/pricing.ts';

// ----------------------------------------------------------------------

const ASSURANCES = [
	'Cancel anytime',
	'No credit card for trial',
	'Priority email support',
];

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

const PricingHeader = ({
	annual,
	onAnnualChange,
}: {
	annual: boolean;
	onAnnualChange: (value: boolean) => void;
}) => {
	return (
		<Box sx={{ textAlign: 'center', mb: 8, position: 'relative', zIndex: 1 }}>
			<Box
				component={m.div}
				variants={varFade('inUp', { distance: 24 })}
				sx={{ mb: 2 }}
			>
				<MarketingEyebrow label="Pricing" />
			</Box>

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
				<BillingCycleToggle
					billing={annual ? 'annually' : 'monthly'}
					onBillingChange={(next) => {
						return onAnnualChange(next === 'annually');
					}}
				/>
			</m.div>
		</Box>
	);
};

const PricingPlans = ({ annual }: { annual: boolean }) => {
	const billing: Billing = annual ? 'annually' : 'monthly';

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
			<PricingTierCard tier={TIERS[0]} billing={billing} />
			<PricingTierCard tier={TIERS[1]} billing={billing} />
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

const SeeFullPricingLink = () => {
	return (
		<Stack direction="row" justifyContent="center" sx={{ mt: 4 }}>
			<Box
				component={RouterLink}
				href={FRONT_PATH_NAMES.marketing.pricing}
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.75,
					fontSize: 14,
					fontWeight: 700,
					color: 'primary.main',
					textDecoration: 'none',
					transition: 'transform 240ms ease',
					'&:hover': {
						transform: 'translateX(2px)',
					},
				}}
			>
				See full pricing
				<Iconify icon={'ph:arrow-right-bold' as never} width={14} />
			</Box>
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
				<SeeFullPricingLink />
			</Container>
		</Box>
	);
};
