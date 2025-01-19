import type { FormEventHandler } from 'react';

import { FormProvider, type UseFormReturn } from 'react-hook-form';

export type FormProps = {
	onSubmit?: () => void;
	children: React.ReactNode;
	form: UseFormReturn<any>;
};

export const RHFForm = ({ children, onSubmit, form }: FormProps) => {
	const handleSubmit: FormEventHandler = (e) => {
		e.preventDefault();
		onSubmit?.();
	};

	return (
		<FormProvider {...form}>
			<form onSubmit={handleSubmit} noValidate autoComplete="off">
				{children}
			</form>
		</FormProvider>
	);
};
