import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';

export const CSPTest = () => {
	const [results, setResults] = useState<string[]>([]);

	const addResult = (test: string, success: boolean) => {
		setResults((prev) => [
			...prev,
			`${test}: ${success ? '✅ PASSED' : '❌ BLOCKED (CSP working)'}`,
		]);
	};

	const testInlineScript = () => {
		try {
			// This should be blocked by CSP
			eval('console.log("Inline script test")');
			addResult('Inline script (eval)', true);
		} catch (error) {
			addResult('Inline script (eval)', false);
		}
	};

	const testExternalScript = () => {
		const script = document.createElement('script');
		script.src = 'https://example.com/test.js';
		script.onload = () => addResult('External script', true);
		script.onerror = () => addResult('External script', false);
		document.head.appendChild(script);
	};

	const testInlineStyle = () => {
		try {
			const style = document.createElement('style');
			style.textContent = 'body { background: red; }';
			document.head.appendChild(style);
			addResult('Inline style', true);
		} catch (error) {
			addResult('Inline style', false);
		}
	};

	const testExternalImage = () => {
		const img = document.createElement('img');
		img.src = 'https://example.com/test.jpg';
		img.onload = () => addResult('External image', true);
		img.onerror = () => addResult('External image', false);
		document.body.appendChild(img);
	};

	const testExternalFetch = () => {
		fetch('https://example.com/api/test')
			.then(() => addResult('External fetch', true))
			.catch(() => addResult('External fetch', false));
	};

	const clearResults = () => {
		setResults([]);
	};

	// Only show in development
	if (!import.meta.env.DEV) {
		return null;
	}

	return (
		<Box
			sx={{
				position: 'fixed',
				top: 16,
				left: 16,
				zIndex: 9998,
				maxWidth: 300,
				bgcolor: 'background.paper',
				border: 1,
				borderColor: 'divider',
				borderRadius: 1,
				p: 2,
				boxShadow: 2,
			}}
		>
			<Typography variant="h6" gutterBottom>
				CSP Test Panel
			</Typography>

			<Alert severity="info" sx={{ mb: 2 }}>
				Test CSP violations. Blocked tests mean CSP is working correctly.
			</Alert>

			<Stack spacing={1} sx={{ mb: 2 }}>
				<Button size="small" variant="outlined" onClick={testInlineScript}>
					Test Inline Script
				</Button>
				<Button size="small" variant="outlined" onClick={testExternalScript}>
					Test External Script
				</Button>
				<Button size="small" variant="outlined" onClick={testInlineStyle}>
					Test Inline Style
				</Button>
				<Button size="small" variant="outlined" onClick={testExternalImage}>
					Test External Image
				</Button>
				<Button size="small" variant="outlined" onClick={testExternalFetch}>
					Test External Fetch
				</Button>
				<Button size="small" variant="outlined" onClick={clearResults}>
					Clear Results
				</Button>
			</Stack>

			{results.length > 0 && (
				<Box>
					<Typography variant="subtitle2" gutterBottom>
						Test Results:
					</Typography>
					<Stack spacing={0.5}>
						{results.map((result, index) => (
							<Typography key={index} variant="caption" display="block">
								{result}
							</Typography>
						))}
					</Stack>
				</Box>
			)}
		</Box>
	);
};
