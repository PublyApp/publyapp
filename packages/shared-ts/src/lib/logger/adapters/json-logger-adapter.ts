import { nodeProcess } from '../log-level';
import type { ILogger, LogEntry } from '../logger.types';

type Hooks =
	| { on(event: 'beforeExit' | 'exit', listener: () => void): void }
	| null
	| undefined;

const defaultOut = (chunk: string): void => {
	nodeProcess?.stdout.write(chunk);
};

/**
 * Production server: one JSON line per event on stdout. Lines wait in a buffer
 * and are written as one batch after the caller yields, so a log call never
 * blocks; `error` entries and process exit flush synchronously.
 */
export class JsonLoggerAdapter implements ILogger {
	readonly #out: (chunk: string) => void;
	readonly #lines: string[] = [];
	#scheduled = false;

	constructor(
		out: (chunk: string) => void = defaultOut,
		hooks: Hooks = nodeProcess,
	) {
		this.#out = out;
		hooks?.on('beforeExit', () => this.flush());
		hooks?.on('exit', () => this.flush());
	}

	write({ level, message, meta, time }: LogEntry): void {
		const fields = { time: time.toISOString(), level, message };
		// fields last: meta cannot spoof time, level or message
		this.#lines.push(JSON.stringify({ ...fields, ...meta, ...fields }));
		if (level === 'error') {
			this.flush();
		} else if (!this.#scheduled) {
			this.#scheduled = true;
			queueMicrotask(() => this.flush());
		}
	}

	flush(): void {
		this.#scheduled = false;
		if (this.#lines.length === 0) {
			return;
		}
		const chunk = `${this.#lines.join('\n')}\n`;
		this.#lines.length = 0;
		this.#out(chunk);
	}
}
