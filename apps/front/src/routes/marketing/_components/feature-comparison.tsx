import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { varAlpha } from 'minimal-shared/utils';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

type FeatureComparisonItem = {
	id: string;
	title: string;
	body: string;
	icon: IconifyName;
	tone: 'danger' | 'warning' | 'primary';
};

type FeatureComparisonProps = {
	title: string;
	items: [FeatureComparisonItem, FeatureComparisonItem, FeatureComparisonItem];
};

// ----------------------------------------------------------------------

const TonedIcon = ({
	icon,
	tone,
}: {
	icon: IconifyName;
	tone: FeatureComparisonItem['tone'];
}) => {
	return (
		<Box
			sx={(theme) => {
				let channel = theme.vars.palette.primary.mainChannel;
				let color = 'primary.main';
				if (tone === 'danger') {
					channel = theme.vars.palette.error.mainChannel;
					color = 'error.main';
				} else if (tone === 'warning') {
					channel = theme.vars.palette.warning.mainChannel;
					color = 'warning.main';
				}

				return {
					width: 40,
					height: 40,
					borderRadius: '50%',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					bgcolor: varAlpha(channel, 0.16),
					color,
				};
			}}
		>
			<Iconify icon={icon} width={18} />
		</Box>
	);
};

// ----------------------------------------------------------------------

export const FeatureComparison = ({ title, items }: FeatureComparisonProps) => {
	return (
		<Box
			component="section"
			sx={{
				bgcolor: 'background.neutral',
				borderTop: '1px solid',
				borderBottom: '1px solid',
				borderColor: 'divider',
				py: { xs: 8, md: 10 },
			}}
		>
			<Container maxWidth="lg" component={MotionViewport}>
				<Typography
					component={m.h2}
					variants={varFade('inUp', { distance: 24 })}
					sx={{
						fontSize: { xs: 24, md: 32 },
						fontWeight: 700,
						lineHeight: 1.2,
						letterSpacing: '-0.01em',
						color: 'text.primary',
						textAlign: 'center',
						mb: { xs: 5, md: 7 },
					}}
				>
					{title}
				</Typography>

				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							md: 'repeat(3, 1fr)',
						},
						gap: 0,
					}}
				>
					{items.map((item, index) => {
						return (
							<Box
								key={item.id}
								component={m.div}
								variants={varFade('inUp', { distance: 24 })}
								sx={{
									p: { xs: 3, md: 4 },
									textAlign: 'center',
									borderTop: {
										xs: index === 0 ? 'none' : '1px solid',
										md: 'none',
									},
									borderLeft: {
										xs: 'none',
										md: index === 0 ? 'none' : '1px solid',
									},
									borderColor: 'divider',
								}}
							>
								<Stack spacing={2} alignItems="center">
									<TonedIcon icon={item.icon} tone={item.tone} />
									<Typography
										sx={{
											fontSize: 16,
											fontWeight: 700,
											color: 'text.primary',
										}}
									>
										{item.title}
									</Typography>
									<Typography
										sx={{
											fontSize: 14,
											color: 'text.secondary',
											lineHeight: 1.6,
											maxWidth: 300,
										}}
									>
										{item.body}
									</Typography>
								</Stack>
							</Box>
						);
					})}
				</Box>
			</Container>
		</Box>
	);
};
