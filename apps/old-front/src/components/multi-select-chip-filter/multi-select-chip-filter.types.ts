export type MultiSelectChipFilterOption = {
	value: string;
	label: string;
	group?: string;
};

export type MultiSelectChipFilterProps = {
	label: string;
	options: MultiSelectChipFilterOption[];
	value: string[];
	onChange: (next: string[]) => void;
	loading?: boolean;
	searchPlaceholder?: string;
	emptyLabel?: string;
	groupOrder?: string[];
};
