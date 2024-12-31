import { FormProvider, type UseFormReturn } from 'react-hook-form';

export type FormProps = {
	onSubmit?: () => void;
	children: React.ReactNode;
	form: UseFormReturn<any>;
};

export const RHFForm = ({ children, onSubmit, form }: FormProps) => {
	return (
		<FormProvider {...form}>
			<form onSubmit={onSubmit} noValidate autoComplete="off">
				{children}
			</form>
		</FormProvider>
	);
};
