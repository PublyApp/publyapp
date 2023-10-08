import { FormProvider as Form, type UseFormReturn } from 'react-hook-form';

// ----------------------------------------------------------------------

type Props = {
	children: React.ReactNode;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: UseFormReturn<any>;
	onSubmit?: VoidFunction;
};

const FormProvider = ({ children, onSubmit, form }: Props) => {
	return (
		<Form {...form}>
			<form onSubmit={onSubmit}>{children}</form>
		</Form>
	);
};

export default FormProvider;
