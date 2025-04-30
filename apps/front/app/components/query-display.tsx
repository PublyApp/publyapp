import { isValidElement, type ReactNode } from 'react';

import type { UseQueryResult } from '@tanstack/react-query';
import _ from 'lodash';

type Props = {
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	query: UseQueryResult<any, any>;
	loadingStrategy?: 'loading' | 'pending' | 'fetching'; // defaults to 'pending'
	LoadingSlot?: ReactNode | (() => React.ReactElement);
	ErrorSlot?: ReactNode | ((error: unknown) => React.ReactElement);
	EmptySlot?: ReactNode | (() => React.ReactElement);
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
			return LoadingSlot();
		}

		if (isValidElement(LoadingSlot) && !_.isNil(LoadingSlot)) {
			return LoadingSlot;
		}

		return defaultLoadingElement;
	}

	if (query.isError) {
		if (_.isFunction(ErrorSlot)) {
			return ErrorSlot(query.error);
		}

		if (isValidElement(ErrorSlot) && !_.isNil(ErrorSlot)) {
			return ErrorSlot;
		}

		return defaultErrorElement;
	}

	const isEmpty =
		query.data === undefined ||
		query.data === null ||
		(Array.isArray(query.data) && query.data.length === 0);

	if (isEmpty && isValidElement(EmptySlot) && !_.isNil(LoadingSlot)) {
		return EmptySlot;
	}

	// if query is successful, return children
	return children;
};

export default QueryDisplay;
