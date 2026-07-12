import { IconAlertCircle } from '@tabler/icons-react';
import { useId, type ComponentPropsWithoutRef } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';

export type FieldTextareaProps = Omit<
	ComponentPropsWithoutRef<'textarea'>,
	'name' | 'children' | 'onChange' | 'onBlur' | 'value' | 'id'
> & {
	name: string;
	label: string;
	helperText?: string;
	isDisabled?: boolean;
};

export const FieldTextarea = ({
	name,
	label,
	helperText,
	isDisabled,
	...textareaProps
}: FieldTextareaProps) => {
	const { control } = useFormContext();
	const fieldId = useId();
	const helperId = `${fieldId}-helper`;

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const helper = error?.message ?? helperText;
				const isInvalid = Boolean(error);

				return (
					<div className="space-y-1.5">
						<Label htmlFor={fieldId}>{label}</Label>
						<Textarea
							{...field}
							{...textareaProps}
							id={fieldId}
							value={typeof field.value === 'string' ? field.value : ''}
							onChange={(event) => {
								field.onChange(event.target.value);
							}}
							onBlur={field.onBlur}
							disabled={isDisabled}
							name={name}
							aria-invalid={isInvalid || undefined}
							aria-describedby={helper ? helperId : undefined}
						/>
						{isInvalid && helper ? (
							<p
								id={helperId}
								data-slot="field-error"
								className="publy-field-error"
							>
								<IconAlertCircle aria-hidden="true" />
								{helper}
							</p>
						) : helper ? (
							<p
								id={helperId}
								data-slot="field-helper"
								className="publy-field-helper"
							>
								{helper}
							</p>
						) : null}
					</div>
				);
			}}
		/>
	);
};
