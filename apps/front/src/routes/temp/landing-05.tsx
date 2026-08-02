import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/temp/landing-05')({
	component: LandingExploration05,
	staticData: { i18nNamespaces: ['landing-05'], crumbs: 'shell' },
});

function LandingExploration05() {
	const { t } = useTranslation('landing-05');

	return <main className="publy-landing-05">{t('page-placeholder')}</main>;
}
