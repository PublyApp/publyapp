import { BrowserConsoleLoggerAdapter } from './adapters/browser-console-logger-adapter';
import { MemoryLoggerAdapter } from './adapters/memory-logger-adapter';
import { createLogger } from './create-logger';
import { type LogEnv, parseLevel, readEnv } from './log-level';
import type { ILogger } from './logger.types';

export * from './logger.types';
export { Logger } from './logger';
export { MemoryLoggerAdapter } from './adapters/memory-logger-adapter';

/** Winston and JSON-on-stdout are server-only: the browser always logs to its console. */
const autoAdapter = (env: LogEnv): ILogger => {
	if (env.NODE_ENV === 'test') {
		return new MemoryLoggerAdapter();
	}
	return new BrowserConsoleLoggerAdapter({
		pretty: env.NODE_ENV !== 'production',
	});
};

/** Browser bundle: never imports the Winston or JSON adapter. */
export const resolveAdapter = (env: LogEnv = readEnv()): ILogger =>
	autoAdapter(env);

const env = readEnv();
export const logger = createLogger(env, resolveAdapter(env));

// `LOG_ADAPTER` is server-only (`winston`, `json`): a browser has no stdout, so
// every value resolves to the console rather than dropping lines. Only the
// level needs validating in this entry.
if (env.LOG_LEVEL && !parseLevel(env.LOG_LEVEL)) {
	logger.warn('Invalid LOG_LEVEL, using the default', { value: env.LOG_LEVEL });
}
