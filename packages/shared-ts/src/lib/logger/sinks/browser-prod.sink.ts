import type { LogEntry, LogSink } from '../logger.contract';

/** Browser in production: only warn and error, plain console, no styling. */
export class BrowserProdSink implements LogSink {
	write({ level, message, meta }: LogEntry): void {
		if (level === 'warn' || level === 'error') {
			console[level](message, ...(meta ? [meta] : []));
		}
	}
}
