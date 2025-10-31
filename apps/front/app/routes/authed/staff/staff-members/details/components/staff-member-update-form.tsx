import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import { useForm } from 'react-hook-form';
import type zod from 'zod';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useTranslate } from '@/front/hooks/use-translate';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import {
	useFindStaffMember,
	useUpdateStaffMember,
} from '@/front/lib/react-query/features/staff/staff-member.hooks';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
} from '@/shared/lib/constants';
import { getUpdateStaffMemberSchema } from '@/shared/validations/staff-member/staff-member.validation';
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

	const form = useForm<UpdateUserSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(UpdateUserSchema),
		values: {
			...currentUser,
			accountLevel: _evalUatedAccountLevel,
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
				router.push(FRONT_PATH_NAMES.staff.staffMembers.root);
			},
			onError: (error) => {
				if (isJsClientError(error)) {
					toast.error(
						error.key
							? t(error.key as never, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
							: error.messageEscaped,
					);
					return;
				}
				toast.error(_.trim(error.message) || t('unknown-error'));
			},
		});

	return (
		<UserNewEditForm
			form={form}
			onMutate={updateStaffMember}
			isMutating={isUpdating}
			isEdit
		/>
	);
};

export default StaffMemberUpdateForm;
