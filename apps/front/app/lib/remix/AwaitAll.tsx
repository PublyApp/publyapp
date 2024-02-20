/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * https://github.com/remix-run/react-router/discussions/10421
 * */

import type { ReactNode } from 'react';

import { Await } from '@remix-run/react';
import _ from 'lodash';

type Props = {
	children: ReactNode;
} & Record<string, Promise<unknown>>;

const AwaitAll = ({ children, ...rest }: Props) => {
	const initialValue = (higherValues: any) => {
		return _.isFunction(children) ? children(higherValues) : children;
	};

	const reducer = (acc: any, key: string) => {
		return (higherValues: any) => {
			return (
				<Await resolve={rest[key]}>
					{(value) => {
						return acc({
							...higherValues,
							[key]: value,
						});
					}}
				</Await>
			);
		};
	};

	return Object.keys(rest).reduce(reducer, initialValue)({});
};

export default AwaitAll;
