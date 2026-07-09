import type { UseQueryResult } from '@tanstack/react-query';
import { type ComponentType, isValidElement, type ReactNode } from 'react';

import { checkIfEmptyQueryData } from '@org/shared-ts/lib/query/query-state';

type LoadingMode = 'loading' | 'pending' | 'fetching';
type LoadingSpinnerProps = {
	size?: 'sm' | 'md' | 'lg';
	className?: string;
};
const LOADING_SPINNER_SIZE_CLASS: Record<
	NonNullable<LoadingSpinnerProps['size']>,
	string
> = {
	sm: 'size-4',
	md: 'size-6',
	lg: 'size-8',
};

type RenderSlot<TProps = object> =
	| ReactNode
	| React.JSXElementConstructor<TProps>;

type Props<TData = unknown, TError = Error> = {
	query: UseQueryResult<TData, TError>;
	loadingStrategy?: LoadingMode; // defaults to 'pending'
	LoadingSlot?: RenderSlot;
	ErrorSlot?: RenderSlot<{
		error: unknown;
		query: UseQueryResult<TData, TError>;
	}>;
	EmptySlot?: RenderSlot;
	children?: ReactNode | ComponentType<{ data: TData }>;
	forceRender?: 'loading' | 'error' | 'empty' | 'data';
};

const renderLoading = (LoadingSlot?: Props['LoadingSlot']) => {
	if (typeof LoadingSlot === 'function') {
		const Slot = LoadingSlot;
		return <Slot />;
	}
	if (isValidElement(LoadingSlot)) {
		return LoadingSlot;
	}
	return LoadingSlot ?? <LoadingSpinner {...defaultLoadingProps} />;
};

const LoadingSpinner = ({ size = 'sm', className }: LoadingSpinnerProps) => (
	<span
		role="status"
		aria-label="Loading"
		className={`${LOADING_SPINNER_SIZE_CLASS[size]} animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground ${
			className ?? ''
		}`}
	/>
);

const renderError = <TData, TError>(
	error: unknown,
	query: UseQueryResult<TData, TError>,
	ErrorSlot?: Props<TData, TError>['ErrorSlot'],
) => {
	if (typeof ErrorSlot === 'function') {
		const Slot = ErrorSlot;
		return <Slot error={error} query={query} />;
	}
	if (isValidElement(ErrorSlot)) {
		return ErrorSlot;
	}
	return <span>An error occurred while loading data.</span>;
};

const renderEmpty = (EmptySlot?: Props['EmptySlot']) => {
	if (typeof EmptySlot === 'function') {
		const Slot = EmptySlot;
		return <Slot />;
	}
	if (isValidElement(EmptySlot)) {
		return EmptySlot;
	}
	return EmptySlot ?? null;
};

const renderData = <TData, TError>(
	query: UseQueryResult<TData, TError>,
	children?: Props<TData, TError>['children'],
) => {
	if (typeof children === 'function') {
		const Slot = children;
		return <Slot data={query.data as TData} />;
	}
	if (isValidElement(children)) {
		return children;
	}
	return children;
};

const defaultLoadingProps: LoadingSpinnerProps = {
	size: 'sm',
};

const QueryDisplay = <TData = unknown, TError = Error>({
	query,
	loadingStrategy = 'pending',
	LoadingSlot,
	ErrorSlot,
	EmptySlot,
	forceRender,
	children,
}: Props<TData, TError>) => {
	if (forceRender) {
		switch (forceRender) {
			case 'loading':
				return renderLoading(LoadingSlot);
			case 'error':
				return renderError(
					query.error ?? new Error('forced error'),
					query,
					ErrorSlot,
				);
			case 'empty':
				return renderEmpty(EmptySlot);
			case 'data':
				return renderData(query, children);
		}
	}

	let showLoading = query.isPending;
	if (loadingStrategy === 'loading') {
		showLoading = query.isLoading;
	} else if (loadingStrategy === 'fetching') {
		showLoading = Boolean(query.isFetching);
	}

	if (showLoading) {
		return renderLoading(LoadingSlot);
	}

	if (query.isError) {
		return renderError(query.error, query, ErrorSlot);
	}

	if (checkIfEmptyQueryData(query)) {
		return renderEmpty(EmptySlot);
	}

	return renderData(query, children);
};

export default QueryDisplay;
