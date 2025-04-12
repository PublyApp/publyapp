import { Controller, useFormContext } from "react-hook-form";

import {
	CountrySelect,
	type CountrySelectProps,
} from "../country-select/country-select";

// ----------------------------------------------------------------------

export type RHFCountrySelectProps = CountrySelectProps & {
	name: string;
};

export const RHFCountrySelect = ({
	name,
	helperText,
	...other
}: RHFCountrySelectProps) => {
	const { control, setValue } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<CountrySelect
						id={`${name}-rhf-country-select`}
						value={field.value}
						onChange={(_event, newValue) => {
							return setValue(name, newValue, { shouldValidate: true });
						}}
						error={!!error}
						helperText={error?.message ?? helperText}
						{...other}
					/>
				);
			}}
		/>
	);
};
