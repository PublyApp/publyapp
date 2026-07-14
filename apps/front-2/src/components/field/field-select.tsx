import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { renderFieldHelper } from '~/components/field/field-helper-text';
import { Label } from '~/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '~/components/ui/select';

export type FieldSelectOption = {
	value: string;
	label: string;
};

export type FieldSelectProps = {
	name: string;
	label: string;
	placeholder?: string;
	options: readonly FieldSelectOption[];
	helperText?: string;
	isDisabled?: boolean;
};

export const FieldSelect = ({
	name,
	label,
	placeholder,
	options,
	helperText,
	isDisabled,
}: FieldSelectProps) => {
	const { control } = useFormContext();
	const { t } = useTranslation('common');
	const fieldId = useId();
	const labelId = `${fieldId}-label`;
	const helperId = `${fieldId}-helper`;
	const resolvedPlaceholder = placeholder ?? t('select-placeholder');

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const helper = error?.message ?? helperText;
				const isInvalid = Boolean(error);
				const selected = options.find((option) => option.value === field.value);

				return (
					<div className="space-y-1.5">
						<Label id={labelId}>{label}</Label>
						<Select
							value={typeof field.value === 'string' ? field.value : null}
							onValueChange={(nextValue) => {
								if (typeof nextValue === 'string') {
									field.onChange(nextValue);
								}
							}}
							disabled={isDisabled}
						>
							<SelectTrigger
								className="w-full"
								aria-labelledby={labelId}
								aria-invalid={isInvalid || undefined}
								aria-describedby={helper ? helperId : undefined}
								onBlur={field.onBlur}
							>
								<span
									data-slot="select-value"
									className={selected ? undefined : 'text-muted-foreground'}
								>
									{selected?.label ?? resolvedPlaceholder}
								</span>
							</SelectTrigger>
							<SelectContent>
								{options.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{renderFieldHelper({ helper, isInvalid, helperId })}
					</div>
				);
			}}
		/>
	);
};
