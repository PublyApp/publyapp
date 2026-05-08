import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';

// ----------------------------------------------------------------------

type FeatureStepBandStep = {
	id: string;
	title: string;
	body: string;
};

type FeatureStepBandProps = {
	title: string;
	items: [FeatureStepBandStep, FeatureStepBandStep, FeatureStepBandStep];
};

// ----------------------------------------------------------------------

// Numbered "How it works" band — 3 circles connected by a dashed line on
// md+. The middle step is intentionally highlighted with the primary color
// to mirror the canvas progression cue.
export const FeatureStepBand = ({ title, items }: FeatureStepBandProps) => {
	return (
		<Box
			component="section"
			sx={{
				bgcolor: 'background.neutral',
				py: { xs: 8, md: 12 },
			}}
		>
			<Container maxWidth="lg" component={MotionViewport}>
				<Box
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					sx={{ textAlign: 'center', mb: { xs: 6, md: 8 } }}
				>
					<Typography
						component="h2"
						sx={{
							fontSize: { xs: 28, md: 36 },
							fontWeight: 700,
							lineHeight: 1.2,
							letterSpacing: '-0.01em',
							color: 'text.primary',
						}}
					>
						{title}
					</Typography>
				</Box>

				<Box
					sx={{
						position: 'relative',
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							md: 'repeat(3, 1fr)',
						},
						gap: { xs: 5, md: 6 },
					}}
				>
					{/* Connecting dashed line — desktop only */}
					<Box
						aria-hidden="true"
						sx={{
							display: { xs: 'none', md: 'block' },
							position: 'absolute',
							top: 32,
							left: '16%',
							right: '16%',
							borderTop: '2px dashed',
							borderColor: 'divider',
							zIndex: 0,
						}}
					/>

					{items.map((step, index) => {
						const isHighlighted = index === 1;

						return (
							<Box
								key={step.id}
								component={m.div}
								variants={varFade('inUp', { distance: 24 })}
								sx={{
									position: 'relative',
									zIndex: 1,
								}}
							>
								<Stack
									spacing={2}
									alignItems="center"
									sx={{ textAlign: 'center' }}
								>
									<Box
										sx={{
											width: 64,
											height: 64,
											borderRadius: '50%',
											border: '4px solid',
											borderColor: 'background.neutral',
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
											fontSize: 22,
											fontWeight: 700,
											bgcolor: isHighlighted
												? 'primary.main'
												: 'background.paper',
											color: isHighlighted ? 'common.white' : 'text.primary',
											boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
										}}
									>
										{index + 1}
									</Box>
									<Typography
										component="h3"
										sx={{
											fontSize: { xs: 18, md: 20 },
											fontWeight: 700,
											color: 'text.primary',
											m: 0,
										}}
									>
										{step.title}
									</Typography>
									<Typography
										sx={{
											fontSize: 14,
											color: 'text.secondary',
											lineHeight: 1.6,
											maxWidth: 280,
										}}
									>
										{step.body}
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
