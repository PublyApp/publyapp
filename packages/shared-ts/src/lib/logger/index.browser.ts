import { BrowserConsoleLoggerAdapter } from './adapters/browser-console-logger-adapter';
import { JsonLoggerAdapter } from './adapters/json-logger-adapter';
import { MemoryLoggerAdapter } from './adapters/memory-logger-adapter';
import { createLogger } from './create-logger';
import { type LogEnv, parseLevel, readEnv } from './log-level';
import type { ILogger } from './logger.types';

export * from './logger.types';
export { Logger } from './logger';
export { MemoryLoggerAdapter } from './adapters/memory-logger-adapter';

/** Winston is server-only: a forced winston falls back to the console here. */
const autoAdapter = (env: LogEnv): ILogger => {
	if (env.NODE_ENV === 'test') {
		return new MemoryLoggerAdapter();
	}
	return new BrowserConsoleLoggerAdapter({
		pretty: env.NODE_ENV !== 'production',
	});
};

/** Browser bundle: never imports the Winston adapter. */
export const resolveAdapter = (env: LogEnv = readEnv()): ILogger =>
	env.LOG_ADAPTER === 'json' ? new JsonLoggerAdapter() : autoAdapter(env);

const env = readEnv();
export const logger = createLogger(env, resolveAdapter(env));

// `LOG_ADAPTER=winston` is accepted on every platform and degrades to the
// console here, so only the level needs validating in this entry.
if (env.LOG_LEVEL && !parseLevel(env.LOG_LEVEL)) {
	logger.warn('Invalid LOG_LEVEL, using the default', { value: env.LOG_LEVEL });
}
