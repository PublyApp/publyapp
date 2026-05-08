import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import type { ComparisonPricingTier } from '#app/routes/marketing/_data/comparisons.ts';

// ----------------------------------------------------------------------

type ComparisonPricingPairProps = {
	title: string;
	subhead?: string;
	us: ComparisonPricingTier;
	them: ComparisonPricingTier;
	recommendedLabel?: string;
};

// ----------------------------------------------------------------------

const isExternalHref = (href: string): boolean => {
	return href.startsWith('http') || href.startsWith('mailto:');
};

const resolveIconColor = (included: boolean, muted: boolean): string => {
	if (!included) {
		return 'text.disabled';
	}
	if (muted) {
		return 'text.disabled';
	}
	return 'primary.main';
};

const FeatureLine = ({
	label,
	included,
	emphasis,
	muted = false,
}: {
	label: string;
	included: boolean;
	emphasis?: boolean;
	muted?: boolean;
}) => {
	return (
		<Stack
			direction="row"
			spacing={1.5}
			sx={{
				alignItems: 'flex-start',
				opacity: included ? 1 : 0.55,
			}}
		>
			<Iconify
				icon={included ? 'ph:check-circle-fill' : 'ph:minus-bold'}
				width={18}
				sx={{
					mt: 0.25,
					flexShrink: 0,
					color: resolveIconColor(included, muted),
				}}
			/>
			{emphasis ? (
				<Box
					component="span"
					sx={{
						fontSize: 14,
						fontWeight: 600,
						px: 1,
						py: 0.25,
						borderRadius: '6px',
						bgcolor: 'primary.lighter',
						color: 'primary.main',
					}}
				>
					{label}
				</Box>
			) : (
				<Typography
					component="span"
					sx={{
						fontSize: 14,
						color: 'text.primary',
						fontWeight: included && !muted ? 600 : 500,
						textDecoration: included ? 'none' : 'line-through',
					}}
				>
					{label}
				</Typography>
			)}
		</Stack>
	);
};

// ----------------------------------------------------------------------

