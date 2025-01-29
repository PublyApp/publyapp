import { isValidElement, type ReactNode } from 'react';

import type { UseQueryResult } from '@tanstack/react-query';

type Props = {
	queryResult: UseQueryResult<any, any>;
	loadingStrategy?: 'loading' | 'pending' | 'fetching';
	loadingElement?: ReactNode;
	errorElement?: ReactNode;
	children?: ReactNode;
};

const defaultLoadingElement = <div>Loading...</div>;
const defaultErrorElement = <div>Error...</div>;

const QueryDisplay = ({ queryResult, loadingElement, errorElement, loadingStrategy, children }: Props) => {
	let showLoading: boolean;

	switch (loadingStrategy) {
		case 'loading': {
			showLoading = queryResult.isLoading;
			break;
		}

		case 'fetching': {
			showLoading = queryResult.isFetching;
			break;
		}

		default: {
			showLoading = queryResult.isPending;
			break;
		}
	}

	if (showLoading) {
		if (isValidElement(loadingElement)) {
			return loadingElement;
		}

		return defaultLoadingElement;
	}

	if (queryResult.isError && !queryResult.data) {
		if (isValidElement(errorElement)) {
			return errorElement;
		}

		return defaultErrorElement;
	}

	return children;
};

export default QueryDisplay;
