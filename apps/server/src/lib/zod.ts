import InterZod from '@/shared/lib/zod/InterZod';

import { i18nextServer } from './i18n';

export const defaultZodServer = new InterZod({ i18n: i18nextServer });
