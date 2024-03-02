// import { TextField, type TextFieldProps } from '@mui/material';
import { DesktopDatePicker, type DesktopDatePickerProps } from '@mui/x-date-pickers';
import _ from 'lodash';
import { Controller, useFormContext } from 'react-hook-form';

// import type { DateType } from '@/shared/types/date.types';

type Props = DesktopDatePickerProps<Date> & {
	helperText?: string;
	name: string;
};

const RHFDesktopDatePicker = ({ name, helperText, slotProps, ...other }: Props) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<DesktopDatePicker
						label="Date picker"
						{...field}
						// ! I want an uncontrolled field
						value={undefined}
						defaultValue={field.value}
						minDate={new Date('2017-01-01')}
						onChange={(newValue) => {
							field.onChange(newValue);
						}}
						slotProps={_.merge(
							{
								textField: {
									fullWidth: true,
									margin: 'normal',
									helperText: error ? error?.message : helperText,
									error: !!error,
								},
							},
							slotProps,
						)}
						{...other}
					/>
				);
			}}
		/>
	);
};

export default RHFDesktopDatePicker;

// const getFieldValue = (value: DateType) => {
// 	if (value instanceof Date) {
// 		return value;
// 	}

// 	if (typeof value === 'string' || typeof value === 'number') {
// 		return new Date(value);
// 	}

// 	return null;
// };
