import { Button, Typography } from '@mui/material';
import { Link as RouterLink, useRouteError } from '@remix-run/react';
import { m } from 'framer-motion';

import { varBounce } from '@devist/ui-react/components/animate/variants/bounce';
import Image from '@devist/ui-react/components/image/Image';
import MotionContainer from '@devist/ui-react/components/MotionContainer';

// ----------------------------------------------------------------------

const Error500 = () => {
	const error = useRouteError() as Error;

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
				<Image
					alt="500"
					src="/assets/illustrations/illustration_500.svg"
					sx={{
						mx: 'auto',
						maxWidth: 320,
						my: { xs: 5, sm: 8 },
					}}
				/>
			</m.div>

			<Button component={RouterLink} to="/" size="large" color="inherit" variant="contained">
				Go to Home
			</Button>
		</MotionContainer>
	);
};

export default Error500;
