import { type StateCreator } from 'zustand';

type AppSliceProps<T, N extends string, D = ExcludeFunctionPropertyNames<T>> = {
	name: N;
	defaultValues: D;
	initializer: StateCreator<Record<StringLiteral<N>, T>, [['zustand/immer', never]], []>;
	persistedFields: string[];
};

export default class Slice<T, N extends string, D = ExcludeFunctionPropertyNames<T>> {
	name: StringLiteral<N>;

	defaultValues: Record<StringLiteral<N>, D>;

	initializer: AppSliceProps<T, N>['initializer'];

	persistedFields: string[];

	// eslint-disable-next-line class-methods-use-this
	get sliceContent(): Record<StringLiteral<N>, T> {
		throw new Error('Slice.sliceContent is only for typing, do not access it!');
	}

	constructor(props: AppSliceProps<T, N, D>) {
		this.name = props.name as never;

		this.defaultValues = {
			[this.name]: props.defaultValues,
		} as never;

		this.initializer = props.initializer;

		this.persistedFields = props.persistedFields.map((field) => {
			return `${this.name}.${field}`;
		});
	}
}
