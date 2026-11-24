import { isServer } from '../constants';
import { type LogEnv, parseLevel, resolveLevel } from './level';
import { createLogger } from './logger';
import type { ILogger, LogSink } from './logger.contract';
import { nodeProcess, viteEnv } from './runtime';
import { BrowserProdSink } from './sinks/browser-prod.sink';
import { JsonStdoutSink } from './sinks/json-stdout.sink';
import { MemorySink } from './sinks/memory.sink';
import { PrettyConsoleSink } from './sinks/pretty-console.sink';

export * from './logger.contract';
export { createLogger } from './logger';
export { MemorySink } from './sinks/memory.sink';

export const readEnv = (): LogEnv => ({
	NODE_ENV: nodeProcess?.env.NODE_ENV ?? viteEnv?.MODE,
	LOG_LEVEL: nodeProcess?.env.LOG_LEVEL ?? viteEnv?.VITE_LOG_LEVEL,
	LOG_SINK: nodeProcess?.env.LOG_SINK ?? viteEnv?.VITE_LOG_SINK,
});

const FORCED_SINKS = {
	json: () => new JsonStdoutSink(),
	pretty: () => new PrettyConsoleSink(),
};

const isForcedSink = (
	name: string | undefined,
): name is keyof typeof FORCED_SINKS =>
	name !== undefined && Object.hasOwn(FORCED_SINKS, name);

const autoSink = ({ NODE_ENV }: LogEnv): LogSink => {
	if (NODE_ENV === 'test') {
		return new MemorySink();
	}
	if (NODE_ENV !== 'production') {
		return new PrettyConsoleSink();
	}
	return isServer ? new JsonStdoutSink() : new BrowserProdSink();
};

/** `LOG_SINK=json|pretty` forces the sink; anything else means automatic. */
export const resolveSink = (env: LogEnv = readEnv()): LogSink =>
	isForcedSink(env.LOG_SINK) ? FORCED_SINKS[env.LOG_SINK]() : autoSink(env);

const env = readEnv();
export const logger: ILogger = createLogger(
	resolveSink(env),
	resolveLevel(env),
);

if (env.LOG_LEVEL && !parseLevel(env.LOG_LEVEL)) {
	logger.warn('Invalid LOG_LEVEL, using the default', { value: env.LOG_LEVEL });
}
if (env.LOG_SINK && !isForcedSink(env.LOG_SINK)) {
	logger.warn('Invalid LOG_SINK, using automatic selection', {
		value: env.LOG_SINK,
	});
}
