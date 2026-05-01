import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { type Billing } from '#app/routes/marketing/_data/pricing.ts';

// ----------------------------------------------------------------------

type PricingHeroProps = {
	billing: Billing;
	onBillingChange: (next: Billing) => void;
};

const HeroHalo = () => {
	return (
		<Box
			sx={(theme) => ({
				position: 'absolute',
				top: '25%',
				left: '50%',
				transform: 'translateX(-50%)',
				width: 600,
				height: 400,
				bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.05),
				borderRadius: '50%',
				filter: 'blur(120px)',
				pointerEvents: 'none',
				zIndex: -1,
			})}
		/>
	);
};

const BillingToggle = ({ billing, onBillingChange }: PricingHeroProps) => {
	const isAnnual = billing === 'annually';

	return (
		<Box
			role="group"
			aria-label="Billing cycle"
			sx={{
				position: 'relative',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				p: 0.75,
				borderRadius: '16px',
				display: 'inline-flex',
				alignItems: 'center',
				boxShadow: '0 1px 2px rgba(17,24,39,0.05)',
				width: 260,
			}}
		>
			{/* Sliding dark thumb */}
			<Box
				aria-hidden="true"
				sx={{
					position: 'absolute',
					top: 6,
					bottom: 6,
					left: 6,
					width: 'calc(50% - 6px)',
					bgcolor: '#242424',
					borderRadius: '12px',
					zIndex: 0,
					transform: isAnnual ? 'translateX(100%)' : 'translateX(0%)',
					transition: 'transform 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
				}}
			/>

			{/* Monthly segment */}
			<Box
				component="button"
				type="button"
				aria-pressed={!isAnnual}
				onClick={() => {
					onBillingChange('monthly');
				}}
				sx={{
					position: 'relative',
					zIndex: 1,
					flex: 1,
					py: 1,
					fontSize: 14,
					fontWeight: 500,
					color: isAnnual ? 'text.secondary' : 'common.white',
					background: 'none',
					border: 'none',
					cursor: 'pointer',
					transition: 'color 300ms',
				}}
			>
				Monthly
			</Box>

			{/* Annually segment */}
			<Box
				component="button"
				type="button"
				aria-pressed={isAnnual}
				onClick={() => {
					onBillingChange('annually');
				}}
				sx={{
					position: 'relative',
					zIndex: 1,
					flex: 1,
					py: 1,
					fontSize: 14,
					fontWeight: 500,
					color: isAnnual ? 'common.white' : 'text.secondary',
					background: 'none',
					border: 'none',
					cursor: 'pointer',
					transition: 'color 300ms',
				}}
			>
				Act Annually
			</Box>

			{/* Floating -20% badge */}
			<Box
				sx={{
					position: 'absolute',
					top: -12,
					right: -24,
					bgcolor: 'primary.main',
					color: 'common.white',
					fontSize: 10,
					fontWeight: 700,
					px: 1,
					py: 0.25,
					borderRadius: '6px',
					boxShadow: '0 1px 2px rgba(17,24,39,0.10)',
					border: '1px solid',
					borderColor: 'primary.light',
					transform: 'rotate(6deg)',
					transformOrigin: 'bottom left',
					pointerEvents: 'none',
				}}
			>
				-20%
			</Box>
		</Box>
	);
};

export const PricingHero = ({ billing, onBillingChange }: PricingHeroProps) => {
	return (
		<Box
			component="section"
			sx={{
				position: 'relative',
				overflow: 'hidden',
				pt: { xs: 16, md: 18 },
				pb: { xs: 6, md: 8 },
			}}
		>
			<HeroHalo />

			<Container
				maxWidth="lg"
				sx={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					textAlign: 'center',
					position: 'relative',
					zIndex: 1,
				}}
			>
				{/* Eyebrow chip */}
				<Box
					sx={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 1,
						px: 1.5,
						py: 0.75,
						borderRadius: 999,
						bgcolor: 'background.paper',
						border: '1px solid',
						borderColor: 'divider',
						fontSize: 12,
						fontWeight: 700,
						textTransform: 'uppercase',
						letterSpacing: '0.08em',
						color: 'text.secondary',
						mb: 3,
						boxShadow: '0 1px 2px rgba(17,24,39,0.05)',
					}}
				>
					<Iconify
						icon="solar:tag-horizontal-bold-duotone"
						width={14}
						sx={{ color: 'primary.main' }}
					/>
					Pricing
				</Box>

				{/* Headline */}
				<Typography
					component="h1"
					sx={{
						color: 'text.primary',
						fontSize: 'clamp(2rem, 4vw, 3rem)',
						fontWeight: 800,
						lineHeight: 1.05,
						letterSpacing: '-0.02em',
						mb: 2,
					}}
				>
					Pick a plan that
					<br />
					<Box
						component="span"
						sx={(theme) => ({
							background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
							WebkitBackgroundClip: 'text',
							WebkitTextFillColor: 'transparent',
						})}
					>
						scales with you.
					</Box>
				</Typography>

				{/* Subhead */}
				<Typography
					sx={{
						fontSize: { xs: 16, md: 18 },
						color: 'text.secondary',
						maxWidth: 672,
						mb: 4,
						fontWeight: 500,
						textWrap: 'balance',
					}}
				>
					Per-seat pricing. 14-day free trial. No credit card.
				</Typography>

				{/* Billing toggle */}
				<BillingToggle billing={billing} onBillingChange={onBillingChange} />
			</Container>
		</Box>
	);
};
