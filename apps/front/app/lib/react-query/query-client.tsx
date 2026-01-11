import type { Mutation, Query } from '@tanstack/react-query';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import i18next from 'i18next';

import { toApiFailure } from '@/front/lib/api-failure';
import { isServer } from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

// NOTE: Do NOT import toast at module level - some toast libs crash on SSR import
// We use dynamic import inside safeToast() instead

/**
 * Auth error callback type.
 * Called for 401 errors ONLY from both queries and mutations.
 * 403 = "authenticated but forbidden" → handled by error boundary (View403/switch tenant)
 * This ensures centralized session invalidation regardless of where the error occurs.
 */
export type OnAuthErrorCallback = (
	status: 401,
	failure: ReturnType<typeof toApiFailure>,
) => void;

/**
 * Mutation meta options for controlling global handlers.
 */
declare module '@tanstack/react-query' {
	interface Register {
		mutationMeta: {
			/** Opt-in: Extract and toast translationKey/message from API response */
			showSuccessToast?: boolean;
			/** Opt-in: Override with explicit success message (translation key or string) */
			successMessage?: string;
			/** Opt-out: Component handles validation via form.setError() */
			validationHandledByForm?: boolean;
			/** Opt-out: Component handles all errors locally */
			skipGlobalErrorHandler?: boolean;
			/** Opt-out: Don't trigger onAuthError for 401 (rare: multi-step auth flows) */
			skipAuthErrorHandler?: boolean;
		};
		queryMeta: {
			/** Opt-out: Don't trigger onAuthError for 401 (rare: multi-step auth flows) */
			skipAuthErrorHandler?: boolean;
		};
	}
}

// Cache the toast module promise to avoid multiple imports on rapid toasts
let toastModulePromise: Promise<typeof import('sonner')> | null = null;

// Idempotency flag to prevent multiple parallel 401s from triggering repeated logout/navigation/toasts
let authLogoutInProgress = false;

// Browser-only: current auth error callback (set from app root)
let onAuthErrorRef: OnAuthErrorCallback | undefined;

const setOnAuthErrorCallback = (callback?: OnAuthErrorCallback): void => {
	// Never store per-request callbacks on the server (avoid cross-request leakage)
	if (isServer) return;
	onAuthErrorRef = callback;
};

const getOnAuthErrorCallback = (): OnAuthErrorCallback | undefined => {
	return onAuthErrorRef;
};

/**
 * Reset the auth logout flag.
 * Called by AuthQueriesLoader when a valid session is established.
 * This ensures the flag doesn't stay stuck after SPA navigation (no page reload).
 */
export const resetAuthLogoutFlag = (): void => {
	authLogoutInProgress = false;
};

/**
 * SSR-safe toast wrapper.
 * Uses dynamic import to avoid module-eval crashes on server.
 * Caches the import promise to avoid multiple imports on rapid toasts.
 */
const safeToast = async (
	type: 'success' | 'error',
	message: string,
): Promise<void> => {
	// Guard: don't even start the import on server
	if (isServer) return;

	// Cache the import promise
	if (!toastModulePromise) {
		toastModulePromise = import('sonner');
	}

	const { toast } = await toastModulePromise;

	if (type === 'success') {
		toast.success(message);
	} else {
		toast.error(message);
	}
};

// Fire-and-forget wrapper (handlers can't be async)
// Includes .catch() to avoid unhandled promise rejections
const showToast = (type: 'success' | 'error', message: string): void => {
	safeToast(type, message).catch((err) => {
		// Reset cache so next toast will retry the import
		toastModulePromise = null;
		// Log but don't crash - toast failure shouldn't break the app
		logger.error('[Toast Error]', { error: err });
	});
};

/**
 * SSR-safe and namespace-safe translation helper.
 * Falls back to defaultValue if namespace not loaded.
 */
const safeTranslate = (
	key: string,
	defaultValue: string,
	ns = 'response-message',
): string => {
	// Check if namespace is loaded and key exists
	// Using type assertions to bypass i18next's strict type checking for dynamic keys
	if (i18next.exists(key, { ns: ns as 'response-message' })) {
		return i18next.t(key as never, { ns: ns as 'response-message' }) as string;
	}
	return defaultValue;
};

/**
 * Get user-friendly error message from failure.
 */
