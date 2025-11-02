import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { useRouter } from '@/front/hooks/use-router';
// import ServerErrorIllustration from '@/front/assets/illustrations/server-error-illustration';
import { SimpleCompactContent } from '@/front/layouts/simple/content';
import { SimpleLayout } from '@/front/layouts/simple/layout';
import { MotionContainer } from '../animate/motion-container';

// ----------------------------------------------------------------------

type View500Props = {
	withLayout?: boolean;
};

export const View500 = ({ withLayout = true }: View500Props) => {
	// const error = useRouteError(); // TODO: report error to posthog
	const router = useRouter();

	const renderContent = () => {
		return (
			<Container component={MotionContainer}>
				<m.div /* variants={varBounce('in')} */>
					<Typography
						variant="h5"
						sx={(theme) => ({ mb: 0, color: theme.palette.primary.main })}
					>
						500
					</Typography>
				</m.div>

				<m.div /* variants={varBounce('in')} */>
					<Typography variant="h3" sx={{ mb: 2 }}>
						500 Internal server error
					</Typography>
				</m.div>

				<m.div /* variants={varBounce('in')} */>
					<Typography sx={{ color: 'text.secondary', mb: 2 }}>
						There was an error, please try again later.
					</Typography>
				</m.div>

				{/* <m.div variants={varBounce('in')}>
					<ServerErrorIllustration sx={{ my: { xs: 5, sm: 10 } }} />
				</m.div> */}

				{/*
				 * an error boundary means something crashed
				 * so the most correct solution is to actually trigger a full page reload
				 * or navigate the user somewhere else
				 */}
				<Button
					size="large"
					variant="contained"
					onClick={() => router.refresh()}
				>
					Reload page
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
