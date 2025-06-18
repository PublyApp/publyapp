import path from 'node:path';

import _ from 'lodash';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import z from 'zod';

import { getNumericStringSchema } from '@org/shared/lib/zod/utils';

import { logger } from '@/server/lib/winston';
import { deepFreeze } from '@/shared/utils/any.utils';

import { defaultZodServer } from './zod';

const envSchema = z.object({
	PORT: getNumericStringSchema(defaultZodServer).default('3000'),
	SERVER_URL: z.string(),
	DATABASE_URI: z.string(),
	// ===
	PARSE_MASTER_KEY: z.string(),
	// ===
	CLOUDINARY_NAME: z.string(),
	CLOUDINARY_API_KEY: z.string(),
	CLOUDINARY_API_SECRET: z.string(),
	// ===
	FRONT_URL: z.string(),
});

export type AppEnv = z.infer<typeof envSchema>;

const LOCAL = process.env.ONLINE !== 'true';
const TEST_ONLINE_IN_LOCAL = process.env.TEST_ONLINE === 'true';
const MODE: 'development' | 'production' | 'test' | string =
	process.env.MODE || 'local';

logger.info(`==== LOCAL: ${LOCAL} ====`);
logger.info(`==== MODE: ${MODE} ====`);

// --------------------------------------------------------------------------------------//
//                    override process.env with values in .env file                      //
// --------------------------------------------------------------------------------------//

if (LOCAL || TEST_ONLINE_IN_LOCAL) {
	const envFileName = `.env.${MODE}`;
	const envConfig = dotenv.config({
		path: path.resolve(process.cwd(), envFileName),
		override: true,
	});
	dotenvExpand.expand(envConfig);
}

// --------------------------------------------------------------------------------------//
//                                Type check process.env                                 //
// --------------------------------------------------------------------------------------//

export const env = deepFreeze(
	_.assign(
		{
			MODE,
			LOCAL,
			TEST_ONLINE_IN_LOCAL,
		},
		envSchema.parse(process.env),
	),
);
