import CustomZod from '@/shared/lib/zod/CustomZod';

import { i18nextServer } from './i18n';

export const defaultZodServer = new CustomZod({ i18n: i18nextServer });
