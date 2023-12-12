// import * as React from 'react';

import { Button, Typography } from '@mui/material';
import { Link } from '@remix-run/react';

const About = () => {
	return (
		<>
			<Typography variant="h4" component="h1" gutterBottom>
				Material UI Remix in TypeScript example
			</Typography>
			<Button variant="contained" component={Link} to="/">
				Go to the main page
			</Button>
		</>
	);
};

export default About;
