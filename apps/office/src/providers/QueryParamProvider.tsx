import qs from 'query-string';
import { Outlet } from 'react-router-dom';
import { QueryParamProvider as QueryParamProviderLib } from 'use-query-params';
import { ReactRouter6Adapter } from 'use-query-params/adapters/react-router-6';

// type Props = {};

const QueryParamProvider = (/* props: Props */) => {
	return (
		<QueryParamProviderLib
			adapter={ReactRouter6Adapter}
			options={{
				searchStringToObject: qs.parse,
				objectToSearchString: (encodedParam) => {
					return qs.stringify(encodedParam, { arrayFormat: 'bracket', encode: false });
				},
			}}
		>
			<Outlet />
		</QueryParamProviderLib>
	);
};

export default QueryParamProvider;
