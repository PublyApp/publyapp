import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { useForm } from 'react-hook-form';
import type zod from 'zod';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useTranslate } from '@/front/hooks/use-translate';
import {
	useFindStaffMember,
	useGetStaffMemberById,
	useUpdateStaffMember,
} from '@/front/lib/react-query/features/staff/staff-member.hooks';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
	type UserStatus,
} from '@/shared/lib/constants';
import { getUpdateStaffMemberSchema } from '@/shared/validations/staff-member.validations';
import { UserNewEditForm } from '../../components/user-new-edit-form';

type UpdateUserSchemaType = Prettify<
	zod.infer<ReturnType<typeof getUpdateStaffMemberSchema>>
>;

export type StaffMemberUpdateData = {
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

const StaffMemberUpdateForm = ({
	currentUser,
}: {
	currentUser: StaffMemberUpdateData;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const router = useRouter();

	const UpdateUserSchema = getUpdateStaffMemberSchema(defaultZodClient);

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

	const { mutate: updateStaffMember, isPending: isUpdating } =
		useUpdateStaffMember({
			onSuccess: () => {
				form.reset();
				toast.success(
					_.capitalize(
						t('item-update-success-message', { item: t('staff-member') }),
					),
				);
				queryClient.invalidateQueries({
					queryKey: useFindStaffMember.getKey(),
				});
				queryClient.invalidateQueries({
					queryKey: useGetStaffMemberById.getKey({ userId: currentUser.id }),
				});
				router.push(FRONT_PATH_NAMES.staff.staffMembers.root);
			},
			// Error toasts handled by global handler automatically
		});

	return (
		<UserNewEditForm
			form={form}
			onMutate={(data) => {
				// logger.debug('data', data);
				updateStaffMember(data);
			}}
			isMutating={isUpdating}
			isEdit
		/>
	);
};

export default StaffMemberUpdateForm;
