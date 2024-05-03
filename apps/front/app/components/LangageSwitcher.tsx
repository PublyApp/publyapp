import { Link, useLocation } from '@remix-run/react';
import { useTranslation } from 'react-i18next';

import { appLocales } from '@/shared/lib/i18n/resources';

const getPathnameWithoutLocale = (pathname: string) => {
	// const { pathname } = location;

	// const isLocalizedPathname = appLocales.some((locale) => {
	// 	return pathname.startsWith(`/${locale}`);
	// });
	const locale = appLocales.find((iLocale) => {
		return pathname.startsWith(`/${iLocale}`);
	});

	return pathname.substring(1 + (locale?.length ?? 0));
};

const LanguageSwitcher = () => {
	const { i18n } = useTranslation();
	const location = useLocation();

	return (
		<>
			{appLocales.map((language) => {
				return (
					// <button
					// 	type="button"
					// 	key={language}
					// 	onClick={() => {
					// 		return i18n.changeLanguage(language, (err /* , t */) => {
					// 			console.log(language, err /* , t */);
					// 		});
					// 	}}
					// >
					// 	{language}
					// </button>
					<div key={language}>
						<Link
							to={`/${language}/${getPathnameWithoutLocale(location.pathname).substring(1)}`}
							onClick={() => {
								return i18n.changeLanguage(language);
							}}
						>
							{language}
						</Link>
						<br />
					</div>
				);
			})}
		</>
	);
};

export { LanguageSwitcher };
