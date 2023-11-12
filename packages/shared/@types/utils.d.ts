/* eslint-disable @typescript-eslint/ban-types */
type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

type ExcludeFunctionPropertyNames<T> = Pick<
	T,
	{
		[K in keyof T]: T[K] extends Function ? never : K;
	}[keyof T]
>;

type StringLiteral<T> = T extends `${string & T}` ? T : never;
