import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import groupBy from 'lodash/groupBy';
import { varAlpha } from 'minimal-shared/utils';
import { Fragment } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import {
	type Billing,
	COMPARISON_MATRIX,
	type ComparisonCategory,
	type PricingTier,
	type PricingTierId,
	TIERS,
} from '#app/routes/marketing/_data/pricing.ts';

// ----------------------------------------------------------------------

type PricingComparisonProps = {
	billing: Billing;
};

const CATEGORY_ORDER: readonly ComparisonCategory[] = [
	'Social Accounts',
	'Scheduling',
	'Content Creation',
	'Collaboration',
	'AI & Automation',
	'Advanced',
];

const HEADER_BUTTON_LABEL: Record<PricingTierId, string> = {
	creator: 'Start trial',
	scale: 'Free trial',
	enterprise: 'Contact',
};

const formatHeaderPrice = (value: number | 'custom'): string => {
	return value === 'custom' ? 'Custom' : `$${value}`;
};

// ----------------------------------------------------------------------

const BoolPill = ({ value }: { value: boolean }) => {
	if (value) {
		return (
			<Box
				sx={{
					display: 'inline-flex',
					width: 20,
					height: 20,
					alignItems: 'center',
					justifyContent: 'center',
					borderRadius: '6px',
					bgcolor: 'primary.main',
				}}
			>
				<Iconify
					icon="ph:check-bold"
					width={12}
					sx={{ color: 'common.white' }}
				/>
			</Box>
		);
	}

	return (
		<Box
			sx={(theme) => ({
				display: 'inline-flex',
				width: 20,
				height: 20,
				alignItems: 'center',
				justifyContent: 'center',
				borderRadius: '6px',
				bgcolor: varAlpha(theme.vars.palette.text.primaryChannel, 0.08),
				color: 'text.disabled',
			})}
		>
			<Iconify
				icon="ph:minus-bold"
				width={12}
				sx={{ color: 'text.disabled' }}
			/>
		</Box>
	);
};

// ----------------------------------------------------------------------

const TierColumnHeader = ({
	tier,
	billing,
}: {
	tier: PricingTier;
	billing: Billing;
}) => {
	const price = tier.pricing[billing];
	const isCustom = price === 'custom';
	const isScale = tier.id === 'scale';
	const isMailto = tier.cta.href.startsWith('mailto:');
	const billingLabel =
		billing === 'monthly' ? 'Billed monthly' : 'Billed annually';

	return (
		<Stack alignItems="center" spacing={0.75}>
			{/* Tier name */}
			<Typography
				sx={{
					fontWeight: 700,
					fontSize: 15,
					color: isScale ? 'primary.main' : 'text.primary',
				}}
			>
				{tier.name}
			</Typography>

			{/* Price */}
			<Typography
				sx={{
					fontWeight: 700,
					fontSize: 24,
					letterSpacing: '-0.02em',
					lineHeight: 1,
					color: 'text.primary',
				}}
			>
				{isCustom ? (
					'Custom'
				) : (
					<>
						{formatHeaderPrice(price)}
						<Box
							component="span"
							sx={{
								fontSize: 13,
								fontWeight: 400,
								color: 'text.secondary',
								ml: 0.5,
							}}
						>
							/mo
						</Box>
					</>
				)}
			</Typography>

			{/* Billing label — hidden for enterprise but kept for layout alignment */}
			<Typography
				sx={{
					fontSize: 10,
					color: 'text.secondary',
					mb: 1,
					visibility: isCustom ? 'hidden' : 'visible',
				}}
			>
				{billingLabel}
			</Typography>

			{/* CTA button */}
			<Button
				component={isMailto ? 'a' : RouterLink}
				href={tier.cta.href}
				variant={isScale ? 'contained' : 'outlined'}
				disableElevation
				sx={(theme) => ({
					width: '100%',
					maxWidth: 140,
					fontSize: 13,
					fontWeight: 600,
					py: 1,
					px: 2,
					borderRadius: '10px',
					textTransform: 'none',
					transition: 'transform 240ms ease, box-shadow 240ms ease',
					...(isScale
						? {
								bgcolor: 'primary.main',
								color: 'common.white',
								'&:hover': {
									bgcolor: 'primary.main',
									transform: 'translateY(-1px)',
									boxShadow: `0 8px 16px -4px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.35)}`,
								},
								...theme.applyStyles('dark', {
									bgcolor: 'common.white',
									color: 'grey.900',
									'&:hover': {
										bgcolor: 'common.white',
										transform: 'translateY(-1px)',
										boxShadow: 'none',
									},
								}),
							}
						: {
								bgcolor: 'transparent',
								color: 'text.primary',
								borderColor: 'divider',
								'&:hover': {
									bgcolor: 'transparent',
									borderColor: 'divider',
									transform: 'translateY(-1px)',
									boxShadow: '0 6px 14px -4px rgba(17,24,39,0.10)',
								},
							}),
				})}
			>
				{HEADER_BUTTON_LABEL[tier.id]}
			</Button>
		</Stack>
	);
};

