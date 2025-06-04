import { isValidElement, type FC, type ReactNode } from 'react';

import type { UseQueryResult } from '@tanstack/react-query';
import _ from 'lodash';
import { checkIfEmptyQueryData } from '../lib/react-query/query-utils';

type Props = {
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	query: UseQueryResult<any, any>;
	loadingStrategy?: 'loading' | 'pending' | 'fetching'; // defaults to 'pending'
	LoadingSlot?: ReactNode | FC;
	ErrorSlot?: ReactNode | FC<{ error: unknown }>;
	EmptySlot?: ReactNode | FC;
	children?: ReactNode;
};

const defaultLoadingElement = <div>Loading...</div>;
const defaultErrorElement = <div>Error...</div>;

const QueryDisplay = ({
	query,
	LoadingSlot,
	ErrorSlot,
	EmptySlot,
	loadingStrategy,
	children,
}: Props) => {
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
		if (_.isFunction(LoadingSlot)) {
			return <LoadingSlot />;
		}

		if (isValidElement(LoadingSlot) && !_.isNil(LoadingSlot)) {
			return LoadingSlot;
		}

		return defaultLoadingElement;
	}

	if (query.isError) {
		if (_.isFunction(ErrorSlot)) {
			return <ErrorSlot error={query.error} />;
		}

		if (isValidElement(ErrorSlot) && !_.isNil(ErrorSlot)) {
			return ErrorSlot;
		}

		return defaultErrorElement;
	}

	const isEmpty = checkIfEmptyQueryData(query);

	if (isEmpty) {
		if (_.isFunction(EmptySlot)) {
			return <EmptySlot />;
		}

		if (isValidElement(EmptySlot) && !_.isNil(LoadingSlot)) {
			return EmptySlot;
		}
	}

	// if query is successful, return children
	return children;
};

export default QueryDisplay;
