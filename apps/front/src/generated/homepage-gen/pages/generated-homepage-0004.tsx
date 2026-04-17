import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const GeneratedHomepage0004Page = () => {
	return (
		<Box
			sx={{
				bgcolor: 'background.default',
				color: 'text.primary',
				minHeight: '100vh',
				py: { xs: 10, md: 14 },
			}}
		>
			<Container maxWidth="lg">
				<Stack spacing={3}>
					<Typography variant="overline" sx={{ letterSpacing: '0.2em' }}>
						Generated Homepage Slot 4
					</Typography>
					<Typography variant="h1">
						Generated homepage 4 is ready for implementation.
					</Typography>
					<Typography color="text.secondary" variant="h5">
						Replace this scaffold with the generated marketing page for route:
						/homepage-gen/4
					</Typography>
				</Stack>
			</Container>
		</Box>
	);
};

export default GeneratedHomepage0004Page;
