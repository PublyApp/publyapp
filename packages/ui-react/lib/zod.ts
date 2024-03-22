import { defaultLocale } from '@/shared/lib/i18n/resources';
import CustomZod from '@/shared/lib/zod/CustomZod';
import i18n, { getInitialLocale } from '@/ui-react/lib/i18n';

const zod = new CustomZod(i18n.getFixedT(defaultLocale));

export const initZod = () => {
	const locale = getInitialLocale();
	zod.t = i18n.getFixedT(locale);
};

export default zod;
