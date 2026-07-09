import { FieldCheckboxGroup } from './field-checkbox-group';
import { FieldEmail } from './field-email';
import { FieldSelect } from './field-select';
import { FieldSwitch } from './field-switch';
import { FieldText } from './field-text';

export const Field = {
	CheckboxGroup: FieldCheckboxGroup,
	Text: FieldText,
	Email: FieldEmail,
	Select: FieldSelect,
	Switch: FieldSwitch,
} as const;
