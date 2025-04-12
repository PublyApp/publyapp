import Autocomplete, {
	type AutocompleteProps,
} from '@mui/material/Autocomplete';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { Controller, useFormContext } from 'react-hook-form';

// ----------------------------------------------------------------------

export type AutocompleteBaseProps = Omit<
	// biome-ignore lint/suspicious/noExplicitAny: code from template leave as is for now
	AutocompleteProps<any, boolean, boolean, boolean>,
	'renderInput'
>;

export type RHFAutocompleteProps = AutocompleteBaseProps & {
	name: string;
	label?: string;
	placeholder?: string;
	helperText?: React.ReactNode;
	slotProps?: AutocompleteBaseProps['slotProps'] & {
		textfield?: TextFieldProps;
	};
};

export const RHFAutocomplete = ({
	name,
	label,
	slotProps,
	helperText,
	placeholder,
	...other
}: RHFAutocompleteProps) => {
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
						{...otherSlotProps}
					/>
				);
			}}
		/>
	);
};
