import { useTranslation } from 'react-i18next';

export const useTranslate = () => {
	const { i18n, t } = useTranslation();

	// languages configs

	return { i18n, t };
};
