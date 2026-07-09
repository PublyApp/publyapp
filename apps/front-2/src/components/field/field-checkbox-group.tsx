import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
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

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const helper = error?.message ?? helperText;
				const value = toStringArray(field.value);

				const handleToggle = (optionValue: string, checked: boolean) => {
					const nextValue = checked
						? [...new Set([...value, optionValue])]
						: value.filter((item) => item !== optionValue);

					field.onChange(nextValue);
				};

				return (
					<div className="space-y-2">
						<p className="text-[13px] font-medium text-foreground">{label}</p>
						<div className="flex flex-wrap gap-2">
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
											name={field.name}
											disabled={optionDisabled}
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
						{helper ? (
							<p
								id={helperId}
								className={
									error
										? 'flex items-center gap-1 text-xs text-destructive'
										: 'text-xs text-muted-foreground'
								}
							>
								{error ? (
									<IconAlertCircle aria-hidden="true" className="size-3.5" />
								) : null}
								{helper}
							</p>
						) : null}
					</div>
				);
			}}
		/>
	);
};
