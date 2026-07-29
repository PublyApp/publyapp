import { useId, type ComponentPropsWithoutRef } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { renderFieldHelper } from '~/components/field/field-helper-text';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export type FieldTextProps = Omit<
	ComponentPropsWithoutRef<'input'>,
	'name' | 'children' | 'onChange' | 'onBlur' | 'value' | 'id'
> & {
	name: string;
	label: string;
	helperText?: string;
	fullWidth?: boolean;
	isDisabled?: boolean;
};

const toInputValue = (value: unknown): string => {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number') {
		return String(value);
	}
	return '';
};

export const FieldText = ({
	name,
	label,
	helperText,
	fullWidth = false,
	isDisabled,
	...inputProps
}: FieldTextProps) => {
	const { control } = useFormContext();
	const fieldId = useId();
	const helperId = `${fieldId}-helper`;
	const isDisabledValue = isDisabled ?? inputProps.disabled;

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const helper = error?.message ?? helperText;
				const isInvalid = Boolean(error);
				const inputValue = toInputValue(field.value);

				return (
					<div className="space-y-1.5">
						<Label htmlFor={fieldId}>{label}</Label>
						<Input
							{...field}
							{...inputProps}
							id={fieldId}
							value={inputValue}
							onChange={(event) => {
								field.onChange(event.target.value);
							}}
							onBlur={field.onBlur}
							autoComplete={inputProps.autoComplete ?? 'off'}
							disabled={isDisabledValue}
							name={name}
							aria-invalid={isInvalid || undefined}
							aria-describedby={helper ? helperId : undefined}
							className={fullWidth ? 'w-full' : undefined}
						/>
						{renderFieldHelper({ helper, isInvalid, helperId })}
					</div>
				);
			}}
		/>
	);
};
