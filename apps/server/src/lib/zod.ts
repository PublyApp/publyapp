import { defaultLocale } from '@/shared/lib/i18n/resources';
import CustomZod from '@/shared/lib/zod/CustomZod';

import { getT } from './i18n';

export const defaultZod = new CustomZod(getT(defaultLocale));