const getErrorMessage = (failure: ReturnType<typeof toApiFailure>): string => {
	switch (failure.kind) {
		case 'validation':
			// Generic validation message - specific errors are on form fields
			return failure.translationKey
				? safeTranslate(failure.translationKey, 'Validation failed')
				: (failure.detail ?? 'Please check your input and try again');

		case 'problem':
			return failure.translationKey
				? safeTranslate(
						failure.translationKey,
						failure.detail ?? 'An error occurred',
					)
				: (failure.detail ?? failure.title ?? 'An error occurred');

		case 'network':
			return safeTranslate('network-error', failure.message);

		case 'abort':
			return ''; // Never displayed

		case 'unknown':
			return safeTranslate('unknown-error', 'Something went wrong');
	}
};

/**
 * Create a mutation error handler with auth callback.
 */
const createMutationErrorHandler = () => {
	return (
		error: unknown,
		_variables: unknown,
		_context: unknown,
		mutation: Mutation<unknown, unknown, unknown, unknown>,
	): void => {
		const failure = toApiFailure(error);
		const onAuthError = getOnAuthErrorCallback();

		// Log all errors for debugging (even on server for SSR debugging)
		if (import.meta.env.DEV) {
			logger.error('[Mutation Error]', { kind: failure.kind, failure });
		}

		// Abort errors are ALWAYS silent - user navigated away or request was cancelled
		if (failure.kind === 'abort') {
			return;
		}

		// Centralized auth error handling - 401 ONLY triggers logout
		// 403 = "authenticated but forbidden" → let error boundary show View403/switch tenant
		// Check skipAuthErrorHandler for rare cases (multi-step auth flows)
		if (
			failure.kind === 'problem' &&
			failure.status === 401 &&
			!mutation.meta?.skipAuthErrorHandler
		) {
			// Idempotent: only trigger once even if multiple parallel requests fail
			if (!authLogoutInProgress && onAuthError) {
				authLogoutInProgress = true;
				onAuthError(failure.status, failure);
				// Note: authLogoutInProgress stays true - reset happens in AuthQueriesLoader on next login
			}

			// If we don't have a callback (misconfiguration/init order), don't swallow the error silently.
			// Fall through to normal error handling so users aren't stuck.
			if (onAuthError) {
				// Don't toast 401 errors - the redirect/logout handles the UX
				return;
			}
		}

		// Allow full opt-out of global error handling
		if (mutation.meta?.skipGlobalErrorHandler) {
			return;
		}

		// Validation: toast UNLESS component declared it handles validation
		if (failure.kind === 'validation') {
			if (mutation.meta?.validationHandledByForm) {
				return; // Component handles via mapValidationErrors()
			}
			// Default: toast validation error (component forgot to handle it)
			showToast('error', getErrorMessage(failure));
			return;
		}

		// problem/network/unknown: always toast
		showToast('error', getErrorMessage(failure));
	};
};

/**
 * Extract success message from API response.
 * Looks for translationKey first, then message.
 */
const extractSuccessMessage = (data: unknown): string | null => {
	if (!data || typeof data !== 'object') return null;

	const response = data as Record<string, unknown>;

	// Try translationKey first (our custom field for i18n)
	if (response.translationKey && typeof response.translationKey === 'string') {
		return safeTranslate(
			response.translationKey,
			(response.message as string) ?? 'Success',
		);
	}

	// Fallback to message field
	if (response.message && typeof response.message === 'string') {
		return response.message;
	}

	return null;
};

/**
 * Global mutation success handler.
 * Success toasts are OPT-IN via meta.showSuccessToast or meta.successMessage.
 *
 * Priority:
 * 1. meta.successMessage - explicit message/key (highest priority)
 * 2. meta.showSuccessToast - extract from API response
 * 3. Neither - no toast
 */
const handleMutationSuccess = (
	data: unknown,
	_variables: unknown,
	_context: unknown,
	mutation: Mutation<unknown, unknown, unknown, unknown>,
): void => {
	const meta = mutation.meta;

	// Priority 1: Explicit success message
	if (meta?.successMessage) {
		// Using 'as never' to bypass i18next's strict type checking for dynamic keys
		const message = i18next.exists(meta.successMessage, {
			ns: 'response-message',
		})
			? (i18next.t(meta.successMessage as never, {
					ns: 'response-message',
				}) as string)
			: meta.successMessage;
		showToast('success', message);
		return;
	}

	// Priority 2: Extract from API response
	if (meta?.showSuccessToast) {
		const message = extractSuccessMessage(data);
		if (message) {
			showToast('success', message);
		}
	}

	// Priority 3: Neither - no toast (default)
};

