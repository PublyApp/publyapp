import { queryParamKey } from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';

export const getRequestLocale = (request: Request) => {
	const url = new URL(request.url);
	const language = url.searchParams.get(queryParamKey.language);
	const locale = getCorrectLocale(language);
	return locale;
};
