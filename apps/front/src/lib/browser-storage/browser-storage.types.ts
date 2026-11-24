export interface IBrowserStorage {
	get(key: string): string | null;
	set(key: string, value: string): void;
	remove(key: string): void;
}
