import type { TextFieldProps } from "@mui/material/TextField";
import {
	DatePicker,
	type DatePickerProps,
} from "@mui/x-date-pickers/DatePicker";
import {
	MobileDateTimePicker,
	type MobileDateTimePickerProps,
} from "@mui/x-date-pickers/MobileDateTimePicker";
import dayjs, { type Dayjs } from "dayjs";
import { Controller, useFormContext } from "react-hook-form";

import { formatPatterns } from "@/front/utils/format-time";

// ----------------------------------------------------------------------

type RHFDatePickerProps = DatePickerProps<Dayjs> & {
	name: string;
};

export const RHFDatePicker = ({
	name,
	slotProps,
	...other
}: RHFDatePickerProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<DatePicker
						{...field}
						value={dayjs(field.value)}
						onChange={(newValue) => {
							return field.onChange(dayjs(newValue).format());
						}}
						format={formatPatterns.split.date}
						slotProps={{
							...slotProps,
							textField: {
								fullWidth: true,
								error: !!error,
								helperText:
									error?.message ??
									(slotProps?.textField as TextFieldProps)?.helperText,
								...slotProps?.textField,
							},
						}}
						{...other}
					/>
				);
			}}
		/>
	);
};

// ----------------------------------------------------------------------

type RHFMobileDateTimePickerProps = MobileDateTimePickerProps<Dayjs> & {
	name: string;
};

export const RHFMobileDateTimePicker = ({
	name,
	slotProps,
	...other
}: RHFMobileDateTimePickerProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<MobileDateTimePicker
						{...field}
						value={dayjs(field.value)}
						onChange={(newValue) => {
							return field.onChange(dayjs(newValue).format());
						}}
						format={formatPatterns.split.dateTime}
						slotProps={{
							textField: {
								fullWidth: true,
								error: !!error,
								helperText:
									error?.message ??
									(slotProps?.textField as TextFieldProps)?.helperText,
								...slotProps?.textField,
							},
							...slotProps,
						}}
						{...other}
					/>
				);
			}}
		/>
	);
};
