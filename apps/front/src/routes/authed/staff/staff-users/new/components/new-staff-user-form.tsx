import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { useForm } from 'react-hook-form';
import type zod from 'zod';

import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	useCreateStaffUser,
	useFindStaffUser,
} from '@/front/lib/react-query/features/staff/staff-user.hooks';
import { interZodClient } from '@/front/lib/zod/zod.client';
import { ACCOUNT_LEVEL_ENUM, FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { getNewStaffUserSchema } from '@/shared/validations/staff-user.validations';

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
				queryClient.invalidateQueries({
					queryKey: useFindStaffUser.getKey(),
				});
				form.reset();
				router.push(FRONT_PATH_NAMES.staff.staffUsers.root);
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
