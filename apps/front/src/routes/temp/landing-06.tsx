import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/temp/landing-06')({
	component: LandingExploration06,
	staticData: { i18nNamespaces: ['landing-06'], crumbs: 'shell' },
});

function LandingExploration06() {
	const { t } = useTranslation('landing-06');

	return <main className="publy-landing-06">{t('page-placeholder')}</main>;
}
