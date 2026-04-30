import type { UseQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';

import {
	EmptyContent,
	type EmptyContentProps,
	ErrorContent,
	type ErrorContentProps,
} from '#app/components/empty-content/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

// ----------------------------------------------------------------------

type EmptyContentConfig = {
	title?: string;
	description?: string;
	/**
	 * Render a custom action (e.g., "Create New" button) in the empty state
	 */
	renderAction?: () => React.ReactNode;
	props?: Partial<EmptyContentProps>;
};

type ErrorContentConfig = {
	title?: string;
	description?: string;
	retryLabel?: string;
	props?: Partial<ErrorContentProps>;
};

type UseTableQueryOptionsParams<TData, TError> = {
	/**
	 * The React Query result object
	 */
	query: UseQueryResult<TData, TError>;
	/**
	 * Configuration for the empty state content
	 */
	emptyContent?: EmptyContentConfig;
	/**
	 * Configuration for the error state content
	 */
	errorContent?: ErrorContentConfig;
};

type UseTableQueryOptionsReturn = {
	/**
	 * Render function for empty/error fallback. Spread into MRT table options.
	 */
	renderEmptyRowsFallback: () => React.ReactNode;
	/**
	 * State to spread into the table's state prop
	 */
	queryState: {
		isLoading: boolean;
	};
	/**
	 * Whether the query is in an error state
	 */
	isError: boolean;
	/**
	 * Whether the query is pending/loading
	 */
	isPending: boolean;
	/**
	 * Refetch function from the query
	 */
	refetch: () => void;
};

/**
 * Hook that provides MRT table options for handling query loading, error, and empty states.
 *
 * @example
 * ```tsx
 * const { data, isPending, isError, refetch } = useFindStaffInvitations({ ... });
 *
 * const queryOptions = useTableQueryOptions({
 *   query: { isPending, isError, refetch },
 *   emptyContent: {
 *     title: t('no-items-found', { item: t('invitations') }),
 *     description: t('create-first-item', { item: t('invitation') }),
 *   },
 *   errorContent: {
 *     title: t('error-loading-items', { item: t('invitations') }),
 *   },
 * });
 *
 * const table = useMRTTable('minimal-cursor', {
 *   columns,
 *   data: dataTable,
 *   ...queryOptions,
 *   state: {
 *     ...tableState,
 *     ...queryOptions.queryState,
 *   },
 * });
 * ```
 */
export const useTableQueryOptions = <TData = unknown, TError = Error>({
	query,
	emptyContent,
	errorContent,
}: UseTableQueryOptionsParams<TData, TError>): UseTableQueryOptionsReturn => {
	const { t } = useTranslate();

	const { isPending, isError, refetch } = query;

	// Default content configuration with i18n
	const defaultEmptyContent: EmptyContentConfig = {
		title: t('no-data', { defaultValue: 'No data' }),
		description: undefined,
	};

	const defaultErrorContent: ErrorContentConfig = {
		title: t('an-error-occurred'),
		description: t('please-try-again-or-contact-support'),
		retryLabel: t('retry'),
	};

	// Merge user config with defaults
	const finalEmptyContent = { ...defaultEmptyContent, ...emptyContent };
	const finalErrorContent = { ...defaultErrorContent, ...errorContent };
	const finalEmptyContentRenderAction = finalEmptyContent.renderAction;

	// Memoized fallback renderer
	const renderEmptyRowsFallback = useCallback(() => {
		if (isError) {
			return (
				<ErrorContent
					title={finalErrorContent.title}
					description={finalErrorContent.description}
					onRetry={() => refetch()}
					retryLabel={finalErrorContent.retryLabel}
					sx={[
						{ minHeight: 400 },
						...(Array.isArray(finalErrorContent.props?.sx)
							? finalErrorContent.props.sx
							: [finalErrorContent.props?.sx ?? {}]),
					]}
					{...finalErrorContent.props}
				/>
			);
		}

		return (
			<EmptyContent
				title={finalEmptyContent.title}
				description={finalEmptyContent.description}
				action={finalEmptyContentRenderAction?.()}
				sx={[
					{ minHeight: 400 },
					...(Array.isArray(finalEmptyContent.props?.sx)
						? finalEmptyContent.props.sx
						: [finalEmptyContent.props?.sx ?? {}]),
				]}
				{...finalEmptyContent.props}
			/>
		);
	}, [
		isError,
		finalErrorContent.title,
		finalErrorContent.description,
		finalErrorContent.retryLabel,
		finalErrorContent.props,
		finalEmptyContent.title,
		finalEmptyContent.description,
		finalEmptyContentRenderAction,
		finalEmptyContent.props,
		refetch,
	]);

	return {
		renderEmptyRowsFallback,
		queryState: {
			isLoading: isPending,
		},
		isError,
		isPending,
		refetch,
	};
};
