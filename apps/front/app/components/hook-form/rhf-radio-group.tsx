import FormControl, { type FormControlProps } from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { FormHelperTextProps } from "@mui/material/FormHelperText";
import FormLabel, { type FormLabelProps } from "@mui/material/FormLabel";
import Radio, { type RadioProps } from "@mui/material/Radio";
import RadioGroup, { type RadioGroupProps } from "@mui/material/RadioGroup";
import { Controller, useFormContext } from "react-hook-form";

import { HelperText } from "./help-text";

// ----------------------------------------------------------------------

export type RHFRadioGroupProps = RadioGroupProps & {
	name: string;
	label?: string;
	options: { label: string; value: string }[];
	helperText?: React.ReactNode;
	slotProps?: {
		wrapper?: FormControlProps;
		radio?: RadioProps;
		formLabel?: FormLabelProps;
		helperText?: FormHelperTextProps;
	};
};

export const RHFRadioGroup = ({
	sx,
	name,
	label,
	options,
	helperText,
	slotProps,
	...other
}: RHFRadioGroupProps) => {
	const { control } = useFormContext();

	const labelledby = `${name}-radios`;

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<FormControl component="fieldset" {...slotProps?.wrapper}>
						{label && (
							<FormLabel
								id={labelledby}
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

						<RadioGroup
							{...field}
							aria-labelledby={labelledby}
							sx={sx}
							{...other}
						>
							{options.map((option) => {
								return (
									<FormControlLabel
										key={option.value}
										value={option.value}
										control={
											<Radio
												{...slotProps?.radio}
												slotProps={{
													...slotProps?.radio?.slotProps,
													input: {
														id: `${option.label}-radio`,
														...(!option.label && {
															"aria-label": `${option.label} radio`,
														}),
														...slotProps?.radio?.slotProps?.input,
													},
												}}
											/>
										}
										label={option.label}
									/>
								);
							})}
						</RadioGroup>

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
