import { Button, Modal } from '@heroui/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { Resolver } from 'react-hook-form';
import { useForm, type FieldValues, type SubmitHandler } from 'react-hook-form';
import { FieldText } from '~/components/field-text';
import { MembersTable } from '~/components/members-table';
import { interZodClient } from '~/lib/i18n.client';
import { staffUsersBrowserQuery, type StaffUsersVars } from '~/lib/query';

const z = interZodClient;

const normalizeStaffUsersSearch = (search: {
	q?: string;
	sortId?: string;
	sortOrder?: string;
	cursor?: string;
	probe?: string;
}): StaffUsersVars => {
	const sortOrder = search.sortOrder;
	const normalizedSortOrder =
		sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined;
	const probe =
		search.probe === 'virtualization' ? ('virtualization' as const) : undefined;

	return {
		q: search.q,
		sortId: search.sortId,
		sortOrder: normalizedSortOrder,
		cursor: search.cursor,
		probe,
	};
};

type LoaderDeps = Omit<StaffUsersVars, 'probe'>;

type DialogFormValues = {
	email: string;
};

const normalizeLoaderDeps = (search: {
	q?: string;
	sortId?: string;
	sortOrder?: 'asc' | 'desc';
	cursor?: string;
}): LoaderDeps => {
	return {
		q: search.q,
		sortId: search.sortId,
		sortOrder: search.sortOrder,
		cursor: search.cursor,
	};
};

type SafeParse<T> =
	| {
			success: true;
			data: T;
	  }
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

const zodResolver =
	<T extends FieldValues>(schema: ZodLikeSchema<T>): Resolver<T> =>
	async (values) => {
		const parsed = schema.safeParse(values);

		if (parsed.success) {
			return {
				values: parsed.data,
				errors: {} as never,
			};
		}

		const errors = parsed.error.issues.reduce<
			Record<string, { type: string; message: string }>
		>((acc, issue) => {
			const field = issue.path[0];
			if (typeof field === 'string') {
				acc[field] = {
					type: issue.code,
					message: issue.message,
				};
			}
			return acc;
		}, {});

		return {
			values: {} as T,
			errors: errors as never,
		};
	};

export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	validateSearch: (search) =>
		normalizeStaffUsersSearch({
			q: typeof search.q === 'string' ? search.q : undefined,
			sortId: typeof search.sortId === 'string' ? search.sortId : undefined,
			sortOrder:
				typeof search.sortOrder === 'string' ? search.sortOrder : undefined,
			cursor: typeof search.cursor === 'string' ? search.cursor : undefined,
			probe: typeof search.probe === 'string' ? search.probe : undefined,
		}),
	loaderDeps: ({ search }) => normalizeLoaderDeps(search),
	loader: () => {
		return undefined;
	},
	component: StaffUsersPage,
});

function StaffUsersPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const vars = normalizeStaffUsersSearch(search);
	const { handleSubmit } = useForm<DialogFormValues>({
		defaultValues: {
			email: '',
		},
		resolver: zodResolver(
			z.object({
				email: z.string().email(),
			}),
		),
	});
	const { data, isLoading } = useSuspenseQuery(staffUsersBrowserQuery(vars));

	const onSubmit: SubmitHandler<DialogFormValues> = () => {
		// no-op, validation is the target in this task
	};

	const handleSearch = (query: string) => {
		navigate({
			search: {
				...search,
				q: query === '' ? undefined : query,
				cursor: undefined,
			},
			replace: true,
		});
	};

	const handleSortChange = (sortId?: string, sortOrder?: 'asc' | 'desc') => {
		navigate({
			search: {
				...search,
				sortId,
				sortOrder,
				cursor: undefined,
			},
			replace: true,
		});
	};

	const handleCursorChange = (cursor?: string) => {
		navigate({
			search: {
				...search,
				cursor,
			},
			replace: true,
		});
	};

	return (
		<div className="p-4">
			<div className="flex justify-end mb-3">
				<Modal>
					<Modal.Trigger>
						<Button variant="primary" type="button">
							Invite staff user
						</Button>
					</Modal.Trigger>
					<Modal.Backdrop>
						<Modal.Container>
							<Modal.Dialog>
								<form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
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
							</Modal.Dialog>
						</Modal.Container>
					</Modal.Backdrop>
				</Modal>
			</div>

			<MembersTable
				items={data?.data ?? []}
				vars={vars}
				nextCursor={data?.nextCursor}
				isLoading={isLoading}
				onSearch={handleSearch}
				onSortChange={handleSortChange}
				onCursorChange={handleCursorChange}
			/>
		</div>
	);
}
