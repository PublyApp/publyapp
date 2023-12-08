import * as React from 'react';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link } from '@remix-run/react';

export default function About() {
	return (
		<React.Fragment>
			<Typography variant="h4" component="h1" gutterBottom>
				Material UI Remix in TypeScript example
			</Typography>
			<Button variant="contained" component={Link} to="/">
				Go to the main page
			</Button>
		</React.Fragment>
	);
}
