import { Spinner, type SpinnerProps } from '@heroui/react';
import isFunction from 'lodash/isFunction';
import isNil from 'lodash/isNil';
import type { UseQueryResult } from '@tanstack/react-query';
import { type FC, isValidElement, type ReactNode } from 'react';

import { checkIfEmptyQueryData } from '@org/shared-ts/lib/query/query-state';

type LoadingMode = 'loading' | 'pending' | 'fetching';

type Props<TData = unknown, TError = Error> = {
	query: UseQueryResult<TData, TError>;
	loadingStrategy?: LoadingMode; // defaults to 'pending'
	LoadingSlot?: ReactNode | FC;
	ErrorSlot?: ReactNode | FC<{ error: unknown; query: UseQueryResult<TData, TError> }>;
	EmptySlot?: ReactNode | FC;
	children?: ReactNode | FC<{ data: TData }>;
	forceRender?: 'loading' | 'error' | 'empty' | 'data';
};

type DefaultLoadingProps = SpinnerProps & {
	label?: string;
};

const renderLoading = (LoadingSlot?: Props['LoadingSlot']) => {
	if (isFunction(LoadingSlot)) {
		return <LoadingSlot />;
	}
	if (isValidElement(LoadingSlot) && !isNil(LoadingSlot)) {
		return LoadingSlot;
	}
	return <Spinner label="Loading..." {...(defaultLoadingProps satisfies DefaultLoadingProps)} />;
};

const renderError = <TData, TError>(
	error: unknown,
	query: UseQueryResult<TData, TError>,
	ErrorSlot?: Props<TData, TError>['ErrorSlot'],
) => {
	if (isFunction(ErrorSlot)) {
		return <ErrorSlot error={error} query={query} />;
	}
	if (isValidElement(ErrorSlot) && !isNil(ErrorSlot)) {
		return ErrorSlot;
	}
	return <div className="text-sm text-danger">Error loading data</div>;
};

const renderEmpty = (EmptySlot?: Props['EmptySlot']) => {
	if (isFunction(EmptySlot)) {
		return <EmptySlot />;
	}
	if (isValidElement(EmptySlot) && !isNil(EmptySlot)) {
		return EmptySlot;
	}
	return <div className="text-sm text-neutral-500">No data found</div>;
};

const renderData = <TData, TError>(
	query: UseQueryResult<TData, TError>,
	children?: Props<TData, TError>['children'],
) => {
	if (isFunction(children)) {
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
				return renderError(new Error('forced error'), query, ErrorSlot);
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
		showLoading = query.isFetching;
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
