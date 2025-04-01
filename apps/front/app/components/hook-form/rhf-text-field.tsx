import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { transformValue, transformValueOnBlur, transformValueOnChange } from 'minimal-shared/utils';
import { Controller, useFormContext } from 'react-hook-form';

// ----------------------------------------------------------------------

export type RHFTextFieldProps = TextFieldProps & {
	name: string;
};

export const RHFTextField = ({ name, helperText, slotProps, type = 'text', ...other }: RHFTextFieldProps) => {
	const { control } = useFormContext();

	const isNumberType = type === 'number';

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<TextField
						{...field}
						fullWidth
						value={isNumberType ? transformValue(field.value) : field.value}
						onChange={(event) => {
							const transformedValue = isNumberType ? transformValueOnChange(event.target.value) : event.target.value;

							field.onChange(transformedValue);
						}}
						onBlur={(event) => {
							const transformedValue = isNumberType ? transformValueOnBlur(event.target.value) : event.target.value;

							field.onChange(transformedValue);
						}}
						type={isNumberType ? 'text' : type}
						error={!!error}
						helperText={error?.message ?? helperText}
						slotProps={{
							...slotProps,
							htmlInput: {
								autoComplete: 'off',
								...slotProps?.htmlInput,
								...(isNumberType && { inputMode: 'decimal', pattern: '[0-9]*\\.?[0-9]*' }),
							},
						}}
						{...other}
					/>
				);
			}}
		/>
	);
};
