import { Button } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const IndexRoute = () => {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-4">
			<h1 className="text-2xl font-semibold">Welcome to the front-2 shell</h1>
			<p className="text-sm text-slate-700 dark:text-slate-300">
				Explore navigation, theme, and auth surface foundations from here.
			</p>
			<p
				className="text-sm text-slate-700 dark:text-slate-300"
				data-testid="i18n-greeting"
			>
				{t('hello')}
			</p>
			<Button variant="primary">HeroUI shell is active</Button>
		</div>
	);
};

export const Route = createFileRoute('/')({
	component: IndexRoute,
});
