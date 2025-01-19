import { TextInput, type TextInputProps } from '@mantine/core';
import { Controller, useFormContext } from 'react-hook-form';

type Props = TextInputProps & { name: NonNullable<string> } /* {} */;

export const RHFTextInput = ({ name, type, ...props }: Props) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<TextInput
						{...field}
						error={error?.message}
						{...props}
						type={type}
						// value={undefined} // ! If you want an uncontrolled field
						// defaultValue={type === 'number' && field.value === 0 ? '' : field.value}
						value={type === 'number' && field.value === 0 ? '' : field.value}
						onChange={(event) => {
							props.onChange?.(event);

							if (type === 'number') {
								field.onChange(Number(event.target.value));
							} else {
								field.onChange(event.target.value);
							}
						}}
					/>
				);
			}}
		/>
	);
};
