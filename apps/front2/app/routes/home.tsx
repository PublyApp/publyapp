import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { Box, Button, Container, IconButton, Typography } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => {
	return [
		{ title: 'Front2 - Home' },
		{ name: 'description', content: 'Welcome to Front2' },
	];
};

function ColorSchemeSwitcher() {
	const { mode, setMode } = useColorScheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		// Prevent SSR flash - render placeholder with same dimensions
		return (
			<IconButton disabled sx={{ position: 'absolute', top: 16, right: 16 }}>
				<Box sx={{ width: 24, height: 24 }} />
			</IconButton>
		);
	}

	const toggleColorScheme = () => {
		setMode(mode === 'dark' ? 'light' : 'dark');
	};

	return (
		<IconButton
			onClick={toggleColorScheme}
			color="inherit"
			aria-label="Toggle color scheme"
			sx={{ position: 'absolute', top: 16, right: 16 }}
		>
			{mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
		</IconButton>
	);
}

export default function Home() {
	return (
		<Container maxWidth="md">
			<ColorSchemeSwitcher />
			<Box
				sx={{
					minHeight: '100vh',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					alignItems: 'center',
					gap: 3,
				}}
			>
				<Typography variant="h2" component="h1" fontWeight="bold">
					Welcome to Front2
				</Typography>
				<Typography variant="h6" color="text.secondary" textAlign="center">
					A React Router 7 + Material UI application
				</Typography>
				<Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
					<Button variant="contained" size="large">
						Get Started
					</Button>
					<Button variant="outlined" size="large">
						Learn More
					</Button>
				</Box>
			</Box>
		</Container>
	);
}
