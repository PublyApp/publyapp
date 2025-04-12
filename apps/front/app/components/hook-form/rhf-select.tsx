import _ from "lodash";

import Box from "@mui/material/Box";
import Checkbox, { type CheckboxProps } from "@mui/material/Checkbox";
import Chip, { type ChipProps } from "@mui/material/Chip";
import FormControl, { type FormControlProps } from "@mui/material/FormControl";
import type { FormHelperTextProps } from "@mui/material/FormHelperText";
import InputLabel, { type InputLabelProps } from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectProps } from "@mui/material/Select";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import { Controller, useFormContext } from "react-hook-form";

import { HelperText } from "./help-text";

// ----------------------------------------------------------------------

type RHFSelectProps = TextFieldProps & {
	name: string;
	children: React.ReactNode;
};

export const RHFSelect = ({
	name,
	children,
	helperText,
	slotProps = {},
	...other
}: RHFSelectProps) => {
	const { control } = useFormContext();

	const labelId = `${name}-select`;

	const baseSlotProps: TextFieldProps["slotProps"] = {
		select: {
			sx: { textTransform: "capitalize" },
			MenuProps: {
				slotProps: {
					paper: {
						sx: [{ maxHeight: 220 }],
					},
				},
			},
		},
		htmlInput: { id: labelId },
		inputLabel: { htmlFor: labelId },
	};

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<TextField
						{...field}
						select
						fullWidth
						error={!!error}
						helperText={error?.message ?? helperText}
						slotProps={_.merge(baseSlotProps, slotProps)}
						{...other}
					>
						{children}
					</TextField>
				);
			}}
		/>
	);
};

// ----------------------------------------------------------------------

type RHFMultiSelectProps = FormControlProps & {
	name: string;
	label?: string;
	chip?: boolean;
	checkbox?: boolean;
	placeholder?: string;
	helperText?: React.ReactNode;
	options: { label: string; value: string }[];
	slotProps?: {
		chip?: ChipProps;
		select?: SelectProps;
		checkbox?: CheckboxProps;
		inputLabel?: InputLabelProps;
		helperText?: FormHelperTextProps;
	};
};

export const RHFMultiSelect = ({
	name,
	chip,
	label,
	options,
	checkbox,
	placeholder,
	slotProps,
	helperText,
	...other
}: RHFMultiSelectProps) => {
	const { control } = useFormContext();

	const labelId = `${name}-multi-select`;

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const renderLabel = () => {
					return (
						<InputLabel htmlFor={labelId} {...slotProps?.inputLabel}>
							{label}
						</InputLabel>
					);
				};

				const renderOptions = () => {
					return options.map((option) => {
						return (
							<MenuItem key={option.value} value={option.value}>
								{checkbox && (
									<Checkbox
										size="small"
										disableRipple
										checked={field.value.includes(option.value)}
										{...slotProps?.checkbox}
									/>
								)}

								{option.label}
							</MenuItem>
						);
					});
				};

				return (
					<FormControl error={!!error} {...other}>
						{label && renderLabel()}

						<Select
							{...field}
							multiple
							displayEmpty={!!placeholder}
							label={label}
							renderValue={(selected) => {
								const selectedItems = options.filter((item) => {
									return (selected as string[]).includes(item.value);
								});

								if (!selectedItems.length && placeholder) {
									return (
										<Box sx={{ color: "text.disabled" }}>{placeholder}</Box>
									);
								}

								if (chip) {
									return (
										<Box sx={{ gap: 0.5, display: "flex", flexWrap: "wrap" }}>
											{selectedItems.map((item) => {
												return (
													<Chip
														key={item.value}
														size="small"
														variant="soft"
														label={item.label}
														{...slotProps?.chip}
													/>
												);
											})}
										</Box>
									);
								}

								return selectedItems
									.map((item) => {
										return item.label;
									})
									.join(", ");
							}}
							{...slotProps?.select}
							inputProps={{
								id: labelId,
								...slotProps?.select?.inputProps,
							}}
						>
							{renderOptions()}
						</Select>

						<HelperText
							{...slotProps?.helperText}
							errorMessage={error?.message}
							helperText={helperText}
						/>
					</FormControl>
				);
			}}
		/>
	);
};
