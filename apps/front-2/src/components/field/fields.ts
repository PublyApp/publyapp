import { FieldCheckboxGroup } from './field-checkbox-group';
import { FieldEmail } from './field-email';
import { FieldImageUpload } from './field-image-upload';
import { FieldSelect } from './field-select';
import { FieldSwitch } from './field-switch';
import { FieldText } from './field-text';
import { FieldTextarea } from './field-textarea';

export const Field = {
	CheckboxGroup: FieldCheckboxGroup,
	Text: FieldText,
	Textarea: FieldTextarea,
	Email: FieldEmail,
	Select: FieldSelect,
	Switch: FieldSwitch,
	ImageUpload: FieldImageUpload,
} as const;
