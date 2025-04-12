import { Controller, useFormContext } from 'react-hook-form';

import { PhoneInput, type PhoneInputProps } from '../phone-input';

// ----------------------------------------------------------------------

export type RHFPhoneInputProps = Omit<PhoneInputProps, 'value' | 'onChange'> & {
	name: string;
};

export const RHFPhoneInput = ({
	name,
	helperText,
	...other
}: RHFPhoneInputProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<PhoneInput
						{...field}
						fullWidth
						error={!!error}
						helperText={error?.message ?? helperText}
						{...other}
					/>
				);
			}}
		/>
	);
};
