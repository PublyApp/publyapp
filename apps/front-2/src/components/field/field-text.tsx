import {
	TextField,
	FieldError,
	Input,
	type InputProps,
	Label,
} from '@heroui/react';
import { Controller, useFormContext } from 'react-hook-form';

export type FieldTextProps = Omit<
	InputProps,
	'children' | 'isInvalid' | 'onChange' | 'onBlur' | 'value'
> & {
	name: string;
	label: string;
	helperText?: string;
};

export const FieldText = ({
	name,
	label,
	helperText,
	...inputProps
}: FieldTextProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const helper = error?.message ?? helperText;
				const isInvalid = Boolean(error);

				return (
					<TextField isInvalid={isInvalid} fullWidth={inputProps.fullWidth}>
						<Label>{label}</Label>
						<Input
							{...field}
							{...inputProps}
							value={typeof field.value === 'string' ? field.value : ''}
							onChange={(event) => {
								field.onChange(event.target.value);
							}}
							onBlur={field.onBlur}
							autoComplete={inputProps.autoComplete ?? 'off'}
							name={name}
						/>
						{helper ? (
							<FieldError className="text-sm text-danger-500">
								{helper}
							</FieldError>
						) : null}
					</TextField>
				);
			}}
		/>
	);
};
