import { Link } from '@remix-run/react';
import { useTranslation } from 'react-i18next';

import { appLocales } from '@/shared/lib/i18n/resources';

const LanguageSwitcher = () => {
	const { i18n } = useTranslation();

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
							to={`/${language}`}
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
