import { isServer } from '../constants';
import { BrowserConsoleLoggerAdapter } from './adapters/browser-console-logger-adapter';
import { MemoryLoggerAdapter } from './adapters/memory-logger-adapter';
import { StdoutJsonLoggerAdapter } from './adapters/stdout-json-logger-adapter';
import { createServerWinstonAdapter } from './adapters/winston-logger-adapter';
import { createLogger } from './create-logger';
import { type LogEnv, parseLevel, readEnv } from './log-level';
import type { ILogger } from './logger.types';

export * from './logger.types';
export { Logger } from './logger';
export { MemoryLoggerAdapter } from './adapters/memory-logger-adapter';

/** Development server only; the browser entry never reaches this module. */
const winstonAdapter = (server: boolean): ILogger =>
	server
		? createServerWinstonAdapter()
		: new BrowserConsoleLoggerAdapter({ pretty: true });

const autoAdapter = (env: LogEnv, server: boolean): ILogger => {
	if (env.NODE_ENV === 'test') {
		return new MemoryLoggerAdapter();
	}
	if (env.NODE_ENV === 'production') {
		if (server) {
			return new StdoutJsonLoggerAdapter();
		}
		return new BrowserConsoleLoggerAdapter();
	}
	return winstonAdapter(server);
};

/** `LOG_ADAPTER=winston|json` forces an adapter; anything else is automatic. */
export const resolveAdapter = (
	env: LogEnv = readEnv(),
	server: boolean = isServer,
): ILogger => {
	if (env.LOG_ADAPTER === 'winston') {
		return winstonAdapter(server);
	}
	if (env.LOG_ADAPTER === 'json') {
		return new StdoutJsonLoggerAdapter();
	}
	return autoAdapter(env, server);
};

const isKnownAdapter = (name: string): name is 'winston' | 'json' =>
	name === 'winston' || name === 'json';

const env = readEnv();
export const logger = createLogger(env, resolveAdapter(env));

if (env.LOG_ADAPTER && !isKnownAdapter(env.LOG_ADAPTER)) {
	logger.warn('Invalid LOG_ADAPTER, using automatic selection', {
		value: env.LOG_ADAPTER,
	});
}
if (env.LOG_LEVEL && !parseLevel(env.LOG_LEVEL)) {
	logger.warn('Invalid LOG_LEVEL, using the default', { value: env.LOG_LEVEL });
}
