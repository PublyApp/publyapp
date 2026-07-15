import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';

export const IndexRoute = () => {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-4">
			<h1 className="text-2xl font-semibold">{t('welcome-title')}</h1>
			<p className="text-sm text-[var(--publy-foreground-secondary)]">
				{t('welcome-description')}
			</p>
			<p
				className="text-sm text-[var(--publy-foreground-secondary)]"
				data-testid="i18n-greeting"
			>
				{t('hello')}
			</p>
			<Link to="/login" className={buttonVariants({ variant: 'default' })}>
				{t('sign-in')}
			</Link>
		</div>
	);
};

export const Route = createFileRoute('/')({
	component: IndexRoute,
});
