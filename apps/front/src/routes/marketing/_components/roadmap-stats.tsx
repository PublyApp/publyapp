import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

type StatTone = 'info' | 'amber' | 'primary';

type RoadmapStatsProps = {
	shipped: number;
	inProgress: number;
	votes: number;
};

// ----------------------------------------------------------------------

type Stat = {
	label: string;
	tone: StatTone;
	icon?: IconifyName;
};

const formatNumber = (n: number): string => {
	return n.toLocaleString('en-US');
};

const toneToDotColor = (tone: StatTone) => {
	if (tone === 'amber') {
		return 'warning.main';
	}
	if (tone === 'primary') {
		return 'primary.main';
	}
	return 'info.main';
};

// ----------------------------------------------------------------------

export const RoadmapStats = ({
	shipped,
	inProgress,
	votes,
}: RoadmapStatsProps) => {
	const stats: { value: number; stat: Stat }[] = [
		{
			value: shipped,
			stat: { label: 'features shipped', tone: 'info' },
		},
		{
			value: inProgress,
			stat: { label: 'in progress', tone: 'amber' },
		},
		{
			value: votes,
			stat: {
				label: 'community votes',
				tone: 'primary',
				icon: 'ph:trend-up-fill',
			},
		},
	];

	return (
		<Container maxWidth="md" sx={{ pb: { xs: 4, md: 6 } }}>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				spacing={{ xs: 2, sm: 4 }}
				divider={
					<Box
						sx={{
							display: { xs: 'none', sm: 'block' },
							width: '1px',
							alignSelf: 'stretch',
							bgcolor: 'divider',
						}}
					/>
				}
				sx={{
					justifyContent: 'center',
					alignItems: 'center',
					pt: { xs: 4, md: 6 },
					mt: { xs: 2, md: 4 },
					borderTop: '1px solid',
					borderColor: 'divider',
				}}
			>
				{stats.map(({ value, stat }) => {
					return (
						<Stack
							key={stat.label}
							direction="row"
							spacing={1}
							alignItems="center"
						>
							{stat.icon ? (
								<Iconify
									icon={stat.icon}
									width={16}
									sx={{ color: 'primary.main' }}
								/>
							) : (
								<Box
									aria-hidden="true"
									sx={{
										width: 8,
										height: 8,
										borderRadius: '50%',
										bgcolor: toneToDotColor(stat.tone),
									}}
								/>
							)}
							<Typography
								sx={{
									fontSize: 14,
									fontWeight: 600,
									color: 'text.secondary',
								}}
							>
								<Box
									component="span"
									sx={{ color: 'text.primary', fontWeight: 700 }}
								>
									{formatNumber(value)}
								</Box>{' '}
								{stat.label}
							</Typography>
						</Stack>
					);
				})}
			</Stack>
		</Container>
	);
};
