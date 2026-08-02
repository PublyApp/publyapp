import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/temp/landing-05-a')({
	component: LandingExploration05A,
	staticData: { i18nNamespaces: ['landing-05-a'], crumbs: 'shell' },
});

function LandingExploration05A() {
	const { t } = useTranslation('landing-05-a');

	return <main className="publy-landing-05-a">{t('landing-hero-title')}</main>;
}
