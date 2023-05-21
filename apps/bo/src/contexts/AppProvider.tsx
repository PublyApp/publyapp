import { PropsWithChildren, createContext, useMemo, useState } from 'react';

type Toast = {
	type: 'info' | 'success' | 'warning' | 'error';
	message: string;
};

export type Breadcrumb = {
	link: string;
	text: string;
};

type AppContextType = {
	toast: Toast | null;
	setToast: (toast: Toast | null) => void;
	breadcrumbs: Breadcrumb[];
	setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void;
};

export const AppContext = createContext<AppContextType>({
	toast: null,
	setToast: () => {},
	breadcrumbs: [],
	setBreadcrumbs: () => {},
});

const AppProvider = ({ children }: PropsWithChildren) => {
	const [toast, setToast] = useState<Toast | null>(null);
	const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);

	const memoizedValue = useMemo<AppContextType>(() => {
		return {
			toast,
			setToast,
			breadcrumbs,
			setBreadcrumbs,
		};
	}, [breadcrumbs, toast]);

	return <AppContext.Provider value={memoizedValue}>{children}</AppContext.Provider>;
};

export default AppProvider;
