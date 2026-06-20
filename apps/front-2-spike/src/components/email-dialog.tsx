import { Button, Modal } from '@heroui/react';
import {
	FormProvider,
	useForm,
	type FieldValues,
	type Resolver,
	type SubmitHandler,
} from 'react-hook-form';
import { z } from 'zod';
import { FieldText } from '~/components/field-text';

// Uses PLAIN zod (not the `.client`-only `interZodClient`) so this module never
// imports a `*.client.*` file — Start's import-protection denies that in the
// server build graph. Translation still works: the client i18n init installs
// InterZod's locale-aware error map as zod's GLOBAL error map (`z.setErrorMap`),
// so plain `z.string().email()` resolves its message via that map.

type DialogFormValues = {
	email: string;
};

type SafeParse<T> =
	| { success: true; data: T }
	| {
			success: false;
			error: {
				issues: Array<{
					path: Array<string | number>;
					message: string;
					code: string;
				}>;
			};
	  };

type ZodLikeSchema<T extends FieldValues> = {
	safeParse: (value: unknown) => SafeParse<T>;
};

// Local resolver (the spike has no `@hookform/resolvers`). It surfaces the
// message produced by the InterZod schema's locale-aware errorMap, so the
// validation message is already translated for the active locale.
const zodResolver =
	<T extends FieldValues>(schema: ZodLikeSchema<T>): Resolver<T> =>
	async (values) => {
		const parsed = schema.safeParse(values);

		if (parsed.success) {
			return { values: parsed.data, errors: {} as never };
		}

		const errors = parsed.error.issues.reduce<
			Record<string, { type: string; message: string }>
		>((acc, issue) => {
			const field = issue.path[0];
			if (typeof field === 'string') {
				acc[field] = { type: issue.code, message: issue.message };
			}
			return acc;
		}, {});

		return { values: {} as T, errors: errors as never };
	};

const EmailDialog = () => {
	const methods = useForm<DialogFormValues>({
		defaultValues: { email: '' },
		resolver: zodResolver(
			z.object({
				email: z.string().email(),
			}),
		),
	});

	const onSubmit: SubmitHandler<DialogFormValues> = () => {
		// no-op: this task targets the translated validation error, not persistence.
	};

	return (
		<Modal>
			<Modal.Trigger>
				<Button variant="primary" type="button">
					Invite staff user
				</Button>
			</Modal.Trigger>
			<Modal.Backdrop>
				<Modal.Container>
					<Modal.Dialog>
						<FormProvider {...methods}>
							<form
								className="space-y-3"
								onSubmit={methods.handleSubmit(onSubmit)}
							>
								<Modal.Header>Invite staff user</Modal.Header>
								<Modal.Body>
									<FieldText
										name="email"
										placeholder="name@company.com"
										aria-label="Email"
									/>
								</Modal.Body>
								<Modal.Footer>
									<Modal.CloseTrigger>
										<Button type="button" variant="primary">
											Cancel
										</Button>
									</Modal.CloseTrigger>
									<Button type="submit" variant="primary">
										Save
									</Button>
								</Modal.Footer>
							</form>
						</FormProvider>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
};

export default EmailDialog;
