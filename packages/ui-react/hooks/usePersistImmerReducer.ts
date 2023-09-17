import { Dispatch /*  useCallback, */, useEffect } from 'react';

import { useLocalStorage } from 'react-use';
import { useImmerReducer, type ImmerReducer } from 'use-immer';

export const usePersistImmerReducer = <S, A>(
	key: string,
	reducer: ImmerReducer<S, A>,
	initialValue: S,
	initializer: (arg: S) => S = (arg) => {
		return arg;
	},
): [S, Dispatch<A>] => {
	const [savedState, saveState] = useLocalStorage(key, initialValue);
	const [state, dispatch] = useImmerReducer(reducer, savedState || initialValue, initializer);

	useEffect(() => {
		saveState(state);
	}, [saveState, state]);

	return [state, dispatch];
};
