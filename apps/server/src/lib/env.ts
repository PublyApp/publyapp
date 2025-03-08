import path from 'path';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import _ from 'lodash';
import z from 'zod';

import { getNumericStringSchema } from '@org/shared/lib/zod/utils';

import { logger } from '@/server/lib/winston';
import { deepFreeze } from '@/shared/utils/any.utils';

import { defaultZodServer } from './zod';

const envSchema = z.object({
	PORT: getNumericStringSchema(defaultZodServer).default('3000'),
	SERVER_URL: z.string(),
	DATABASE_URI: z.string(),
	REST_API_KEY: z.string(),
	EXPRESS_FILES_MOUNT_PATH: z.string(),
	// API_PATH: z.string(),
	// ===
	PARSE_APP_NAME: z.string(),
	PARSE_APP_ID: z.string(),
	// PARSE_PATH: z.string(),
	// PARSE_SERVER_URL: z.string(),
	PARSE_MASTER_KEY: z.string(),
	// ===
	CLOUDINARY_NAME: z.string(),
	CLOUDINARY_API_KEY: z.string(),
	CLOUDINARY_API_SECRET: z.string(),
	// ===
	FRONT_URL: z.string(),
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type AppEnv = z.infer<typeof envSchema>;

global.LOCAL = process.env.ONLINE !== 'true';
global.TEST_ONLINE_IN_LOCAL = process.env.TEST_ONLINE === 'true';
global.MODE = process.env.MODE || 'local';

logger.info(`global.LOCAL: ${global.LOCAL}`);
logger.info(`global.MODE: ${global.MODE}`);

// --------------------------------------------------------------------------------------//
//                    override process.env with values in .env file                      //
// --------------------------------------------------------------------------------------//

if (global.LOCAL || global.TEST_ONLINE_IN_LOCAL) {
	const envFileName = `.env.${global.MODE}`;
	const envConfig = dotenv.config({ path: path.resolve(process.cwd(), envFileName) });
	dotenvExpand.expand(envConfig);
}

// --------------------------------------------------------------------------------------//
//                                Type check process.env                                 //
// --------------------------------------------------------------------------------------//

export const env = deepFreeze(envSchema.parse(process.env));
