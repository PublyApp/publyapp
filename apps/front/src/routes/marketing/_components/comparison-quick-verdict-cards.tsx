import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import { MotionViewport } from '#app/components/animate/motion-viewport.tsx';
import { varFade } from '#app/components/animate/variants/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { ComparisonQuickVerdict } from '#app/routes/marketing/_data/comparisons.ts';

// ----------------------------------------------------------------------

type ComparisonQuickVerdictCardsProps = {
	items: ComparisonQuickVerdict[];
};

// ----------------------------------------------------------------------

const VerdictRowUs = ({ title, body }: { title: string; body: string }) => {
	return (
		<Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
			<Box
				sx={{
					width: 24,
					height: 24,
					mt: 0.5,
					borderRadius: '50%',
					bgcolor: 'primary.lighter',
					color: 'primary.main',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexShrink: 0,
				}}
			>
				<Iconify icon="ph:check-bold" width={14} />
			</Box>
			<Box>
				<Typography
					sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary', mb: 0.5 }}
				>
					{title}
				</Typography>
				<Typography
					sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.55 }}
				>
					{body}
				</Typography>
			</Box>
		</Stack>
	);
};

const VerdictRowThem = ({ title, body }: { title: string; body: string }) => {
	return (
		<Stack
			direction="row"
			spacing={2}
			sx={{ alignItems: 'flex-start', opacity: 0.7 }}
		>
			<Box
				sx={{
					width: 24,
					mt: 1,
					display: 'inline-flex',
					justifyContent: 'center',
					flexShrink: 0,
				}}
			>
				<Box
					sx={{
						width: 8,
						height: 8,
						borderRadius: '50%',
						bgcolor: 'text.disabled',
					}}
				/>
			</Box>
			<Box>
				<Typography
					sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', mb: 0.5 }}
				>
					{title}
				</Typography>
				<Typography
					sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.55 }}
				>
					{body}
				</Typography>
			</Box>
		</Stack>
	);
};

const VerdictCard = ({ verdict }: { verdict: ComparisonQuickVerdict }) => {
	return (
		<Box
			component={m.div}
			variants={varFade('inUp', { distance: 24 })}
			sx={{
				p: { xs: 3, md: 4 },
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 4px 6px -1px rgba(17,24,39,0.05)',
				transition: 'box-shadow 240ms ease, transform 240ms ease',
				'&:hover': {
					transform: 'translateY(-2px)',
					boxShadow: '0 20px 25px -5px rgba(17,24,39,0.10)',
				},
			}}
		>
			<Typography
				sx={{
					fontSize: 12,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.12em',
					color: 'text.secondary',
					mb: 3,
				}}
			>
				{verdict.heading}
			</Typography>
			<Stack spacing={2.5}>
				<VerdictRowUs title={verdict.us.title} body={verdict.us.body} />
				<Box sx={{ height: '1px', bgcolor: 'divider', width: '100%' }} />
				<VerdictRowThem title={verdict.them.title} body={verdict.them.body} />
			</Stack>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const ComparisonQuickVerdictCards = ({
	items,
}: ComparisonQuickVerdictCardsProps) => {
	return (
		<Box component="section" sx={{ py: { xs: 6, md: 10 } }}>
			<Container maxWidth="lg" component={MotionViewport}>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							md: 'repeat(3, 1fr)',
						},
						gap: { xs: 3, md: 4 },
					}}
				>
					{items.map((item) => {
						return <VerdictCard key={item.id} verdict={item} />;
					})}
				</Box>
			</Container>
		</Box>
	);
};
