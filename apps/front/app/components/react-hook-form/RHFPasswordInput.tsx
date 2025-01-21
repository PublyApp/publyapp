import { PasswordInput, type PasswordInputProps } from '@mantine/core';
import { Controller, useFormContext } from 'react-hook-form';

type Props = PasswordInputProps & { name: NonNullable<string> } /* {} */;

export const RHFPasswordInput = ({ name, ...props }: Props) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return <PasswordInput {...field} error={error?.message} {...props} />;
			}}
		/>
	);
};
