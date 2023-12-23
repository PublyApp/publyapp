import Parse from 'parse';

export const cloudRunner = <ReturnType, Params extends Record<string, unknown> = Record<string, unknown>>(
	name: string,
): ((params?: Params, options?: Parse.Cloud.RunOptions) => Promise<ReturnType>) => {
	return (params /* ?: Params, */, options /* ?: Parse.Cloud.RunOptions */) => {
		return Parse.Cloud.run(name, params, options);
	};
};
