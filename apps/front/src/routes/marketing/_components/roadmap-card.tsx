import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import {
	asHoverRoot,
	hoverLift,
} from '#app/components/animate/variants/hover.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type {
	RoadmapItem,
	RoadmapStatus,
} from '#app/routes/marketing/_data/roadmap.ts';

// ----------------------------------------------------------------------

type StatusToken = {
	label: string;
	bgcolor: string;
	color: string;
	borderColor: string;
};

const statusToken = (status: RoadmapStatus): StatusToken => {
	switch (status) {
		case 'in-progress':
			return {
				label: 'In progress',
				bgcolor: 'warning.lighter',
				color: 'warning.darker',
				borderColor: 'warning.light',
			};
		case 'researching':
			return {
				label: 'Researching',
				bgcolor: 'background.neutral',
				color: 'text.secondary',
				borderColor: 'divider',
			};
		case 'design':
			return {
				label: 'Design phase',
				bgcolor: 'background.neutral',
				color: 'text.secondary',
				borderColor: 'divider',
			};
		case 'planned':
			return {
				label: 'Planned',
				bgcolor: 'background.neutral',
				color: 'text.secondary',
				borderColor: 'divider',
			};
		case 'backlog':
			return {
				label: 'Backlog',
				bgcolor: 'background.neutral',
				color: 'text.disabled',
				borderColor: 'divider',
			};
		default: {
			const _exhaustive: never = status;
			return {
				label: _exhaustive,
				bgcolor: 'background.neutral',
				color: 'text.secondary',
				borderColor: 'divider',
			};
		}
	}
};

// ----------------------------------------------------------------------

const formatVoteCount = (n: number): string => {
	return n.toLocaleString('en-US');
};

// ----------------------------------------------------------------------

type RoadmapCardProps = {
	item: RoadmapItem;
};

export const RoadmapCard = ({ item }: RoadmapCardProps) => {
	const status = statusToken(item.status);
	const lift = hoverLift({ y: -4, scale: 1.01 });

	return (
		<Box
			component={m.div}
			{...asHoverRoot(lift)}
			sx={{
				p: 3,
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				boxShadow: '0 1px 2px rgba(17,24,39,0.04)',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			{/* Category pill — neutral per project rule (no semantic color
			    on category fallbacks). */}
			<Box
				sx={{
					display: 'inline-flex',
					alignSelf: 'flex-start',
					px: 1.25,
					py: 0.5,
					borderRadius: '8px',
					bgcolor: 'background.neutral',
					color: 'text.secondary',
					fontSize: 11,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.06em',
					mb: 1.75,
				}}
			>
				{item.category}
			</Box>

			<Typography
				component="h3"
				sx={{
					fontSize: 17,
					fontWeight: 700,
					color: 'text.primary',
					lineHeight: 1.3,
					letterSpacing: '-0.01em',
					mb: 1,
				}}
			>
				{item.title}
			</Typography>

			<Typography
				sx={{
					fontSize: 14,
					color: 'text.secondary',
					lineHeight: 1.55,
					mb: 3,
				}}
			>
				{item.description}
			</Typography>

			{/* Footer: vote pill + status pill */}
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="space-between"
				spacing={1}
				sx={{
					mt: 'auto',
					pt: 2,
					borderTop: '1px solid',
					borderColor: 'divider',
				}}
			>
				<Stack
					direction="row"
					alignItems="center"
					spacing={0.75}
					sx={{
						px: 1.25,
						py: 0.75,
						borderRadius: '8px',
						bgcolor: 'background.paper',
						border: '1px solid',
						borderColor: 'divider',
					}}
				>
					<Iconify
						icon="ph:caret-up-bold"
						width={12}
						sx={{ color: 'text.secondary' }}
					/>
					<Typography
						sx={{
							fontSize: 13,
							fontWeight: 600,
							color: 'text.primary',
							lineHeight: 1,
						}}
					>
						{formatVoteCount(item.voteCount)}
					</Typography>
				</Stack>

				<Box
					sx={{
						display: 'inline-flex',
						alignItems: 'center',
						px: 1.25,
						py: 0.5,
						borderRadius: '8px',
						bgcolor: status.bgcolor,
						color: status.color,
						border: '1px solid',
						borderColor: status.borderColor,
						fontSize: 11,
						fontWeight: 700,
					}}
				>
					{status.label}
				</Box>
			</Stack>
		</Box>
	);
};
