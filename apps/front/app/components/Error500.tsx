import { Box, Button, Typography } from '@mui/material';
import { useRouteError } from '@remix-run/react';
import { m } from 'framer-motion';

import { varBounce } from '@devist/ui-react/components/animate/variants/bounce';
import MotionContainer from '@devist/ui-react/components/MotionContainer';

import RouterLink from './RouterLink';

// ----------------------------------------------------------------------

type Props = {
	error?: Error;
};

const Error500 = ({ error: _error }: Props) => {
	let error = _error;
	const iErr = (useRouteError() as Error | undefined) || Error('unknown error');
	error = error || iErr;

	return (
		<MotionContainer>
			<m.div variants={varBounce().in}>
				<Typography variant="h3" paragraph>
					500 Internal Server Error
				</Typography>
			</m.div>

			<m.div variants={varBounce().in}>
				<Typography sx={{ color: 'text.secondary' }}>There was an error, please try again later.</Typography>
				<Typography color="red">{error.message}</Typography>
			</m.div>

			<m.div variants={varBounce().in}>
				{/* <Image
					alt="500"
					// src="/assets/illustrations/illustration_500.svg"
					src={error500Illustration}
					sx={{
						mx: 'auto',
						maxWidth: 320,
						my: { xs: 5, sm: 8 },
					}}
				/> */}
				<Box
					src="/assets/illustrations/illustration_500.svg"
					component="img"
					sx={{
						mx: 'auto',
						maxWidth: 320,
						my: { xs: 5, sm: 8 },
					}}
				/>
			</m.div>

			<Button component={RouterLink} href="/" size="large" color="inherit" variant="contained">
				Go to Home
			</Button>
		</MotionContainer>
	);
};

export default Error500;
