import {
	ErrorComponent,
	Link,
	useLocation,
	useRouter,
} from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

type ErrorLike = {
	[K in keyof Error]?: Error[K];
} & {
	[P in string]?: unknown;
};

const REDACTED_TOKEN = '[REDACTED]';

const sanitizeCookieValue = (rawCookie: string): string => {
	return rawCookie
		.split(';')
		.map((segment) => {
			const [rawName, ...rest] = segment.split('=');
			if (!rawName || rest.length === 0) return segment;

			if (rawName.trim() === SESSION_TOKEN_COOKIE_KEY) {
				return `${rawName}=${REDACTED_TOKEN}`;
			}

			return segment;
		})
		.join(';');
};

const sanitizeValue = (value: unknown): unknown => {
	if (value === null || typeof value !== 'object') {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => sanitizeValue(entry));
	}

	const next: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value as ErrorLike)) {
		const lower = key.toLowerCase();
		if (lower === 'x-session-token' || key === SESSION_TOKEN_COOKIE_KEY) {
			next[key] = REDACTED_TOKEN;
			continue;
		}

		if (lower === 'cookie' && typeof entry === 'string') {
			next[key] = sanitizeCookieValue(entry);
			continue;
		}

		next[key] = sanitizeValue(entry);
	}

	return next;
};

export const toSafeBoundaryLogPayload = (error: unknown) => {
	const errorLike = error as ErrorLike;
	const status =
		(typeof errorLike?.status === 'number' && errorLike.status) ||
		(errorLike?.message && typeof errorLike.message === 'string'
			? undefined
			: undefined);

	const message =
		typeof errorLike?.message === 'string' ? errorLike.message : 'Route error';

	return {
		message,
		status,
		details: sanitizeValue(errorLike),
	};
};

export const logRouteError = (error: unknown) => {
	const payload = toSafeBoundaryLogPayload(error);
	console.error(JSON.stringify(payload));
};

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
	const router = useRouter();
	const isRoot = useLocation({
		select: (location) => location.pathname === '/',
	});

	logRouteError(error);

	return (
		<div className="min-w-0 flex-1 p-4 flex flex-col items-center justify-center gap-6">
			<ErrorComponent error={error} />
			<div className="flex gap-2 items-center flex-wrap">
				<button
					onClick={() => {
						router.invalidate();
					}}
					className={`px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold`}
				>
					Try Again
				</button>
				{isRoot ? (
					<Link
						to="/"
						className={`px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold`}
					>
						Home
					</Link>
				) : (
					<Link
						to="/"
						className={`px-2 py-1 bg-gray-600 dark:bg-gray-700 rounded-sm text-white uppercase font-extrabold`}
						onClick={(e) => {
							e.preventDefault();
							window.history.back();
						}}
					>
						Go Back
					</Link>
				)}
			</div>
		</div>
	);
}