/**
 * Create a query error handler with auth callback.
 * Queries use error boundaries for display, but we still need centralized auth handling.
 */
const createQueryErrorHandler = (onAuthError?: OnAuthErrorCallback) => {
	return (error: unknown, query: Query<unknown, unknown, unknown>): void => {
		const failure = toApiFailure(error);
		const currentOnAuthError = getOnAuthErrorCallback() ?? onAuthError;

		// Don't log abort errors - they're expected during navigation
		if (failure.kind === 'abort') return;

		if (import.meta.env.DEV) {
			logger.error('[Query Error]', { kind: failure.kind, failure });
		}

		// Centralized auth error handling - 401 ONLY triggers logout
		// 403 = "authenticated but forbidden" → let error boundary show View403/switch tenant
		// This catches 401 even if the query never hits an error boundary
		if (
			failure.kind === 'problem' &&
			failure.status === 401 &&
			!query.meta?.skipAuthErrorHandler
		) {
			// Idempotent: only trigger once even if multiple parallel requests fail
			if (!authLogoutInProgress && currentOnAuthError) {
				authLogoutInProgress = true;
				currentOnAuthError(failure.status, failure);
				// Note: authLogoutInProgress stays true - reset happens in AuthQueriesLoader on next login
			} else if (!currentOnAuthError && import.meta.env.DEV) {
				logger.error('[Auth Error Handler Missing]', {
					status: failure.status,
					failure,
				});
			}
		}

		// Don't toast query errors - let error boundaries handle display
	};
};

/**
 * Options for creating the QueryClient.
 */
export type CreateQueryClientOptions = {
	/**
	 * Called when a 401 error occurs (from queries OR mutations).
	 * Use this for centralized auth invalidation (logout, redirect to login, etc.)
	 *
	 * @example
	 * onAuthError: (_status, _failure) => {
	 *   logout({ redirectCause: 'invalid_session' });
	 * }
	 */
	onAuthError?: OnAuthErrorCallback;
	/**
	 * Whether we're in development mode.
	 * @default true
	 */
	isDev?: boolean;
};

const FIVE_MINUTES_IN_MS = 1000 * 60 * 5;

/**
 * Create QueryClient with centralized error handling.
 */
export const createQueryClient = (
	options: CreateQueryClientOptions = {},
): QueryClient => {
	const { onAuthError, isDev = true } = options;

	// Browser-only: allow setting the auth handler even if the client was created elsewhere first.
	if (!isServer) {
		setOnAuthErrorCallback(onAuthError);
	}

	return new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				staleTime: FIVE_MINUTES_IN_MS,
				// Don't retry on 4xx errors or aborts
				retry: (failureCount, error) => {
					if (isDev) {
						return false;
					}

					const failure = toApiFailure(error);

					// Never retry aborts
					if (failure.kind === 'abort') return false;

					// Don't retry client errors (4xx)
					if (
						failure.kind === 'problem' &&
						failure.status >= 400 &&
						failure.status < 500
					) {
						return false;
					}

					// Retry other errors up to 2 times
					return failureCount < 2;
				},
			},
			mutations: {
				retry: false,
			},
		},
		queryCache: new QueryCache({
			onError: createQueryErrorHandler(onAuthError),
		}),
		mutationCache: new MutationCache({
			onError: createMutationErrorHandler(),
			onSuccess: handleMutationSuccess,
		}),
	});
};

// Singleton for client-side
let browserQueryClient: QueryClient | undefined;

/**
 * Get or create the QueryClient singleton.
 * Call this in your app's root to get the client.
 *
 * @param options - Options passed to createQueryClient (only used on first call)
 */
export const getQueryClient = (
	options?: CreateQueryClientOptions,
): QueryClient => {
	// Server: always create new client (no caching across requests)
	if (isServer) {
		return createQueryClient(options);
	}

	// Browser: reuse singleton
	// Still update onAuthError so global 401 handling is available even if the singleton was created earlier.
	if (options?.onAuthError) {
		setOnAuthErrorCallback(options.onAuthError);
	}
	if (!browserQueryClient) {
		browserQueryClient = createQueryClient(options);
	}
	return browserQueryClient;
};
