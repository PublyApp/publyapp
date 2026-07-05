import { Checkbox, CheckboxGroup, FieldError, Label } from '@heroui/react';
import { Controller, useFormContext } from 'react-hook-form';

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

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const helper = error?.message ?? helperText;
				const value = toStringArray(field.value);

				return (
					<CheckboxGroup
						value={value}
						onChange={field.onChange}
						isInvalid={Boolean(error)}
						isDisabled={isDisabled}
						className="gap-3"
					>
						<Label>{label}</Label>
						<div className="space-y-2">
							{options.map((option) => (
								<div
									key={option.value}
									className="rounded-medium border border-default-200 px-3 py-2"
								>
									<Checkbox
										value={option.value}
										isDisabled={isDisabled || option.isDisabled}
									>
										<Checkbox.Content>
											<Checkbox.Control>
												<Checkbox.Indicator />
											</Checkbox.Control>
											<div className="flex flex-col gap-1">
												<span className="text-sm font-medium">
													{option.label}
												</span>
												{option.description ? (
													<span className="text-xs text-foreground-500">
														{option.description}
													</span>
												) : null}
											</div>
										</Checkbox.Content>
									</Checkbox>
								</div>
							))}
						</div>
						{helper ? (
							<FieldError className="text-sm text-danger-500">
								{helper}
							</FieldError>
						) : null}
					</CheckboxGroup>
				);
			}}
		/>
	);
};
