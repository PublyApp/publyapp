import { Spinner, type SpinnerProps } from '@heroui/react';
import type { UseQueryResult } from '@tanstack/react-query';
import {
	type ComponentType,
	isValidElement,
	type ReactNode,
} from 'react';

import { checkIfEmptyQueryData } from '@org/shared-ts/lib/query/query-state';

type LoadingMode = 'loading' | 'pending' | 'fetching';

type RenderSlot<TProps = object> = ReactNode | ComponentType<TProps>;

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

type DefaultLoadingProps = SpinnerProps & {
	label?: string;
};

const renderLoading = (LoadingSlot?: Props['LoadingSlot']) => {
	if (typeof LoadingSlot === 'function') {
		return <LoadingSlot />;
	}
	if (isValidElement(LoadingSlot)) {
		return LoadingSlot;
	}
	return <Spinner {...defaultLoadingProps} label="Loading..." />;
};

const renderError = <TData, TError>(
	error: unknown,
	query: UseQueryResult<TData, TError>,
	ErrorSlot?: Props<TData, TError>['ErrorSlot'],
) => {
	if (typeof ErrorSlot === 'function') {
		return <ErrorSlot error={error} query={query} />;
	}
	if (isValidElement(ErrorSlot)) {
		return ErrorSlot;
	}
	return null;
};

const renderEmpty = (EmptySlot?: Props['EmptySlot']) => {
	if (typeof EmptySlot === 'function') {
		return <EmptySlot />;
	}
	if (isValidElement(EmptySlot)) {
		return EmptySlot;
	}
	return null;
};

const renderData = <TData, TError>(
	query: UseQueryResult<TData, TError>,
	children?: Props<TData, TError>['children'],
) => {
	if (typeof children === 'function') {
		return children({ data: query.data as TData });
	}
	return children;
};

const defaultLoadingProps = {
	color: 'default' as const,
	variant: 'dots' as const,
	size: 'sm' as const,
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
				return renderError(query.error ?? new Error('forced error'), query, ErrorSlot);
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
