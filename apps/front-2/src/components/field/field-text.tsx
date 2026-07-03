import { Input, type InputProps } from '@heroui/react';
import { Controller, useFormContext } from 'react-hook-form';

export type FieldTextProps = Omit<
	InputProps,
	'name' | 'onChange' | 'onBlur' | 'value'
> & {
	name: string;
	helperText?: string;
};

export const FieldText = ({
	name,
	helperText,
	...inputProps
}: FieldTextProps) => {
	const { control } = useFormContext();
	const message = (errorMessage: string | undefined, fallback?: string) =>
		errorMessage ?? fallback;

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const helper = message(error?.message, helperText);

				return (
					<div className="flex flex-col gap-1">
						<Input
							{...field}
							{...inputProps}
							value={typeof field.value === 'string' ? field.value : ''}
							onChange={(event) => {
								field.onChange(event.target.value);
							}}
							onBlur={field.onBlur}
							autoComplete="off"
						/>
						{helper ? (
							<p className="text-sm text-danger-500">{helper}</p>
						) : null}
					</div>
				);
			}}
		/>
	);
};
