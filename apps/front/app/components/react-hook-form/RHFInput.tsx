import { Controller, useFormContext } from 'react-hook-form';

import { Input, type InputProps } from '../tremor/Input';

type Props = InputProps & { name: NonNullable<string> };

export const RHFTextInput = ({ name, type, ...props }: Props) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<Input
						{...field}
						hasError={!!error}
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
