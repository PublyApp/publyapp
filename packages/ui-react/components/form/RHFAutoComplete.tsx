import { useMemo } from 'react';

import { Autocomplete, TextField, type AutocompleteProps } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';

interface Props<
	T,
	Multiple extends boolean | undefined,
	DisableClearable extends boolean | undefined,
	FreeSolo extends boolean | undefined,
> extends AutocompleteProps<T, Multiple, DisableClearable, FreeSolo> {
	name: string;
	label?: string;
	placeholder?: string;
	helperText?: React.ReactNode;
}

const RHFAutocomplete = <
	T,
	Multiple extends boolean | undefined,
	DisableClearable extends boolean | undefined,
	FreeSolo extends boolean | undefined,
>({
	name,
	label,
	placeholder,
	helperText,
	...other
}: Omit<Props<T, Multiple, DisableClearable, FreeSolo>, 'renderInput'>) => {
	const { control, setValue } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				// eslint-disable-next-line react-hooks/rules-of-hooks
				const defaultValue = useMemo(() => {
					return field.value;
					// eslint-disable-next-line react-hooks/exhaustive-deps
				}, []);

				return (
					<Autocomplete
						{...field}
						value={undefined} // ! I want an uncontrolled field
						defaultValue={defaultValue}
						onChange={(_event, newValue) => {
							return setValue(name, newValue, { shouldValidate: true });
						}}
						renderInput={(params) => {
							return (
								<TextField
									label={label}
									placeholder={placeholder}
									error={!!error}
									helperText={error ? error?.message : helperText}
									{...params}
								/>
							);
						}}
						{...other}
					/>
				);
			}}
		/>
	);
};

export default RHFAutocomplete;
