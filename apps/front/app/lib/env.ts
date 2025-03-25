import _ from 'lodash';

import z from 'zod';

import { deepFreeze } from '@/shared/utils/any.utils';

const envSchema = z.object({
	VITE_SERVER_URL: z.string(),
});

type AppEnv = z.infer<typeof envSchema>;

const dotEnv = {
	VITE_SERVER_URL: import.meta.env.VITE_SERVER_URL,
} satisfies Partial<AppEnv>;

export const env = deepFreeze(envSchema.parse(dotEnv));
