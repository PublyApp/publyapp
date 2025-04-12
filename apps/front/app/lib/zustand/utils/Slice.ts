import type { StateCreator } from 'zustand';

type AppSliceProps<Name extends string, Values, Actions> = {
	name: Name;
	defaultValues: Values;
	initializer: (set: Set<Name, Values, Actions>) => Values & Actions;
};

type SliceIgniter<Name extends string, Values, Actions> = Slice<
	Name,
	Values,
	Actions
>['initializer'];
type Set<Name extends string, Values, Actions> = Parameters<
	SliceIgniter<Name, Values, Actions>
>[0];

export default class Slice<Name extends string, Values, Actions> {
	name: StringLiteral<Name>;

	defaultValues: Record<StringLiteral<Name>, Values & Actions>;

	initializer: StateCreator<
		Record<StringLiteral<Name>, Values & Actions>,
		[['zustand/immer', never]],
		[]
	>;

	// eslint-disable-next-line class-methods-use-this
	get sliceContent(): Record<StringLiteral<Name>, Values & Actions> {
		throw new Error('Slice.sliceContent is only for typing, do not access it!');
	}

	constructor(props: AppSliceProps<Name, Values, Actions>) {
		this.name = props.name as never;

		this.defaultValues = {
			[this.name]: props.defaultValues,
		} as never;

		this.initializer = (set) => {
			return {
				[this.name]: props.initializer(set),
			} as never;
		};
	}
}
