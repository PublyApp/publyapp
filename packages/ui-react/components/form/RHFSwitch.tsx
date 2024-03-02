import { useMemo } from 'react';

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
				// eslint-disable-next-line react-hooks/rules-of-hooks
				const defaultChecked = useMemo(() => {
					return field.value;
					// eslint-disable-next-line react-hooks/exhaustive-deps
				}, []);

				return (
					<div>
						<FormControlLabel
							control={
								<Switch
									{...field}
									// ! I want an uncontrolled field
									checked={undefined}
									defaultChecked={defaultChecked}
									// value={undefined}
									// defaultValue={field.value}
									onChange={(e) => {
										return field.onChange(e.target.checked);
									}}
									color={color as never}
								/>
							}
							{...other}
						/>

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
