import { IconAlertCircle } from '@tabler/icons-react';

/**
 * Shared error/helper-text row for the Field.* primitives — error message
 * wins over the static helper, otherwise the helper renders below the
 * control. Centralised so `field-text`, `field-select`, `field-textarea`,
 * and `field-image-upload` can't drift on the error-vs-helper shape.
 */
export const renderFieldHelper = ({
	helper,
	isInvalid,
	helperId,
}: {
	helper?: string;
	isInvalid: boolean;
	helperId: string;
}) => {
	if (!helper) {
		return null;
	}

	if (isInvalid) {
		return (
			<p id={helperId} data-slot="field-error" className="publy-field-error">
				<IconAlertCircle aria-hidden="true" />
				{helper}
			</p>
		);
	}

	return (
		<p id={helperId} data-slot="field-helper" className="publy-field-helper">
			{helper}
		</p>
	);
};
