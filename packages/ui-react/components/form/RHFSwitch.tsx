import { FormControlLabel, FormHelperText, Switch, type FormControlLabelProps } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';

// ----------------------------------------------------------------------

interface Props extends Omit<FormControlLabelProps, 'control'> {
	name: string;
	helperText?: React.ReactNode;
}

const RHFSwitch = ({ name, helperText, color, ...other }: Props) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<div>
						<FormControlLabel control={<Switch {...field} checked={field.value} color={color as never} />} {...other} />

						{(!!error || helperText) && (
							<FormHelperText error={!!error}>{error ? error?.message : helperText}</FormHelperText>
						)}
					</div>
				);
			}}
		/>
	);
};

export default RHFSwitch;
