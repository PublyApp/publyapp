import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/temp/landing-08')({
	component: LandingExploration08,
	staticData: { i18nNamespaces: ['landing-08'], crumbs: 'shell' },
});

function LandingExploration08() {
	const { t } = useTranslation('landing-08');

	return <main className="publy-landing-08">{t('page-placeholder')}</main>;
}
