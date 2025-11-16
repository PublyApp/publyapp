import type { UseQueryResult } from '@tanstack/react-query';

export const checkIfEmptyQueryData = <TData = unknown, TError = Error>(
	query: UseQueryResult<TData, TError>,
) => {
	const isEmpty =
		query.data === undefined ||
		query.data === null ||
		(Array.isArray(query.data) && query.data.length === 0);

	return !query.isPending && isEmpty;
};

// Utility to generate a stable React Query key from a Kiota-style accessor
export function getQueryKey<T>(fn: (root: T) => unknown): string {
	const path: (string | number)[] = [];

	const proxy: unknown = new Proxy(() => {}, {
		get(_target, prop) {
			path.push(String(prop));
			return proxy;
		},
		apply(_target, _thisArg, args) {
			// record method args (safe because proxy swallows execution)
			path.push(
				...args.map((arg) =>
					typeof arg === 'string' || typeof arg === 'number'
						? arg
						: JSON.stringify(arg),
				),
			);
			return proxy;
		},
	});

	fn(proxy as T); // run accessor on proxy — only records path
	return path.join('.');
}
