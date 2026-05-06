import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// ----------------------------------------------------------------------

type Stat = {
	value: string;
	label: string;
	highlight?: boolean;
};

type ChangelogStatsProps = {
	releasesShipped: number;
	featuresYtd: number;
	uptime: string; // e.g. '99.97%'
};

export const ChangelogStats = ({
	releasesShipped,
	featuresYtd,
	uptime,
}: ChangelogStatsProps) => {
	const stats: Stat[] = [
		{ value: releasesShipped.toString(), label: 'Releases shipped' },
		{ value: featuresYtd.toString(), label: 'Features in 2026' },
		{ value: uptime, label: 'Uptime SLA', highlight: true },
	];

	return (
		<Container maxWidth="md" sx={{ pb: { xs: 4, md: 6 } }}>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				divider={
					<Box
						sx={{
							display: { xs: 'block', sm: 'block' },
							width: { xs: '100%', sm: '1px' },
							height: { xs: '1px', sm: 'auto' },
							bgcolor: 'divider',
						}}
					/>
				}
				sx={{
					borderRadius: '20px',
					border: '1px solid',
					borderColor: 'divider',
					bgcolor: 'background.paper',
					boxShadow: '0 1px 2px rgba(31,41,55,0.03)',
					overflow: 'hidden',
				}}
			>
				{stats.map((stat) => {
					return (
						<Stack
							key={stat.label}
							alignItems="center"
							justifyContent="center"
							spacing={1}
							sx={{ flex: 1, py: { xs: 4, md: 5 }, px: 3 }}
						>
							<Typography
								sx={{
									fontSize: { xs: 28, md: 32 },
									fontWeight: 700,
									color: stat.highlight ? 'primary.main' : 'text.primary',
									letterSpacing: '-0.02em',
									lineHeight: 1,
								}}
							>
								{stat.value}
							</Typography>
							<Typography
								sx={{
									fontSize: 10,
									fontWeight: 700,
									letterSpacing: '0.12em',
									textTransform: 'uppercase',
									color: 'text.secondary',
								}}
							>
								{stat.label}
							</Typography>
						</Stack>
					);
				})}
			</Stack>
		</Container>
	);
};
