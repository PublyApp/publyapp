import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';

import { varFade } from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import {
	type Billing,
	type PricingTier,
} from '#app/routes/marketing/_data/pricing.ts';

// ----------------------------------------------------------------------

const noiseOverlayUrl =
	"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

// ----------------------------------------------------------------------

type PricingTierCardProps = {
	tier: PricingTier;
	billing: Billing;
};

// ----------------------------------------------------------------------

const FeatureItem = ({
	label,
	highlighted,
}: {
	label: string;
	highlighted: boolean;
}) => {
	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={1.5}
			sx={{
				fontSize: 14,
				fontWeight: 500,
				color: highlighted ? 'rgba(255,255,255,0.9)' : undefined,
			}}
		>
			<Box
				sx={(theme) => {
					if (highlighted) {
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
					}
					return {
						width: 20,
						height: 20,
						borderRadius: '50%',
						bgcolor: 'success.lighter',
						color: 'success.main',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					};
				}}
			>
				<Iconify icon="ph:check-bold" width={10} />
			</Box>
			<Box component="span">{label}</Box>
		</Stack>
	);
};

// ----------------------------------------------------------------------

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

// ----------------------------------------------------------------------

const PriceBlock = ({
	tier,
	billing,
	highlighted,
}: {
	tier: PricingTier;
	billing: Billing;
	highlighted: boolean;
}) => {
	const value = tier.pricing[billing];
	const isCustom = value === 'custom';
	const billingLabel =
		billing === 'monthly' ? 'Billed monthly' : 'Billed annually';

	if (isCustom) {
		return (
			<Box sx={{ mb: 4 }}>
				<Typography
					sx={{
						fontSize: 32,
						fontWeight: 800,
						color: highlighted ? 'common.white' : 'text.primary',
						lineHeight: 1.1,
					}}
				>
					Let&apos;s talk
				</Typography>
				<Typography
					sx={{
						fontSize: 14,
						color: highlighted ? 'rgba(255,255,255,0.6)' : 'text.secondary',
						mt: 0.5,
					}}
				>
					Custom pricing
				</Typography>
			</Box>
		);
	}

	return (
		<Box sx={{ mb: 4 }}>
			<Stack direction="row" alignItems="baseline" spacing={1}>
				<Typography
					sx={{
						fontSize: 48,
						fontWeight: 900,
						lineHeight: 1,
						color: highlighted ? 'common.white' : 'text.primary',
					}}
				>
					{`$${value}`}
				</Typography>
				<Typography
					sx={{
						fontSize: 18,
						color: highlighted ? 'rgba(255,255,255,0.5)' : 'text.secondary',
					}}
				>
					/mo
				</Typography>
			</Stack>
			<Typography
				sx={{
					fontSize: 12,
					color: highlighted ? 'rgba(255,255,255,0.6)' : 'text.secondary',
					mt: 0.5,
				}}
			>
				{billingLabel}
			</Typography>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const PricingTierCard = ({ tier, billing }: PricingTierCardProps) => {
	const highlighted = !!tier.highlighted;
	const isMailto = tier.cta.href.startsWith('mailto:');

	return (
		<m.div variants={varFade('inUp', { distance: 24 })}>
			<Box
				component={m.div}
				whileHover={
					highlighted ? { y: -14, scale: 1.025 } : { y: -12, scale: 1.02 }
				}
				transition={{
					type: 'spring',
					stiffness: highlighted ? 260 : 280,
					damping: 20,
				}}
				sx={
					highlighted
						? (theme) => ({
								bgcolor: '#242424',
								color: 'common.white',
								borderRadius: '32px',
								p: 5,
								boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
								position: 'relative',
								overflow: 'hidden',
								transition: 'box-shadow 400ms ease',
								display: 'flex',
								flexDirection: 'column',
								border: '1px solid rgba(255,255,255,0.10)',
								height: '100%',
								'&:hover': {
									boxShadow: `0 30px 60px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.32)}`,
								},
							})
						: {
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
							}
				}
			>
				{highlighted && <ScaleCardDecor />}

				<Box
					sx={{
						position: 'relative',
						zIndex: 1,
						display: 'flex',
						flexDirection: 'column',
						flex: 1,
					}}
				>
					{/* Header */}
					<Typography
						component="h3"
						sx={{ fontSize: 24, fontWeight: 700, mb: 1 }}
					>
						{tier.name}
					</Typography>

					{/* Tagline + bottom border */}
					<Typography
						sx={{
							fontSize: 14,
							color: highlighted ? 'rgba(255,255,255,0.6)' : 'text.secondary',
							mb: 3,
							pb: 3,
							borderBottom: '1px solid',
							borderBottomColor: highlighted
								? 'rgba(255,255,255,0.10)'
								: 'divider',
						}}
					>
						{tier.tagline}
					</Typography>

					{/* Price */}
					<PriceBlock tier={tier} billing={billing} highlighted={highlighted} />

					{/* Features */}
					<Stack spacing={2} sx={{ mb: 5, flex: 1 }}>
						{tier.features.map((label) => {
							return (
								<FeatureItem
									key={label}
									label={label}
									highlighted={highlighted}
								/>
							);
						})}
					</Stack>

					{/* CTA — custom Box-as-button so we have full control over hover
					    (MUI Button injects --variant-hover-bg CSS vars that fight sx). */}
					<Box
						{...(isMailto
							? { component: 'a' as const, href: tier.cta.href }
							: { component: RouterLink, href: tier.cta.href })}
						sx={
							highlighted
								? (theme) => ({
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										width: '100%',
										py: 1.75,
										px: 3,
										mt: 'auto',
										borderRadius: 2,
										fontSize: 15,
										fontWeight: 700,
										textDecoration: 'none',
										textTransform: 'none',
										cursor: 'pointer',
										bgcolor: 'primary.main',
										color: 'common.white',
										boxShadow: `0 10px 30px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.3)}`,
										transition: 'transform 0.3s ease, box-shadow 0.3s ease',
										'&:hover': {
											bgcolor: 'primary.main',
											color: 'common.white',
											transform: 'translateY(-2px)',
											boxShadow: `0 16px 40px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.45)}`,
										},
										...theme.applyStyles('dark', {
											bgcolor: 'primary.main',
											color: 'common.white',
											'&:hover': {
												bgcolor: 'primary.main',
												color: 'common.white',
												transform: 'translateY(-2px)',
												boxShadow: `0 16px 40px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.55)}`,
											},
										}),
									})
								: (theme) => ({
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										width: '100%',
										py: 1.75,
										px: 3,
										mt: 'auto',
										borderRadius: 2,
										fontSize: 15,
										fontWeight: 700,
										textDecoration: 'none',
										textTransform: 'none',
										cursor: 'pointer',
										bgcolor: 'grey.900',
										color: 'common.white',
										transition: 'transform 0.3s ease, box-shadow 0.3s ease',
										'&:hover': {
											bgcolor: 'grey.900',
											color: 'common.white',
											transform: 'translateY(-2px)',
											boxShadow: '0 12px 24px -8px rgba(17,24,39,0.30)',
										},
										...theme.applyStyles('dark', {
											bgcolor: 'common.white',
											color: 'grey.900',
											'&:hover': {
												bgcolor: 'common.white',
												color: 'grey.900',
												transform: 'translateY(-2px)',
												boxShadow: '0 12px 24px -8px rgba(0,0,0,0.40)',
											},
										}),
									})
						}
					>
						{tier.cta.label}
					</Box>
				</Box>
			</Box>
		</m.div>
	);
};
