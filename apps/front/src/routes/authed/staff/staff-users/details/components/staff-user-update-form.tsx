import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { useForm } from 'react-hook-form';
import type zod from 'zod';

import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
	type UserStatus,
} from '@org/shared-ts/lib/constants';
import { getUpdateStaffUserSchema } from '@org/shared-ts/validations/staff-user.validations';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	useFindStaffUser,
	useGetStaffUserById,
	useUpdateStaffUser,
} from '@/front/lib/react-query/features/staff/staff-user.hooks';
import { interZodClient } from '@/front/lib/zod/zod.client';

import { UserNewEditForm } from '../../components/user-new-edit-form';

type UpdateUserSchemaType = Prettify<
	zod.infer<ReturnType<typeof getUpdateStaffUserSchema>>
>;

export type StaffUserUpdateData = {
	id: string;
	// ===== optional fields =====
	firstName?: string;
	lastName?: string;
	accountLevel?: string;
	email?: string;
	status?: string;
	avatar?: string;
};

const accountLevels: AccountLevel[] = _.values(ACCOUNT_LEVEL_ENUM);
const userStatuses: UserStatus[] = _.values(USER_STATUS_ENUM);

const StaffUserUpdateForm = ({
	currentUser,
}: {
	currentUser: StaffUserUpdateData;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const router = useRouter();

	const UpdateUserSchema = getUpdateStaffUserSchema(interZodClient);

	let _evalUatedAccountLevel: AccountLevel | undefined;
	if (!accountLevels.includes(currentUser.accountLevel as AccountLevel)) {
		_evalUatedAccountLevel = undefined;
	} else {
		_evalUatedAccountLevel = currentUser.accountLevel as AccountLevel;
	}

	let _evalUatedStatus: UserStatus | undefined;
	if (!_.includes(userStatuses, currentUser.status as UserStatus)) {
		_evalUatedStatus = undefined;
	} else {
		_evalUatedStatus = currentUser.status as UserStatus;
	}

	// logger.debug('currentUser', currentUser);

	const form = useForm<UpdateUserSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(UpdateUserSchema),
		values: {
			...currentUser,
			accountLevel: _evalUatedAccountLevel,
			status: _evalUatedStatus,
		},
	});

	const { mutate: updateStaffUser, isPending: isUpdating } = useUpdateStaffUser(
		{
			onSuccess: () => {
				form.reset();
				toast.success(
					_.capitalize(
						t('item-update-success-message', { item: t('staff-user') }),
					),
				);
				queryClient.invalidateQueries({
					queryKey: useFindStaffUser.getKey(),
				});
				queryClient.invalidateQueries({
					queryKey: useGetStaffUserById.getKey({ userId: currentUser.id }),
				});
				router.push(FRONT_PATH_NAMES.staff.staffUsers.root);
			},
			// Error toasts handled by global handler automatically
		},
	);

	return (
		<UserNewEditForm
			form={form}
			onMutate={(data) => {
				// logger.debug('data', data);
				updateStaffUser(data);
			}}
			isMutating={isUpdating}
			isEdit
		/>
	);
};

export default StaffUserUpdateForm;
