import { nodeProcess } from '../log-level';
import type { ILogger, LogEntry } from '../logger.types';

const defaultOut = (chunk: string): void => {
	nodeProcess?.stdout.write(chunk);
};

/**
 * Production server: one JSON line per event on stdout. Every line is handed
 * to stdout before `write` returns: a line kept in a JS buffer would be lost
 * when the process is stopped by SIGTERM, which Node does not turn into an
 * `exit` event.
 */
export class JsonLoggerAdapter implements ILogger {
	readonly #out: (chunk: string) => void;

	constructor(out: (chunk: string) => void = defaultOut) {
		this.#out = out;
	}

	write({ level, message, meta, time }: LogEntry): void {
		const fields = { time: time.toISOString(), level, message };
		// fields last: meta cannot spoof time, level or message
		this.#out(`${JSON.stringify({ ...fields, ...meta, ...fields })}\n`);
	}
}
