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
