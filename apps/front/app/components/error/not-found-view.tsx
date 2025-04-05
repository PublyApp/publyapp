import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

import PageNotFoundIllustration from '@/front/assets/illustrations/page-not-found-illustration';
import { SimpleLayout } from '@/front/layouts/simple/layout';

import { MotionContainer } from '../animate/motion-container';
import { varBounce } from '../animate/variants/bounce';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

export const NotFoundView = () => {
	return (
		<SimpleLayout
			slotProps={{
				content: { compact: true },
			}}
		>
			<Container component={MotionContainer}>
				<m.div variants={varBounce('in')}>
					<Typography variant="h3" sx={{ mb: 2 }}>
						Sorry, page not found!
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<Typography sx={{ color: 'text.secondary' }}>
						Sorry, we couldn’t find the page you’re looking for. Perhaps you’ve mistyped the URL? Be sure to check your
						spelling.
					</Typography>
				</m.div>

				<m.div variants={varBounce('in')}>
					<PageNotFoundIllustration sx={{ my: { xs: 5, sm: 10 } }} />
				</m.div>

				<Button component={RouterLink} href="/" size="large" variant="contained">
					Go to home
				</Button>
			</Container>
		</SimpleLayout>
	);
};
