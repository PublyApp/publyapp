import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useRouter } from '#app/hooks/use-router.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type GenericErrorViewProps = {
	withLayout?: boolean;
	title?: string;
	description?: string;
	error?: Error | string;
};

export const GenericErrorView = ({
	withLayout = true,
	title,
	description,
	error,
}: GenericErrorViewProps) => {
	const { t } = useTranslate();
	const router = useRouter();
	const homePath = useHomePath();

	const errorMessage = error instanceof Error ? error.message : error;

	const errorDetails = errorMessage ? (
		<Box
			sx={{
				p: 2,
				borderRadius: 1,
				bgcolor: 'background.neutral',
				border: 1,
				borderColor: 'divider',
				textAlign: 'left',
			}}
		>
			<Typography
				variant="caption"
				sx={{
					color: 'text.secondary',
					fontFamily: 'monospace',
					wordBreak: 'break-word',
					whiteSpace: 'pre-wrap',
				}}
			>
				{errorMessage}
			</Typography>
		</Box>
	) : undefined;

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="warning"
			icon="solar:danger-triangle-bold"
			title={title ?? t('generic-error-title')}
			description={description ?? t('generic-error-description')}
			errorDetails={errorDetails}
			actions={
				<>
					<Button variant="contained" onClick={() => router.refresh()}>
						{t('try-again')}
					</Button>
					<Button component={RouterLink} href={homePath} variant="outlined">
						{t('go-to-home')}
					</Button>
				</>
			}
		/>
	);
};
