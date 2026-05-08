import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { CustomerStoryMetric } from '#app/routes/marketing/_data/customer-stories.ts';

// ----------------------------------------------------------------------

// 3-up metric callouts that float over the hero/narrative seam (canvas
// uses a `-mt-16` overlap; we recreate it with a small negative margin
// on the outer container). Stacked on `xs`, divided 3-up grid on `md+`.
// Template assumes exactly 3 metrics — if data ever carries more or
// fewer, the grid still renders cleanly via `repeat(3, 1fr)`.

// ----------------------------------------------------------------------

type CustomerStoryStatsBandProps = {
	metrics: CustomerStoryMetric[];
};

export const CustomerStoryStatsBand = ({
	metrics,
}: CustomerStoryStatsBandProps) => {
	return (
		<Container
			maxWidth="md"
			component={MotionViewport}
			sx={{
				position: 'relative',
				zIndex: 1,
				mt: { xs: -4, md: -8 },
				mb: { xs: 8, md: 12 },
			}}
		>
			<Box
				component={m.div}
				variants={varFade('inUp', { distance: 24 })}
				sx={{
					p: { xs: 4, md: 6 },
					borderRadius: '24px',
					bgcolor: 'background.paper',
					border: '1px solid',
					borderColor: 'divider',
					boxShadow: '0 24px 48px -20px rgba(17,24,39,0.10)',
				}}
			>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
						gap: { xs: 4, md: 0 },
						alignItems: 'stretch',
					}}
				>
					{metrics.map((metric, idx) => {
						const isFirst = idx === 0;
						return (
							<Stack
								key={metric.id}
								spacing={1.5}
								alignItems="center"
								sx={{
									textAlign: 'center',
									py: { xs: 2, md: 0 },
									// Vertical dividers between cells on md+; horizontal
									// dividers between rows on xs.
									borderTop: {
										xs: isFirst ? 'none' : '1px solid',
										md: 'none',
									},
									borderTopColor: { xs: 'divider' },
									borderLeft: {
										xs: 'none',
										md: isFirst ? 'none' : '1px solid',
									},
									borderLeftColor: { md: 'divider' },
									pt: { xs: isFirst ? 0 : 4, md: 0 },
								}}
							>
								<Iconify
									icon={metric.iconName}
									width={28}
									sx={{ color: 'primary.main' }}
								/>
								<Typography
									component="p"
									sx={{
										fontSize: { xs: 44, md: 56 },
										fontWeight: 800,
										color: 'primary.main',
										letterSpacing: '-0.04em',
										lineHeight: 1,
									}}
								>
									{metric.value}
								</Typography>
								<Typography
									sx={{
										fontSize: 12,
										fontWeight: 600,
										color: 'text.secondary',
										textTransform: 'uppercase',
										letterSpacing: '0.12em',
									}}
								>
									{metric.label}
								</Typography>
							</Stack>
						);
					})}
				</Box>
			</Box>
		</Container>
	);
};