const ThemCard = ({ tier }: { tier: ComparisonPricingTier }) => {
	return (
		<Box
			component={m.div}
			variants={varFade('inUp', { distance: 24 })}
			sx={{
				bgcolor: 'background.neutral',
				borderRadius: '20px',
				p: { xs: 4, md: 5 },
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Typography
				sx={{
					fontSize: 18,
					fontWeight: 700,
					color: 'text.secondary',
					mb: 1,
				}}
			>
				{tier.productName}
			</Typography>
			<Stack
				direction="row"
				spacing={0.5}
				alignItems="baseline"
				sx={{ mb: 0.5 }}
			>
				<Typography
					sx={{ fontSize: 36, fontWeight: 800, color: 'text.primary' }}
				>
					{tier.price}
				</Typography>
				<Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
					{tier.period}
				</Typography>
			</Stack>
			<Typography
				sx={{
					fontSize: 13,
					color: 'text.secondary',
					fontStyle: 'italic',
					fontWeight: 500,
					mb: 4,
				}}
			>
				{tier.highlight}
			</Typography>
			<Box
				sx={{
					height: '1px',
					bgcolor: 'divider',
					width: '100%',
					mb: 3,
				}}
			/>
			<Typography
				sx={{
					fontSize: 12,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.12em',
					color: 'text.primary',
					mb: 2.5,
				}}
			>
				What you get
			</Typography>
			<Stack spacing={2}>
				{tier.features.map((feat) => {
					return (
						<FeatureLine
							key={feat.label}
							label={feat.label}
							included={feat.included}
							muted
						/>
					);
				})}
			</Stack>
		</Box>
	);
};

const UsCard = ({
	tier,
	recommendedLabel,
}: {
	tier: ComparisonPricingTier;
	recommendedLabel?: string;
}) => {
	const ctaIsExternal = tier.ctaHref ? isExternalHref(tier.ctaHref) : false;
	return (
		<Box
			component={m.div}
			variants={varFade('inUp', { distance: 24 })}
			sx={(theme) => ({
				position: 'relative',
				bgcolor: 'background.paper',
				borderRadius: '20px',
				p: { xs: 4, md: 5 },
				border: '2px solid',
				borderColor: 'primary.main',
				boxShadow: `0 24px 48px -20px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.35)}`,
			})}
		>
			{recommendedLabel ? (
				<Box
					sx={{
						position: 'absolute',
						top: -14,
						left: '50%',
						transform: 'translateX(-50%)',
						bgcolor: 'primary.main',
						color: 'common.white',
						px: 2,
						py: 0.5,
						borderRadius: 999,
						fontSize: 11,
						fontWeight: 700,
						letterSpacing: '0.08em',
						textTransform: 'uppercase',
						boxShadow: '0 4px 8px -2px rgba(17,24,39,0.18)',
					}}
				>
					{recommendedLabel}
				</Box>
			) : null}

			<Stack
				direction="row"
				justifyContent="space-between"
				alignItems="flex-start"
				sx={{ mb: 1, mt: 1 }}
			>
				<Typography
					sx={{ fontSize: 22, fontWeight: 800, color: 'text.primary' }}
				>
					{tier.productName}
				</Typography>
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
					<Iconify icon="ph:rocket-launch-fill" width={18} />
				</Box>
			</Stack>
			<Stack
				direction="row"
				spacing={0.5}
				alignItems="baseline"
				sx={{ mb: 0.5 }}
			>
				<Typography
					sx={{ fontSize: 44, fontWeight: 800, color: 'text.primary' }}
				>
					{tier.price}
				</Typography>
				<Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
					{tier.period}
				</Typography>
			</Stack>
			<Typography
				sx={{
					fontSize: 13,
					color: 'primary.main',
					fontWeight: 600,
					mb: 4,
				}}
			>
				{tier.highlight}
			</Typography>

			{tier.ctaLabel && tier.ctaHref ? (
				<Box
					component={ctaIsExternal ? 'a' : RouterLink}
					href={tier.ctaHref}
					sx={(theme) => ({
						display: 'inline-flex',
						width: '100%',
						alignItems: 'center',
						justifyContent: 'center',
						py: 1.75,
						px: 3,
						borderRadius: 2,
						fontWeight: 700,
						fontSize: 15,
						textDecoration: 'none',
						cursor: 'pointer',
						bgcolor: 'primary.main',
						color: 'common.white',
						boxShadow: `0 12px 24px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.5)}`,
						transition: 'transform 240ms ease, box-shadow 240ms ease',
						mb: 4,
						'&:hover': {
							transform: 'translateY(-2px)',
							boxShadow: `0 16px 32px -12px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.6)}`,
						},
					})}
				>
					{tier.ctaLabel}
				</Box>
			) : null}

			<Box sx={{ height: '1px', bgcolor: 'divider', width: '100%', mb: 3 }} />
			<Typography
				sx={{
					fontSize: 12,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.12em',
					color: 'text.primary',
					mb: 2.5,
				}}
			>
				Everything, plus:
			</Typography>
			<Stack spacing={2}>
				{tier.features.map((feat) => {
					return (
						<FeatureLine
							key={feat.label}
							label={feat.label}
							included={feat.included}
							emphasis={feat.emphasis}
						/>
					);
				})}
			</Stack>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const ComparisonPricingPair = ({
	title,
	subhead,
	us,
	them,
	recommendedLabel,
}: ComparisonPricingPairProps) => {
	return (
		<Box component="section" sx={{ py: { xs: 8, md: 12 } }}>
			<Container maxWidth="md" component={MotionViewport}>
				<Box
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					sx={{
						mb: { xs: 5, md: 7 },
						textAlign: 'center',
					}}
				>
					<Typography
						component="h2"
						sx={{
							fontSize: { xs: 28, md: 36 },
							fontWeight: 700,
							lineHeight: 1.2,
							letterSpacing: '-0.01em',
							color: 'text.primary',
							mb: subhead ? 1.5 : 0,
						}}
					>
						{title}
					</Typography>
					{subhead ? (
						<Typography
							sx={{
								fontSize: { xs: 15, md: 16 },
								color: 'text.secondary',
								lineHeight: 1.6,
								maxWidth: 560,
								mx: 'auto',
							}}
						>
							{subhead}
						</Typography>
					) : null}
				</Box>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
						gap: { xs: 4, md: 5 },
						alignItems: 'stretch',
					}}
				>
					<ThemCard tier={them} />
					<UsCard tier={us} recommendedLabel={recommendedLabel} />
				</Box>
			</Container>
		</Box>
	);
};
