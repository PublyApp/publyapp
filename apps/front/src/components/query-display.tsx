import type { UseQueryResult } from '@tanstack/react-query';
import _ from 'lodash';
import { type FC, isValidElement, type ReactNode } from 'react';

import { checkIfEmptyQueryData } from '../lib/react-query/query-utils';

type Props<TData = unknown, TError = Error> = {
	query: UseQueryResult<TData, TError>;
	loadingStrategy?: 'loading' | 'pending' | 'fetching'; // defaults to 'pending'
	LoadingSlot?: ReactNode | FC;
	ErrorSlot?: ReactNode | FC<{ error: unknown }>;
	EmptySlot?: ReactNode | FC;
	children?: ReactNode | FC<{ data: TData }>;
	forceRender?: 'loading' | 'error' | 'empty' | 'data';
};

const defaultLoadingElement = <div>Loading...</div>;
const defaultErrorElement = <div>Error...</div>;

const QueryDisplay = <TData = unknown, TError = Error>({
	query,
	LoadingSlot,
	ErrorSlot,
	EmptySlot,
	loadingStrategy,
	forceRender,
	children,
}: Props<TData, TError>) => {
	// Helper to render loading slot
	const renderLoading = () => {
		if (_.isFunction(LoadingSlot)) {
			return <LoadingSlot />;
		}
		if (isValidElement(LoadingSlot) && !_.isNil(LoadingSlot)) {
			return LoadingSlot;
		}
		return defaultLoadingElement;
	};

	// Helper to render error slot
	const renderError = () => {
		if (_.isFunction(ErrorSlot)) {
			return <ErrorSlot error={query.error ?? new Error('Forced error')} />;
		}
		if (isValidElement(ErrorSlot) && !_.isNil(ErrorSlot)) {
			return ErrorSlot;
		}
		return defaultErrorElement;
	};

	// Helper to render empty slot
	const renderEmpty = () => {
		if (_.isFunction(EmptySlot)) {
			return <EmptySlot />;
		}
		if (isValidElement(EmptySlot) && !_.isNil(EmptySlot)) {
			return EmptySlot;
		}
		return null;
	};

	// Helper to render children/data
	const renderData = () => {
		if (_.isFunction(children)) {
			return children({ data: query.data as TData });
		}
		return children;
	};

	// Force render specific state for testing
	if (forceRender) {
		switch (forceRender) {
			case 'loading':
				return renderLoading();
			case 'error':
				return renderError();
			case 'empty':
				return renderEmpty();
			case 'data':
				return renderData();
		}
	}

	// Normal flow
	let showLoading: boolean;

	switch (loadingStrategy) {
		case 'loading': {
			showLoading = query.isLoading;
			break;
		}

		case 'fetching': {
			showLoading = query.isFetching;
			break;
		}

		default: {
			showLoading = query.isPending;
			break;
		}
	}

	if (showLoading) {
		return renderLoading();
	}

	if (query.isError) {
		return renderError();
	}

	const isEmpty = checkIfEmptyQueryData(query);

	if (isEmpty) {
		return renderEmpty();
	}

	return renderData();
};

export default QueryDisplay;
