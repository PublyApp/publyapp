import { TextField, type TextFieldProps } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';

type Props = TextFieldProps & {
	name: string;
};

const RHFTextField = ({ name, helperText, type, ...other }: Props) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<TextField
						{...field}
						fullWidth
						type={type}
						value={undefined} // ! I want an uncontrolled field
						defaultValue={type === 'number' && field.value === 0 ? '' : field.value}
						onChange={(event) => {
							if (type === 'number') {
								field.onChange(Number(event.target.value));
							} else {
								field.onChange(event.target.value);
							}
						}}
						error={!!error}
						helperText={error ? error?.message : helperText}
						{...other}
					/>
				);
			}}
		/>
	);
};

export default RHFTextField;
