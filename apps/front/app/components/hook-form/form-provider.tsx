import { FormProvider as RHFForm, type UseFormReturn } from 'react-hook-form';

// ----------------------------------------------------------------------

export type FormProps = {
	onSubmit?: () => void;
	children: React.ReactNode;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
