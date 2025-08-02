import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { useHomePath } from '@/front/hooks/use-home-path';
import { useTranslate } from '@/front/hooks/use-translate';
import { SimpleCompactContent } from '@/front/layouts/simple/content';
import { SimpleLayout } from '@/front/layouts/simple/layout';
import { MotionContainer } from '../animate/motion-container';
import { RouterLink } from '../router-link';

// ----------------------------------------------------------------------

type NotFoundViewProps = {
	withLayout?: boolean;
	title?: string;
	description?: string;
};

export const NotFoundView = ({
	withLayout = true,
	title,
	description,
}: NotFoundViewProps) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	const renderContent = () => {
		return (
			<Container component={MotionContainer}>
				<m.div /* variants={varBounce('in')} */>
					<Typography
						variant="h5"
						sx={(theme) => ({ mb: 0, color: theme.palette.primary.main })}
					>
						404
					</Typography>
				</m.div>

				<m.div /* variants={varBounce('in')} */>
					<Typography variant="h3" sx={{ mb: 2 }}>
						{title || 'Sorry, page not found!'}
					</Typography>
				</m.div>

				<m.div /* variants={varBounce('in')} */>
					<Typography sx={{ color: 'text.secondary', mb: 2 }}>
						{description || t('not-found-sentence')}
					</Typography>
				</m.div>

				{/* <m.div variants={varBounce('in')}>
					<PageNotFoundIllustration sx={{ my: { xs: 5, sm: 10 } }} />
				</m.div> */}

				<Button
					component={RouterLink}
					href={homePath}
					size="large"
					variant="contained"
				>
					{t('go-to-home')}
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
