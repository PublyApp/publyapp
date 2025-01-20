import i18next, { type i18n as I18n } from 'i18next';

import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import CustomZod from '@/shared/lib/zod/CustomZod';

// eslint-disable-next-line import/no-mutable-exports, prefer-const
export const defaultZodClient = new CustomZod({ i18n: i18next });

// ! This must be called after initI18nOnClient(): the order of the calls in entry.client.tsx is important
export const initZodOnClient = (i18n: I18n) => {
	const locale = getCorrectLocale(i18n.language);
	defaultZodClient.setLocale(locale);
};
