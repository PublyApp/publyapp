import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { useForm } from 'react-hook-form';
import type zod from 'zod';

import {
	ACCOUNT_LEVEL_ENUM,
	FRONT_PATH_NAMES,
} from '@org/shared-ts/lib/constants';
import { getNewStaffUserSchema } from '@org/shared-ts/validations/staff-user.validations';

import { toast } from '#app/components/snackbar/index.ts';
import { useRouter } from '#app/hooks/use-router.ts';
import { useSyncFormToLang } from '#app/hooks/use-sync-form-to-lang.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useCreateStaffUser,
	useFindStaffUser,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';

import { UserNewEditForm } from '../../components/user-new-edit-form';

type NewUserSchemaType = Prettify<
	zod.infer<ReturnType<typeof getNewStaffUserSchema>>
>;

const defaultValues: NewUserSchemaType = {
	avatar: undefined,
	firstName: '',
	lastName: '',
	email: '',
	accountLevel: ACCOUNT_LEVEL_ENUM.USER,
	sendNotification: false,
};

const NewStaffUserForm = () => {
	const { i18n, t } = useTranslate();
	const queryClient = useQueryClient();
	const router = useRouter();

	const NewUserSchema = getNewStaffUserSchema(interZodClient);

	const form = useForm<NewUserSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewUserSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: CreateStaffUser, isPending: isCreating } = useCreateStaffUser(
		{
			onSuccess: () => {
				toast.success(
					_.capitalize(
						t('item-creation-success-message', { item: t('staff-user') }),
					),
				);
				void queryClient.invalidateQueries({
					queryKey: useFindStaffUser.getKey(),
				});
				form.reset();
				void router.push(FRONT_PATH_NAMES.staff.staffUsers.root);
			},
			// Error toasts handled by global handler automatically
		},
	);

	return (
		<UserNewEditForm
			form={form}
			onMutate={CreateStaffUser}
			isMutating={isCreating}
		/>
	);
};

export default NewStaffUserForm;
