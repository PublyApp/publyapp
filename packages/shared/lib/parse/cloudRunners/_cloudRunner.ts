import Parse from 'parse';

type ClouParams = Record<string, unknown>;

export const cloudRunner = <ReturnType, ParamsType extends ClouParams = ClouParams>(
	name: string,
): ((params: ParamsType, options?: Parse.Cloud.RunOptions) => Promise<ReturnType>) => {
	return (params, options) => {
		return Parse.Cloud.run(name, params, options);
	};
};
