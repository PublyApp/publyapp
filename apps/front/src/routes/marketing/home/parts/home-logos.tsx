import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// ----------------------------------------------------------------------

type LogoEntry = {
	name: string;
	glyph: React.ReactNode;
};

const LOGOS: LogoEntry[] = [
	{
		name: 'ATLAS',
		glyph: (
			<Box
				component="svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				sx={{ width: 18, height: 18, flexShrink: 0 }}
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="2" x2="12" y2="22" />
				<line x1="2" y1="12" x2="22" y2="12" />
			</Box>
		),
	},
	{
		name: 'NORTH',
		glyph: (
			<Box
				component="svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2.5}
				strokeLinejoin="round"
				sx={{ width: 18, height: 18, flexShrink: 0 }}
			>
				<path d="M12 4L3 20h18L12 4z" />
			</Box>
		),
	},
	{
		name: 'LUMA',
		glyph: (
			<Box
				component="svg"
				viewBox="0 0 24 24"
				fill="currentColor"
				sx={{ width: 16, height: 16, flexShrink: 0 }}
			>
				<rect x="3" y="3" width="18" height="18" />
			</Box>
		),
	},
	{
		name: 'CASCADE',
		glyph: (
			<Box
				component="svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={3}
				strokeLinecap="round"
				sx={{ width: 18, height: 18, flexShrink: 0 }}
			>
				<line x1="2" y1="6" x2="14" y2="6" />
				<line x1="6" y1="12" x2="18" y2="12" />
				<line x1="10" y1="18" x2="22" y2="18" />
			</Box>
		),
	},
	{
		name: 'ORBIT',
		glyph: (
			<Box
				component="svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				sx={{ width: 18, height: 18, flexShrink: 0 }}
			>
				<circle cx="12" cy="12" r="8" />
				<circle cx="18" cy="4" r="2.5" fill="currentColor" stroke="none" />
			</Box>
		),
	},
	{
		name: 'FOLD',
		glyph: (
			<Box
				component="svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2.5}
				strokeLinejoin="round"
				sx={{ width: 18, height: 18, flexShrink: 0 }}
			>
				<polygon points="12 2 22 12 12 22 2 12" />
			</Box>
		),
	},
];

export const HomeLogos = () => {
	return (
		<Box
			component="section"
			sx={{
				py: 6,
				bgcolor: 'background.default',
			}}
		>
			<Container maxWidth="lg" sx={{ textAlign: 'center' }}>
				<Typography
					sx={{
						fontSize: 12,
						fontWeight: 600,
						textTransform: 'uppercase',
						letterSpacing: '0.2em',
						color: 'text.disabled',
						mb: 4,
					}}
				>
					Trusted by 2,000+ social teams worldwide
				</Typography>
				<Box
					sx={{
						display: 'flex',
						flexWrap: 'wrap',
						justifyContent: 'center',
						alignItems: 'center',
						columnGap: { xs: 6, md: 8 },
						rowGap: 3,
					}}
				>
					{LOGOS.map((logo) => {
						return (
							<Stack
								key={logo.name}
								direction="row"
								alignItems="center"
								spacing={1.25}
								sx={{
									fontSize: { xs: 24, md: 26 },
									fontWeight: 800,
									letterSpacing: '-0.02em',
									color: 'text.disabled',
									cursor: 'default',
									userSelect: 'none',
									transition: 'color 0.3s ease',
									'&:hover': { color: 'text.primary' },
								}}
							>
								{logo.glyph}
								<span>{logo.name}</span>
							</Stack>
						);
					})}
				</Box>
			</Container>
		</Box>
	);
};
