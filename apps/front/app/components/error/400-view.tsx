import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';

// import PageNotFoundIllustration from '@/front/assets/illustrations/page-not-found-illustration';
import { SimpleCompactContent } from '@/front/layouts/simple/content';
import { SimpleLayout } from '@/front/layouts/simple/layout';

import { MotionContainer } from '../animate/motion-container';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

type View400Props = {
	withLayout?: boolean;
	title?: string;
	description?: string;
};

const View400 = ({ withLayout = true, title, description }: View400Props) => {
	const renderContent = () => {
		return (
			<Container component={MotionContainer}>
				<m.div /* variants={varBounce('in')} */>
					<Typography
						variant="h5"
						sx={(theme) => ({ mb: 0, color: theme.palette.primary.main })}
					>
						400
					</Typography>
				</m.div>

				<m.div /* variants={varBounce('in')} */>
					<Typography variant="h3" sx={{ mb: 2 }}>
						{title ?? '400 Bad Request'}
					</Typography>
				</m.div>

				<m.div /* variants={varBounce('in')} */>
					<Typography sx={{ color: 'text.secondary', mb: 2 }}>
						{description ??
							'The server cannot or will not process the request due to an apparent client error.'}
					</Typography>
				</m.div>

				{/* <m.div variants={varBounce('in')}>
					<PageNotFoundIllustration sx={{ my: { xs: 5, sm: 10 } }} />
				</m.div> */}

				<Button
					component={RouterLink}
					href="/"
					size="large"
					variant="contained"
				>
					Go to home
				</Button>
			</Container>
		);
	};

	if (!withLayout) {
		return (
			<SimpleCompactContent layoutQuery="md">
				{renderContent()}
			</SimpleCompactContent>
		);
	}

	return (
		<SimpleLayout
			slotProps={{
				content: { compact: true },
			}}
		>
			{renderContent()}
		</SimpleLayout>
	);
};

export default View400;
