import CustomZod from '@/shared/lib/zod/CustomZod';
import { getInitialLocale, i18nextClient } from '@/ui-react/lib/i18n';

export const defaultZodClient = new CustomZod({ i18n: i18nextClient });

export const initZod = () => {
	const locale = getInitialLocale();
	defaultZodClient.setLocale(locale);
};
