import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import type { ComparisonMigrationStep } from '#app/routes/marketing/_data/comparisons.ts';

// ----------------------------------------------------------------------

type ComparisonMigrationTimelineProps = {
	eyebrow: string;
	title: string;
	steps: ComparisonMigrationStep[];
	ctaLabel: string;
	ctaHref: string;
};

// ----------------------------------------------------------------------

const isExternalHref = (href: string): boolean => {
	return href.startsWith('http') || href.startsWith('mailto:');
};

const StepBubble = ({ step }: { step: ComparisonMigrationStep }) => {
	if (step.highlight) {
		return (
			<Box
				sx={{
					width: 48,
					height: 48,
					borderRadius: '50%',
					bgcolor: 'primary.main',
					color: 'common.white',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					boxShadow: '0 4px 8px -2px rgba(17,24,39,0.18)',
					position: 'relative',
					zIndex: 2,
				}}
			>
				<Iconify icon="ph:arrows-left-right-bold" width={20} />
			</Box>
		);
	}

	return (
		<Box
			sx={{
				width: 48,
				height: 48,
				borderRadius: '50%',
				bgcolor: 'background.paper',
				color: 'text.primary',
				border: '2px solid',
				borderColor: 'divider',
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				fontSize: 16,
				fontWeight: 700,
				position: 'relative',
				zIndex: 2,
			}}
		>
			{step.index}
		</Box>
	);
};

// ----------------------------------------------------------------------

export const ComparisonMigrationTimeline = ({
	eyebrow,
	title,
	steps,
	ctaLabel,
	ctaHref,
}: ComparisonMigrationTimelineProps) => {
	const ctaIsExternal = isExternalHref(ctaHref);

	return (
		<Box component="section" sx={{ py: { xs: 6, md: 10 } }}>
			<Container maxWidth="lg" component={MotionViewport}>
				<Box
					component={m.div}
					variants={varFade('inUp', { distance: 24 })}
					sx={{
						bgcolor: 'background.paper',
						borderRadius: '40px',
						border: '1px solid',
						borderColor: 'divider',
						p: { xs: 5, md: 8 },
						textAlign: 'center',
						boxShadow: '0 1px 2px 0 rgba(17,24,39,0.04)',
					}}
				>
					<Box
						sx={{
							display: 'inline-block',
							px: 2,
							py: 0.75,
							mb: 3,
							borderRadius: 999,
							bgcolor: 'info.lighter',
							color: 'info.dark',
							border: '1px solid',
							borderColor: 'info.light',
							fontSize: 11,
							fontWeight: 700,
							letterSpacing: '0.08em',
							textTransform: 'uppercase',
						}}
					>
						{eyebrow}
					</Box>
					<Typography
						component="h2"
						sx={{
							fontSize: { xs: 28, md: 36 },
							fontWeight: 700,
							lineHeight: 1.2,
							letterSpacing: '-0.01em',
							color: 'text.primary',
							mb: { xs: 5, md: 7 },
						}}
					>
						{title}
					</Typography>

					<Box
						sx={{
							position: 'relative',
							display: 'flex',
							flexDirection: { xs: 'column', md: 'row' },
							justifyContent: 'space-between',
							alignItems: { xs: 'center', md: 'flex-start' },
							gap: { xs: 5, md: 0 },
							maxWidth: 720,
							mx: 'auto',
							mb: { xs: 5, md: 7 },
						}}
					>
						{/* Dashed connector — hidden on mobile, spans full row on md+. */}
						<Box
							aria-hidden
							sx={{
								display: { xs: 'none', md: 'block' },
								position: 'absolute',
								top: 24,
								left: '16.66%',
								right: '16.66%',
								height: '2px',
								backgroundImage: (theme) => {
									return `linear-gradient(to right, ${theme.palette.divider} 50%, transparent 50%)`;
								},
								backgroundSize: '12px 100%',
								backgroundRepeat: 'repeat-x',
								zIndex: 1,
							}}
						/>
						{steps.map((step) => {
							return (
								<Stack
									key={step.index}
									alignItems="center"
									spacing={2}
									sx={{
										flex: 1,
										position: 'relative',
										zIndex: 2,
										maxWidth: 220,
										textAlign: 'center',
									}}
								>
									<StepBubble step={step} />
									<Typography
										sx={{
											fontSize: 15,
											fontWeight: 700,
											color: 'text.primary',
										}}
									>
										{step.title}
									</Typography>
									<Typography
										sx={{
											fontSize: 13,
											color: 'text.secondary',
											lineHeight: 1.55,
										}}
									>
										{step.body}
									</Typography>
								</Stack>
							);
						})}
					</Box>

					<Box
						component={ctaIsExternal ? 'a' : RouterLink}
						href={ctaHref}
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							py: 1.5,
							px: 3,
							borderRadius: 2,
							fontWeight: 600,
							fontSize: 14,
							textDecoration: 'none',
							cursor: 'pointer',
							bgcolor: 'background.paper',
							color: 'text.primary',
							border: '1px solid',
							borderColor: 'divider',
							transition: 'transform 240ms ease, box-shadow 240ms ease',
							'&:hover': {
								transform: 'translateY(-2px)',
								boxShadow: '0 8px 16px -8px rgba(17,24,39,0.10)',
							},
						}}
					>
						{ctaLabel}
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
