import type { DetailedHTMLProps, FormEventHandler, FormHTMLAttributes } from 'react';

import { FormProvider, type UseFormReturn } from 'react-hook-form';

export type FormProps = {
	onSubmit?: () => void;
	children: React.ReactNode;
	form: UseFormReturn<any>;
	formProps?: DetailedHTMLProps<FormHTMLAttributes<HTMLFormElement>, HTMLFormElement>;
};

export const RHFForm = ({ children, onSubmit, form, formProps }: FormProps) => {
	const handleSubmit: FormEventHandler = (e) => {
		e.preventDefault();
		onSubmit?.();
	};

	return (
		<FormProvider {...form}>
			<form onSubmit={handleSubmit} noValidate autoComplete="off" {...formProps}>
				{children}
			</form>
		</FormProvider>
	);
};
