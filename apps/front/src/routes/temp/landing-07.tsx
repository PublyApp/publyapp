import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/temp/landing-07')({
	component: LandingExploration07,
	staticData: { i18nNamespaces: ['landing-07'], crumbs: 'shell' },
});

function LandingExploration07() {
	const { t } = useTranslation('landing-07');

	return <main className="publy-landing-07">{t('page-placeholder')}</main>;
}
