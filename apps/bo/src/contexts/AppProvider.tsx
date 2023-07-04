// import { PropsWithChildren, createContext, useEffect, useMemo, useState } from 'react';

// import { useLocalStorage } from 'react-use';
// // import { useQueryClient } from '@tanstack/react-query';

// import { AppLocale, defaultLocale } from '@aktiveo/shared/i18n/resources';
// import i18n, { getCurrentLocale } from '@aktiveo/ui-react/utils/i18n';
// import { I18N_LOCALE_KEY } from '@aktiveo/shared/utils/constants';

// type Toast = {
// 	type: 'info' | 'success' | 'warning' | 'error';
// 	message: string;
// };

// export type Breadcrumb = {
// 	link: string;
// 	text: string;
// };

// type AppContextType = {
// 	toast: Toast | null;
// 	setToast: (toast: Toast | null) => void;
// 	breadcrumbs: Breadcrumb[];
// 	setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void;
// 	locale: AppLocale;
// 	setLocale: (locale: AppLocale) => void;
// };

// export const AppContext = createContext<AppContextType>({
// 	toast: null,
// 	setToast: () => {},
// 	breadcrumbs: [],
// 	setBreadcrumbs: () => {},
// 	locale: defaultLocale,
// 	setLocale: () => {},
// });

// const AppProvider = ({ children }: PropsWithChildren) => {
// 	const [toast, setToast] = useState<Toast | null>(null);
// 	const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
// 	const [locale, setLocale] = useLocalStorage(I18N_LOCALE_KEY, getCurrentLocale());
// 	// const queryClient = useQueryClient();

// 	useEffect(() => {
// 		Parse.CoreManager.set('REQUEST_HEADERS', {
// 			[I18N_LOCALE_KEY]: locale,
// 		});
// 		i18n.changeLanguage(locale);
// 		// queryClient.invalidateQueries();
// 	}, [locale]);

// 	const memoizedValue = useMemo<AppContextType>(() => {
// 		return {
// 			toast,
// 			setToast,
// 			breadcrumbs,
// 			setBreadcrumbs,
// 			locale,
// 			setLocale,
// 		};
// 	}, [breadcrumbs, locale, setLocale, toast]);

// 	return <AppContext.Provider value={memoizedValue}>{children}</AppContext.Provider>;
// };

// export default AppProvider;

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                               rewrite with useReducer                                //
//                                                                                      //
// --------------------------------------------------------------------------------------//
import { PropsWithChildren, createContext, useEffect, useMemo, Dispatch } from 'react';

import { ImmerReducer } from 'use-immer';
// import { useQueryClient } from '@tanstack/react-query';

import { AppLocale, defaultLocale } from '@aktiveo/shared/i18n/resources';
import i18n, { getCurrentLocale } from '@aktiveo/ui-react/utils/i18n';
import { I18N_LOCALE_KEY } from '@aktiveo/shared/utils/constants';

import { usePersistImmerReducer } from '../hooks/usePersistImmerReducer';

type Toast = {
	type: 'info' | 'success' | 'warning' | 'error';
	message: string;
};

export type Breadcrumb = {
	link: string;
	text: string;
};

type AppContextState = {
	toast: Toast | null;
	breadcrumbs: Breadcrumb[];
	locale: AppLocale;
};
type AppContextType = {
	state: AppContextState;
	dispatch: Dispatch<AppConTextAction>;
};

const initialState = {
	toast: null,
	breadcrumbs: [],
	locale: defaultLocale,
};

export const AppContext = createContext<AppContextType>({
	state: {
		toast: null,
		breadcrumbs: [],
		locale: defaultLocale,
	},
	dispatch: () => {},
});

export enum AppConTextActionType {
	SET_LOCALE = 'setLocale',
	SET_BREADCRUMBS = 'setBreadcrumbs',
	SET_TOAST = 'setToast',
}

type SetLocale = {
	type: AppConTextActionType.SET_LOCALE;
	payload: AppLocale;
};
type SetBreadcrumbs = {
	type: AppConTextActionType.SET_BREADCRUMBS;
	payload: Breadcrumb[];
};
type SetToast = {
	type: AppConTextActionType.SET_TOAST;
	payload: Toast;
};
type AppConTextAction = SetLocale | SetBreadcrumbs | SetToast;

const appContextReducer: ImmerReducer<AppContextState, AppConTextAction> = (
	draft: AppContextState,
	action: AppConTextAction,
) => {
	const { type, payload } = action;

	switch (type) {
		case AppConTextActionType.SET_LOCALE:
			// eslint-disable-next-line no-param-reassign
			draft.locale = payload;
			break;

		case AppConTextActionType.SET_BREADCRUMBS:
			// eslint-disable-next-line no-param-reassign
			draft.breadcrumbs = payload;
			break;

		case AppConTextActionType.SET_TOAST:
			// eslint-disable-next-line no-param-reassign
			draft.toast = payload;
			break;

		default:
			throw new Error('------ appContextReducer Error ----------------');
	}
};

const AppProvider = ({ children }: PropsWithChildren) => {
	const [state, dispatch] = usePersistImmerReducer<AppContextState, AppConTextAction>(
		'xx-app-local-storage',
		appContextReducer,
		initialState,
		(arg) => {
			const locale = getCurrentLocale();

			return {
				...arg,
				locale,
			};
		},
	);

	useEffect(() => {
		Parse.CoreManager.set('REQUEST_HEADERS', {
			[I18N_LOCALE_KEY]: state.locale,
		});
		i18n.changeLanguage(state.locale);
		// queryClient.invalidateQueries();
	}, [state.locale]);

	const memoizedValue = useMemo<AppContextType>(() => {
		return {
			state,
			dispatch,
		};
	}, [state, dispatch]);

	return <AppContext.Provider value={memoizedValue}>{children}</AppContext.Provider>;
};

export default AppProvider;

// --------------------------------------------------------------------------------------//
//                                   action creators                                    //
// --------------------------------------------------------------------------------------//
// eslint-disable-next-line react-refresh/only-export-components
export const setLocale = (payload: SetLocale['payload']): SetLocale => {
	return { payload, type: AppConTextActionType.SET_LOCALE };
};

// eslint-disable-next-line react-refresh/only-export-components
export const setBreadcrumbs = (payload: SetBreadcrumbs['payload']): SetBreadcrumbs => {
	return { payload, type: AppConTextActionType.SET_BREADCRUMBS };
};

// eslint-disable-next-line react-refresh/only-export-components
export const setToast = (payload: SetToast['payload']): SetToast => {
	return { payload, type: AppConTextActionType.SET_TOAST };
};
