import { Controller, useFormContext } from "react-hook-form";

import { NumberInput, type NumberInputProps } from "../number-input";

// ----------------------------------------------------------------------

export type RHFNumberInputProps = NumberInputProps & {
	name: string;
};

export const RHFNumberInput = ({
	name,
	helperText,
	...other
}: RHFNumberInputProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<NumberInput
						{...field}
						onChange={(_event, value) => {
							return field.onChange(value);
						}}
						{...other}
						error={!!error}
						helperText={error?.message ?? helperText}
					/>
				);
			}}
		/>
	);
};
