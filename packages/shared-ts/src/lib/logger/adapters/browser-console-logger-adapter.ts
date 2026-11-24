import type { ILogger, LogEntry } from '../logger.types';

/** Browser production: plain console, no styling, one call per entry. */
export class BrowserConsoleLoggerAdapter implements ILogger {
	write({ level, message, meta }: LogEntry): void {
		console[level](message, ...(meta ? [meta] : []));
	}
}
