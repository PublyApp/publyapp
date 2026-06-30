import { Button, Card } from '@heroui/react';
import type { QueryClient } from '@tanstack/react-query';
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router';
import { createClientOnlyFn } from '@tanstack/react-start';
import type { i18n as I18nInstance } from 'i18next';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import {
	createI18nFromResources,
	dirForLocale,
	FALLBACK_LANGUAGE,
	type I18nResources,
	type SupportedLanguage,
} from '~/lib/i18n.shared';
import { loadI18nForRequest } from '~/server/i18n-locale';

import appCss from '../styles/app.css?url';

type RootLoaderData = {
	locale: SupportedLanguage;
	resources: I18nResources;
};

const FALLBACK_I18N_RESOURCES: I18nResources = {
	[FALLBACK_LANGUAGE]: {
		common: {},
		zod: {},
		'response-message': {},
	},
};

const initI18nOnClient = createClientOnlyFn(async (instance: I18nInstance) => {
	const mod = await import('~/lib/i18n.client');
	return mod.initI18nOnClient(instance);
});

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		links: [{ rel: 'stylesheet', href: appCss }],
	}),
	loader: async (): Promise<RootLoaderData> => loadI18nForRequest(),
	component: RootComponent,
});

function RootComponent() {
	const data = Route.useLoaderData({
		structuralSharing: false,
	}) as RootLoaderData | undefined;
	const locale = data?.locale ?? FALLBACK_LANGUAGE;
	const resources = data?.resources ?? FALLBACK_I18N_RESOURCES;
	const i18n = React.useMemo(
		() => createI18nFromResources(locale, resources),
		[locale, resources],
	);

	React.useEffect(() => {
		void initI18nOnClient(i18n);
	}, [i18n]);

	return (
		<html lang={locale} dir={dirForLocale(locale)} className="front-2-shell">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>front-2</title>
				<HeadContent />
			</head>
			<body>
				<I18nextProvider i18n={i18n}>
					<div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-100 p-8">
						<header className="mb-8 flex items-center justify-between rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
							<strong className="text-lg font-semibold">front-2 shell</strong>
							<Button variant="primary">Hello</Button>
							<span data-testid="i18n-greeting">{i18n.t('common:hello')}</span>
						</header>
						<Card className="mx-auto max-w-3xl p-4">
							<Outlet />
						</Card>
					</div>
				</I18nextProvider>
				<Scripts />
			</body>
		</html>
	);
}
