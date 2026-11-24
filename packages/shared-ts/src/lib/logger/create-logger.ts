import { type LogEnv, resolveLevel } from './log-level';
import { Logger } from './logger';
import type { ILogger } from './logger.types';

/** Same service wiring for both entries: the adapter is resolved by the caller. */
export const createLogger = (env: LogEnv, adapter: ILogger): Logger =>
	new Logger(adapter, resolveLevel(env));
