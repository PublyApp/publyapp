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
	useCreateStaffMember,
	useFindStaffMember,
} from '@/front/lib/react-query/features/staff/staff-member.hooks';
import { interZodClient } from '@/front/lib/zod/zod.client';
import { ACCOUNT_LEVEL_ENUM, FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { getNewStaffMemberSchema } from '@/shared/validations/staff-member.validations';

import { UserNewEditForm } from '../../components/user-new-edit-form';

type NewUserSchemaType = Prettify<
	zod.infer<ReturnType<typeof getNewStaffMemberSchema>>
>;

const defaultValues: NewUserSchemaType = {
	avatar: undefined,
	firstName: '',
	lastName: '',
	email: '',
	accountLevel: ACCOUNT_LEVEL_ENUM.USER,
	sendNotification: false,
};

const NewStaffMemberForm = () => {
	const { i18n, t } = useTranslate();
	const queryClient = useQueryClient();
	const router = useRouter();

	const NewUserSchema = getNewStaffMemberSchema(interZodClient);

	const form = useForm<NewUserSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewUserSchema),
		defaultValues,
	});

	useSyncFormToLang(i18n.language, form);

	const { mutate: createStaffMember, isPending: isCreating } =
		useCreateStaffMember({
			onSuccess: () => {
				toast.success(
					_.capitalize(
						t('item-creation-success-message', { item: t('staff-member') }),
					),
				);
				queryClient.invalidateQueries({
					queryKey: useFindStaffMember.getKey(),
				});
				form.reset();
				router.push(FRONT_PATH_NAMES.staff.staffMembers.root);
			},
			// Error toasts handled by global handler automatically
		});

	return (
		<UserNewEditForm
			form={form}
			onMutate={createStaffMember}
			isMutating={isCreating}
		/>
	);
};

export default NewStaffMemberForm;
