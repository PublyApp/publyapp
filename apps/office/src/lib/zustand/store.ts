import _ from 'lodash';
import { create } from 'zustand';

import { /* defaultRootValues, */ getInitialStore /* persistedFields, */, type RootState } from './slices';
import { combinedMiddlewares } from './utils/middleware';

// import { getUrlSearch } from './utils/utils';

export const useMainStore = create<RootState>()(
	combinedMiddlewares(
		(...a) => {
			return getInitialStore(...a);
		},
		// [
		// 	//
		// 	...persistedFields,
		// ],
	),
);

const buildURLSuffix = (params: DeepPartial<RootState>, version = 0) => {
	const searchParams = new URLSearchParams();

	const zustandStoreParams = {
		state: params,
		version, // version is here because that is included with how Zustand sets the state
	};

	// The URL param key should match the name of the store, as specified as in storageOptions above
	searchParams.set('store', JSON.stringify(zustandStoreParams));
	return decodeURIComponent(searchParams.toString());
};

export const buildShareableUrl = (baseURL: string, params: DeepPartial<RootState>, version = 0) => {
	// ${window.location.origin}
	return `${baseURL}?${buildURLSuffix(params, version)}`;
};

// const syncPopstateEvent = () => {
// 	window.addEventListener('popstate', () => {
// 		const searchParams = new URLSearchParams(getUrlSearch());
// 		const str = decodeURIComponent(searchParams.get('store') || '{}');
// 		const val = JSON.parse(str);
// 		const persistedState = val.state || {};

// 		window.isPopstateEventZustand = true;

// 		useMainStore.setState((state) => {
// 			const persistedOnlyDefaultValues = _.pick(defaultRootValues, persistedFields);
// 			// eslint-disable-next-line no-param-reassign, @typescript-eslint/no-unused-vars
// 			state = _.merge(state, persistedOnlyDefaultValues, persistedState);
// 		});
// 	});
// };

// const syncPathnameChangeEvent = () => {
// 	window.addEventListener('pathnameChange', () => {
// 		const searchParams = new URLSearchParams(getUrlSearch());
// 		const str = decodeURIComponent(searchParams.get('store') || '{}');
// 		const val = JSON.parse(str);
// 		const persistedState = val.state || {};

// 		useMainStore.setState((state) => {
// 			const defaultValues = defaultRootValues;
// 			// eslint-disable-next-line no-param-reassign, @typescript-eslint/no-unused-vars
// 			state = _.merge(state, defaultValues, persistedState);
// 		});
// 	});
// };

// export const syncEventsForZustand = () => {
// 	syncPopstateEvent();
// 	syncPathnameChangeEvent();
// };
