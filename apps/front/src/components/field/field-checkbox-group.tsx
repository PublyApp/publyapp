import { IconCheck } from '@tabler/icons-react';
import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { renderFieldHelper } from '~/components/field/field-helper-text';
import { Checkbox } from '~/components/ui/checkbox';

type CheckboxGroupOption = {
	value: string;
	label: string;
	description?: string;
	isDisabled?: boolean;
};

export type FieldCheckboxGroupProps = {
	name: string;
	label: string;
	helperText?: string;
	options: CheckboxGroupOption[];
	isDisabled?: boolean;
};

const toStringArray = (value: unknown): string[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === 'string');
};

export const FieldCheckboxGroup = ({
	name,
	label,
	helperText,
	options,
	isDisabled = false,
}: FieldCheckboxGroupProps) => {
	const { control } = useFormContext();
	const groupId = useId();
	const helperId = `${groupId}-helper`;
	const labelId = `${groupId}-label`;

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const helper = error?.message ?? helperText;
				const isInvalid = Boolean(error);
				const value = toStringArray(field.value);
				// RHF's `setFocus`/focus-on-invalid walks to the field's
				// registered `ref` — with N checkboxes sharing one Controller,
				// only one DOM node can hold it. The first ENABLED option is the
				// one a user (and RHF) can actually reach (shell-r5-F4).
				const firstEnabledValue = options.find(
					(option) => !(isDisabled || option.isDisabled),
				)?.value;

				const handleToggle = (optionValue: string, checked: boolean) => {
					const nextValue = checked
						? [...new Set([...value, optionValue])]
						: value.filter((item) => item !== optionValue);

					field.onChange(nextValue);
				};

				return (
					<div className="space-y-2">
						<p id={labelId} className="text-[13px] font-medium text-foreground">
							{label}
						</p>
						<div
							role="group"
							aria-labelledby={labelId}
							aria-invalid={isInvalid || undefined}
							aria-describedby={helper ? helperId : undefined}
							className="flex flex-wrap gap-2"
						>
							{options.map((option) => {
								const optionDisabled = isDisabled || option.isDisabled;
								const optionChecked = value.includes(option.value);

								return (
									<label
										key={option.value}
										className="publy-choice-chip"
										data-selected={optionChecked ? 'true' : undefined}
										data-disabled={optionDisabled ? 'true' : undefined}
										title={option.description}
									>
										<Checkbox
											className="sr-only"
											checked={optionChecked}
											ref={
												option.value === firstEnabledValue
													? field.ref
													: undefined
											}
											name={field.name}
											disabled={optionDisabled}
											onBlur={field.onBlur}
											onCheckedChange={(checked) => {
												if (optionDisabled) {
													return;
												}

												handleToggle(option.value, Boolean(checked));
											}}
										/>
										{optionChecked ? (
											<IconCheck aria-hidden="true" className="size-3.5" />
										) : null}
										<span>{option.label}</span>
									</label>
								);
							})}
						</div>
						{renderFieldHelper({ helper, isInvalid, helperId })}
					</div>
				);
			}}
		/>
	);
};
