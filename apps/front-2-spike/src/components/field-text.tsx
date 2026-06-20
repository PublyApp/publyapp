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

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<div className="flex flex-col gap-1">
						<Input
							{...field}
							{...inputProps}
							value={typeof field.value === 'string' ? field.value : ''}
							onChange={(event) => {
								field.onChange(
									event.target instanceof HTMLInputElement
										? event.target.value
										: String(field.value ?? ''),
								);
							}}
							onBlur={field.onBlur}
						/>
						{fieldStateMessage(error?.message, helperText) ? (
							<div className="text-danger-500 text-sm">
								{fieldStateMessage(error?.message, helperText)}
							</div>
						) : null}
					</div>
				);
			}}
		/>
	);
};

const fieldStateMessage = (
	errorMessage: string | undefined,
	helperText?: string,
): string | undefined => {
	return errorMessage ?? helperText;
};
