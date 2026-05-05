import Autocomplete, {
	type AutocompleteProps,
} from '@mui/material/Autocomplete';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { Controller, useFormContext } from 'react-hook-form';

export type AutocompleteBaseProps<T> = Omit<
	AutocompleteProps<T, boolean, boolean, boolean>,
	'renderInput'
>;

export type RHFAutocompleteProps<T> = AutocompleteBaseProps<T> & {
	name: string;
	label?: string;
	placeholder?: string;
	helperText?: React.ReactNode;
	slotProps?: AutocompleteBaseProps<T>['slotProps'] & {
		textfield?: TextFieldProps;
	};
};

export const RHFAutocomplete = <T,>({
	name,
	label,
	slotProps,
	helperText,
	placeholder,
	...other
}: RHFAutocompleteProps<T>) => {
	const { control, setValue } = useFormContext();

	const { textfield, ...otherSlotProps } = slotProps ?? {};

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<Autocomplete
						{...field}
						id={`rhf-autocomplete-${name}`}
						onChange={(_event, newValue) => {
							return setValue(name, newValue, { shouldValidate: true });
						}}
						renderInput={(params) => {
							return (
								<TextField
									{...params}
									{...textfield}
									label={label}
									placeholder={placeholder}
									error={!!error}
									helperText={error?.message ?? helperText}
									slotProps={{
										...textfield?.slotProps,
										htmlInput: {
											...params.inputProps,
											autoComplete: 'new-password',
											...textfield?.slotProps?.htmlInput,
										},
									}}
								/>
							);
						}}
						{...other}
						slotProps={otherSlotProps}
					/>
				);
			}}
		/>
	);
};
