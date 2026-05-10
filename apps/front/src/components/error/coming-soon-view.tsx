import Button from '@mui/material/Button';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type ComingSoonViewProps = {
	withLayout?: boolean;
	title?: string;
	description?: string;
};

// Used by routes that are wired in IA but not built yet (or feature-flagged
// off in this environment). Distinct from View403 which is for "you don't
// have permission" — semantically these pages aren't forbidden, they're
// simply not available yet.
export const ComingSoonView = ({
	withLayout = true,
	title,
	description,
}: ComingSoonViewProps) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="primary"
			icon="solar:clock-circle-outline"
			title={title ?? t('coming-soon')}
			description={description ?? t('coming-soon-sentence')}
			actions={
				<Button component={RouterLink} href={homePath} variant="contained">
					{t('go-to-home')}
				</Button>
			}
		/>
	);
};
