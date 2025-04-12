import Box, { type BoxProps } from "@mui/material/Box";
import FormControl, { type FormControlProps } from "@mui/material/FormControl";
import FormControlLabel, {
	type FormControlLabelProps,
} from "@mui/material/FormControlLabel";
import FormGroup, { type FormGroupProps } from "@mui/material/FormGroup";
import type { FormHelperTextProps } from "@mui/material/FormHelperText";
import FormLabel, { type FormLabelProps } from "@mui/material/FormLabel";
import Switch, { type SwitchProps } from "@mui/material/Switch";
import { Controller, useFormContext } from "react-hook-form";

import { HelperText } from "./help-text";

// ----------------------------------------------------------------------

export type RHFSwitchProps = Omit<FormControlLabelProps, "control"> & {
	name: string;
	helperText?: React.ReactNode;
	slotProps?: {
		wrapper?: BoxProps;
		switch?: SwitchProps;
		helperText?: FormHelperTextProps;
	};
};

export const RHFSwitch = ({
	name,
	helperText,
	label,
	slotProps,
	sx,
	...other
}: RHFSwitchProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<Box {...slotProps?.wrapper}>
						<FormControlLabel
							label={label}
							control={
								<Switch
									{...field}
									checked={field.value}
									{...slotProps?.switch}
									slotProps={{
										...slotProps?.switch?.slotProps,
										input: {
											id: `${name}-switch`,
											...(!label && { "aria-label": `${name} switch` }),
											...slotProps?.switch?.slotProps?.input,
										},
									}}
								/>
							}
							sx={[{ mx: 0 }, ...(Array.isArray(sx) ? sx ?? [] : [sx])]}
							{...other}
						/>

						<HelperText
							{...slotProps?.helperText}
							errorMessage={error?.message}
							helperText={helperText}
						/>
					</Box>
				);
			}}
		/>
	);
};

// ----------------------------------------------------------------------

type RHFMultiSwitchProps = FormGroupProps & {
	name: string;
	label?: string;
	helperText?: React.ReactNode;
	options: {
		label: string;
		value: string;
	}[];
	slotProps?: {
		wrapper?: FormControlProps;
		switch: SwitchProps;
		formLabel?: FormLabelProps;
		helperText?: FormHelperTextProps;
	};
};

export const RHFMultiSwitch = ({
	name,
	label,
	options,
	helperText,
	slotProps,
	...other
}: RHFMultiSwitchProps) => {
	const { control } = useFormContext();

	const getSelected = (selectedItems: string[], item: string) => {
		return selectedItems.includes(item)
			? selectedItems.filter((value) => {
					return value !== item;
				})
			: [...selectedItems, item];
	};

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<FormControl component="fieldset" {...slotProps?.wrapper}>
						{label && (
							<FormLabel
								component="legend"
								{...slotProps?.formLabel}
								sx={[
									{ mb: 1, typography: "body2" },
									...(Array.isArray(slotProps?.formLabel?.sx)
										? slotProps?.formLabel?.sx ?? []
										: [slotProps?.formLabel?.sx]),
								]}
							>
								{label}
							</FormLabel>
						)}

						<FormGroup {...other}>
							{options.map((option) => {
								return (
									<FormControlLabel
										key={option.value}
										control={
											<Switch
												checked={field.value.includes(option.value)}
												onChange={() => {
													return field.onChange(
														getSelected(field.value, option.value),
													);
												}}
												{...slotProps?.switch}
												slotProps={{
													...slotProps?.switch?.slotProps,
													input: {
														id: `${option.label}-switch`,
														...(!option.label && {
															"aria-label": `${option.label} switch`,
														}),
														...slotProps?.switch?.slotProps?.input,
													},
												}}
											/>
										}
										label={option.label}
									/>
								);
							})}
						</FormGroup>

						<HelperText
							{...slotProps?.helperText}
							disableGutters
							errorMessage={error?.message}
							helperText={helperText}
						/>
					</FormControl>
				);
			}}
		/>
	);
};
