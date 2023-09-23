import Parse from 'parse';
import { createContext, useEffect, useMemo, type Dispatch, type PropsWithChildren } from 'react';

import type { ImmerReducer } from 'use-immer';

import { defaultLocale, type AppLocale } from '@devist/shared/i18n/resources';
import { I18N_LOCALE_KEY } from '@devist/shared/utils/constants';

import { usePersistImmerReducer } from '@ui-react/hooks/usePersistImmerReducer';
import i18n, { getCurrentLocale } from '@ui-react/utils/i18n';

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
export const setLocale = (payload: SetLocale['payload']): SetLocale => {
	return { payload, type: AppConTextActionType.SET_LOCALE };
};

export const setBreadcrumbs = (payload: SetBreadcrumbs['payload']): SetBreadcrumbs => {
	return { payload, type: AppConTextActionType.SET_BREADCRUMBS };
};

export const setToast = (payload: SetToast['payload']): SetToast => {
	return { payload, type: AppConTextActionType.SET_TOAST };
};
