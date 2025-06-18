import { cloudFunction, type ParseJob } from './core';

export const parseJob = <
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
>(
	innerFunction: ParseJob<P, T>,
) => {
	return cloudFunction<P, T>(innerFunction);
};
