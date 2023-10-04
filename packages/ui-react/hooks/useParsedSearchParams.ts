import { useEffect, useState } from 'react';

import qs from 'qs';
import { useSearchParams, type URLSearchParamsInit } from 'react-router-dom';

const useParsedSearchParams = (initializer?: URLSearchParamsInit) => {
	const parseParams = (params: URLSearchParams) => {
		return qs.parse(params.toString());
	};

	const [searchParams, iSetSearchParams] = useSearchParams(initializer);
	const [parsedParams, iSetQueryParams] = useState(parseParams(searchParams));

	useEffect(() => {
		iSetQueryParams(parseParams(searchParams));
	}, [iSetQueryParams, searchParams]);

	return { parsedParams, setParams: iSetSearchParams };
};

export default useParsedSearchParams;

// const Context = createContext();
