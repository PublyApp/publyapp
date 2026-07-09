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
						<p className="text-sm font-medium text-foreground">{label}</p>
						<div className="space-y-2">
							{options.map((option) => {
								const optionDisabled = isDisabled || option.isDisabled;
								const optionChecked = value.includes(option.value);

								return (
									<label
										key={option.value}
										className="flex items-start gap-2 rounded-2xl border border-border bg-background/50 px-3 py-2"
									>
										<Checkbox
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
										<div className="space-y-0.5">
											<span className="text-sm font-medium text-foreground">
												{option.label}
											</span>
											{option.description ? (
												<span className="block text-xs text-muted-foreground">
													{option.description}
												</span>
											) : null}
										</div>
									</label>
								);
							})}
						</div>
						{helper ? (
							<p id={helperId} className="text-sm text-destructive">
								{helper}
							</p>
						) : null}
					</div>
				);
			}}
		/>
	);
};
