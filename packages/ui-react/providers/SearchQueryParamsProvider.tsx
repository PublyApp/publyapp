import { createContext, Dispatch, ReactNode, SetStateAction, useEffect, useRef } from 'react';

import { useLocation } from 'react-router-dom';
import { createStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import useParsedSearchParams from '@ui-react/hooks/useParsedSearchParams';
import { createSetter } from '@ui-react/zustand/utils';

type Props = { children: ReactNode };

type CreateQsStoreProps = {
	params: Record<string, any>;
};

type QsState = CreateQsStoreProps & {
	setParams: Dispatch<SetStateAction<CreateQsStoreProps['params']>>;
};

const createQsStore = (initialProps?: Partial<CreateQsStoreProps>) => {
	const defaultProps: CreateQsStoreProps = {
		params: {},
	};
	return createStore<QsState>()(
		immer((set) => {
			return {
				...defaultProps,
				...initialProps,
				setParams: createSetter<QsState>(set, 'params'),
			};
		}),
	);
};

type QsStore = ReturnType<typeof createQsStore>;
const QsContext = createContext<QsStore | null>(null);

export const SearchQueryParamsProvider = ({ children }: Props) => {
	const { parsedParams, setParams } = useParsedSearchParams();
	const store = useRef(createQsStore(parsedParams)).current;
	const location = useLocation();

	useEffect(() => {
		setParams();
		store.setState((prev) => {
			prev.params = {};
		});
	}, [location.pathname]);

	return <QsContext.Provider value={store}>{children}</QsContext.Provider>;
};