// ----------------------------------------------------------------------

const MatrixRow = ({
	feature,
	values,
}: {
	feature: string;
	values: [boolean | string, boolean | string, boolean | string];
}) => {
	return (
		<Box
			component="tr"
			sx={{
				borderBottom: '1px solid',
				borderColor: 'divider',
			}}
		>
			{/* Feature label */}
			<Box
				component="td"
				sx={{
					py: 2.5,
					px: 4,
					fontSize: 14,
					fontWeight: 500,
					color: 'text.primary',
					width: '34%',
				}}
			>
				{feature}
			</Box>

			{/* Value cells */}
			{values.map((val, idx) => {
				return (
					<Box
						// eslint-disable-next-line react/no-array-index-key
						key={idx}
						component="td"
						sx={{
							py: 2.5,
							px: 3,
							textAlign: 'center',
							width: '22%',
						}}
					>
						{typeof val === 'boolean' ? (
							<BoolPill value={val} />
						) : (
							<Typography
								component="span"
								sx={{ fontSize: 14, fontWeight: 500, color: 'text.primary' }}
							>
								{val}
							</Typography>
						)}
					</Box>
				);
			})}
		</Box>
	);
};

// ----------------------------------------------------------------------

export const PricingComparison = ({ billing }: PricingComparisonProps) => {
	const grouped = groupBy(COMPARISON_MATRIX, 'category');

	return (
		<Box component="section">
			<Container maxWidth="lg" sx={{ pt: 6, pb: 12 }}>
				{/* Section heading */}
				<Typography
					component="h2"
					sx={{
						fontSize: { xs: 28, md: 32 },
						fontWeight: 700,
						textAlign: 'center',
						mb: 8,
						color: 'text.primary',
					}}
				>
					Compare features
				</Typography>

				{/* Table — no overflow wrapper so sticky thead anchors to the page viewport */}
				<Box
					component="table"
					sx={{
						width: '100%',
						minWidth: 900,
						borderCollapse: 'collapse',
						textAlign: 'left',
					}}
				>
					{/* Sticky column headers */}
					<Box
						component="thead"
						sx={(theme) => ({
							position: 'sticky',
							top: 'var(--layout-header-mobile-height)',
							[theme.breakpoints.up('md')]: {
								top: 'var(--layout-header-desktop-height)',
							},
							zIndex: 30,
							bgcolor: 'background.default',
							'& th': {
								bgcolor: 'background.default',
							},
							boxShadow: '0 1px 0 0 rgba(0,0,0,0.04)',
						})}
					>
						<Box component="tr">
							{/* Empty first column */}
							<Box component="th" sx={{ py: 3, px: 4, width: '34%' }} />

							{/* Tier header columns */}
							{TIERS.map((tier) => {
								return (
									<Box
										component="th"
										key={tier.id}
										sx={{ py: 3, px: 3, width: '22%', textAlign: 'center' }}
									>
										<TierColumnHeader tier={tier} billing={billing} />
									</Box>
								);
							})}
						</Box>
					</Box>

					{/* Feature rows grouped by category */}
					<Box component="tbody" sx={{ fontSize: 14 }}>
						{CATEGORY_ORDER.map((category) => {
							const rows = grouped[category] ?? [];

							return (
								<Fragment key={category}>
									{/* Category label row */}
									<Box component="tr" key={`cat-${category}`}>
										<Box
											component="td"
											colSpan={4}
											sx={{
												pt: 5,
												pb: 2,
												px: 4,
												fontSize: 11,
												fontWeight: 700,
												textTransform: 'uppercase',
												letterSpacing: '0.1em',
												color: 'text.secondary',
											}}
										>
											{category}
										</Box>
									</Box>

									{/* Feature rows for this category */}
									{rows.map((row) => {
										return (
											<MatrixRow
												key={`${category}-${row.feature}`}
												feature={row.feature}
												values={[
													row.tiers.creator,
													row.tiers.scale,
													row.tiers.enterprise,
												]}
											/>
										);
									})}
								</Fragment>
							);
						})}
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
