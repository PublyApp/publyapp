import { Dispatch, SetStateAction } from 'react';

import { immer } from 'zustand/middleware/immer';

// @link https://stackoverflow.com/a/70123495/15003148
// eslint-disable-next-line @typescript-eslint/ban-types
const isCallback = (maybeFunction: unknown): maybeFunction is Function => {
	return typeof maybeFunction === 'function';
};

type SetType<T> = Parameters<Parameters<typeof immer<T>>[0]>[0];

// ! works only with immer middleware
export const createSetter = <T extends Record<string, unknown>>(
	set: SetType<T>,
	key: keyof T,
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
): Dispatch<SetStateAction<T[key]>> => {
	return (s) => {
		set((state) => {
			if (isCallback(s)) {
				// eslint-disable-next-line no-param-reassign
				(state as T)[key] = s((state as T)[key]);
				return;
			}

			// eslint-disable-next-line no-param-reassign
			(state as T)[key] = s;
		});
	};
};
