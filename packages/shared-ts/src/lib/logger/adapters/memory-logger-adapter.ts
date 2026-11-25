import type { ILogger, LogEntry } from '../logger.types';

/** For tests: keeps every entry it receives, already filtered and redacted. */
export class MemoryLoggerAdapter implements ILogger {
	readonly entries: LogEntry[] = [];

	write(entry: LogEntry): void {
		this.entries.push(entry);
	}

	clear(): void {
		this.entries.length = 0;
	}
}
