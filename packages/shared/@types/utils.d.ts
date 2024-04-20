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

/**
 * @link https://stackoverflow.com/a/76716684/15003148
 * @link https://github.com/KamilHs/type-samurai
 */
type ToPrimitive<T> = T extends string
	? string
	: T extends number
		? number
		: T extends null
			? null
			: T extends undefined
				? undefined
				: T extends boolean
					? boolean
					: T extends bigint
						? bigint
						: T extends symbol
							? symbol
							: {
									[K in keyof T]: ToPrimitive<T[K]>;
								};

/**
 * Generic function that accepts any number of parameters.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GenericFunction = ((...args: any[]) => any) | ((...args: any[]) => Promise<any>);
