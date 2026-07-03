import { FieldEmail } from './field-email';
import { FieldText } from './field-text';

export const Field = {
	Text: FieldText,
	Email: FieldEmail,
} as const;
