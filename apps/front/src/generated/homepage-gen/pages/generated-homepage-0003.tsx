import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const GeneratedHomepage0003Page = () => {
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
						Generated Homepage Slot 3
					</Typography>
					<Typography variant="h1">
						Generated homepage 3 is ready for implementation.
					</Typography>
					<Typography color="text.secondary" variant="h5">
						Replace this scaffold with the generated marketing page for route:
						/homepage-gen/3
					</Typography>
				</Stack>
			</Container>
		</Box>
	);
};

export default GeneratedHomepage0003Page;
