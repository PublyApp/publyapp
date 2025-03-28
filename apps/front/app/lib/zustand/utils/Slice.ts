import { type StateCreator } from 'zustand';

type AppSliceProps<T, N extends string, D = ExcludeFunctionPropertyNames<T>> = {
	name: N;
	defaultValues: D;
	// initializer: (set:any) => StateCreator<T, [['zustand/immer', never]], []>;
	initializer: (set: Set<T, N, D>) => T;
	// persistedFields: Paths<D>[];
};

type SliceIgniter<T, N extends string, D> = Slice<T, N, D>['initializer'];
type Set<T, N extends string, D> = Parameters<SliceIgniter<T, N, D>>[0];

export default class Slice<T, N extends string, D = ExcludeFunctionPropertyNames<T>> {
	name: StringLiteral<N>;

	defaultValues: Record<StringLiteral<N>, D>;

	// initializer: AppSliceProps<T, N>['initializer'];
	initializer: StateCreator<Record<StringLiteral<N>, T>, [['zustand/immer', never]], []>;

	// persistedFields: string[];

	// eslint-disable-next-line class-methods-use-this
	get sliceContent(): Record<StringLiteral<N>, T> {
		throw new Error('Slice.sliceContent is only for typing, do not access it!');
	}

	constructor(props: AppSliceProps<T, N, D>) {
		this.name = props.name as never;

		this.defaultValues = {
			[this.name]: props.defaultValues,
		} as never;

		this.initializer = (set) => {
			return {
				[this.name]: props.initializer(set),
			} as never;
		};

		// this.persistedFields = props.persistedFields.map((field) => {
		// 	return `${this.name}.${field}`;
		// });
	}
}
