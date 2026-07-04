import { FieldCheckboxGroup } from './field-checkbox-group';
import { FieldEmail } from './field-email';
import { FieldText } from './field-text';

export const Field = {
	CheckboxGroup: FieldCheckboxGroup,
	Text: FieldText,
	Email: FieldEmail,
} as const;
