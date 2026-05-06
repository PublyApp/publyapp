import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { PricingTierCard } from '#app/routes/marketing/_components/pricing-tier-card.tsx';
import { type Billing, TIERS } from '#app/routes/marketing/_data/pricing.ts';

// ----------------------------------------------------------------------

type PricingTiersProps = {
	billing: Billing;
};

const TRUST_SIGNALS = [
	'Cancel anytime',
	'No credit card for trial',
	'Priority email support',
];

export const PricingTiers = ({ billing }: PricingTiersProps) => {
	return (
		<Box component="section" sx={{ pb: { xs: 12, md: 12 } }}>
			<Container maxWidth="lg">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
						gap: { xs: 3, md: 4 },
						alignItems: 'stretch',
					}}
				>
					{TIERS.map((tier) => {
						return (
							<PricingTierCard key={tier.id} tier={tier} billing={billing} />
						);
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
