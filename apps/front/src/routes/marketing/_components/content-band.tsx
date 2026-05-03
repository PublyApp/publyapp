import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

// ----------------------------------------------------------------------

type ContentBandProps = {
	eyebrow?: string;
	title: string;
	subhead?: string;
	bg?: 'default' | 'neutral';
	children: ReactNode;
};

// ----------------------------------------------------------------------

export const ContentBand = ({
	eyebrow,
	title,
	subhead,
	bg = 'default',
	children,
}: ContentBandProps) => {
	return (
		<Box
			component="section"
			sx={{
				bgcolor: bg === 'neutral' ? 'background.neutral' : 'background.default',
				py: { xs: 8, md: 12 },
			}}
		>
			<Container maxWidth="lg">
				<Stack spacing={2} sx={{ maxWidth: 720, mb: { xs: 5, md: 7 } }}>
					{eyebrow ? (
						<Typography
							sx={{
								fontSize: 12,
								fontWeight: 700,
								textTransform: 'uppercase',
								letterSpacing: '0.12em',
								color: 'primary.main',
							}}
						>
							{eyebrow}
						</Typography>
					) : null}
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
					{subhead ? (
						<Typography
							sx={{
								fontSize: { xs: 15, md: 16 },
								color: 'text.secondary',
								lineHeight: 1.6,
							}}
						>
							{subhead}
						</Typography>
					) : null}
				</Stack>
				{children}
			</Container>
		</Box>
	);
};
