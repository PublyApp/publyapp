import { FormProvider as RHFForm, type UseFormReturn } from 'react-hook-form';

// ----------------------------------------------------------------------

export type FormProps = {
	onSubmit?: () => void;
	children: React.ReactNode;
	// biome-ignore lint/suspicious/noExplicitAny: code from template leave as is for now
	methods: UseFormReturn<any>;
};

export const Form = ({ children, onSubmit, methods }: FormProps) => {
	return (
		<RHFForm {...methods}>
			<form onSubmit={onSubmit} noValidate autoComplete="off">
				{children}
			</form>
		</RHFForm>
	);
};
