import { Dispatch, /*  useCallback, */ useEffect } from 'react';

import { ImmerReducer, useImmerReducer } from 'use-immer';
import { useLocalStorage } from 'react-use';
// import type { Draft } from 'immer';

// type Draft<S> = Parameters<ImmerReducer<S, any>>[0];

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

// export const usePersistReducer2 = <S, A>(
// 	key: string,
// 	reducer: ImmerReducer<S, A>,
// 	initialValue: S,
// 	initializer: (arg: S) => S,
// ): [S, Dispatch<A>] => {
// 	const [savedState, saveState] = useLocalStorage(key, initialValue);

// 	const reducerLocalStorage: ImmerReducer<S, A> = useCallback(
// 		// give `reducerLocalStorage` the same TS API
// 		// as the underlying `reducer` function
// 		(state: S, action: A): S => {
// 			const newState = reducer(state, action);

// 			saveState(newState);

// 			return newState;
// 		},
// 		[saveState],
// 	);

// 	return useImmerReducer(reducerLocalStorage, savedState, initializer);
// };
