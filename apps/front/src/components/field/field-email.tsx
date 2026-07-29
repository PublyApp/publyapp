import { type FieldTextProps, FieldText } from './field-text';

type FieldEmailProps = Omit<FieldTextProps, 'type'> & {
	autoComplete?: 'email' | (string & {});
};

export const FieldEmail = (props: FieldEmailProps) => {
	return (
		<FieldText
			{...props}
			type="email"
			autoCapitalize="off"
			autoComplete="email"
			inputMode="email"
		/>
	);
};
