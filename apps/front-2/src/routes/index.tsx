import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';

export const IndexRoute = () => {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-4">
			<h1 className="text-2xl font-semibold">Welcome to the front-2 shell</h1>
			<p className="text-sm text-[var(--publy-foreground-secondary)]">
				Explore navigation, theme, and auth surface foundations from here.
			</p>
			<p
				className="text-sm text-[var(--publy-foreground-secondary)]"
				data-testid="i18n-greeting"
			>
				{t('hello')}
			</p>
			<Button variant="default">Gray UI shell is active</Button>
		</div>
	);
};

export const Route = createFileRoute('/')({
	component: IndexRoute,
});
