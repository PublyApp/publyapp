import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Switch } from '~/components/ui/switch';

export type FieldSwitchProps = {
	name: string;
	label: string;
	description?: string;
	isDisabled?: boolean;
};

/**
 * Handoff switch row (2d/5i): title + description on the left, switch on
 * the right; consecutive rows are split by a hairline (`.publy-field-switch-row`).
 */
export const FieldSwitch = ({
	name,
	label,
	description,
	isDisabled,
}: FieldSwitchProps) => {
	const { control } = useFormContext();
	const fieldId = useId();
	const descriptionId = `${fieldId}-description`;

	return (
		<Controller
			name={name}
			control={control}
			render={({ field }) => (
				<div data-slot="field-switch-row" className="publy-field-switch-row">
					<div className="flex min-w-0 flex-col gap-px">
						<label htmlFor={fieldId} className="publy-field-switch-title">
							{label}
						</label>
						{description ? (
							<span
								id={descriptionId}
								className="publy-field-switch-description"
							>
								{description}
							</span>
						) : null}
					</div>
					<Switch
						id={fieldId}
						checked={Boolean(field.value)}
						onCheckedChange={(checked) => {
							field.onChange(checked);
						}}
						onBlur={field.onBlur}
						disabled={isDisabled}
						aria-describedby={description ? descriptionId : undefined}
					/>
				</div>
			)}
		/>
	);
};
