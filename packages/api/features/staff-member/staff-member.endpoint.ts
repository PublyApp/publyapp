import { functionName } from '@/shared/lib/constants';
import BaseEndPoints, {
	type BaseEndPointsProps,
} from 'packages/api/classes/BaseEndPoints';
import type { CreateStaffMemberFunction } from '@/server/modules/staff/staff-member/staff-member.functions';
import _ from 'lodash';

export type CreateStaffMemberParams = CreateStaffMemberFunction.Params & {
	avatar?: File;
};

export default class StaffMemberEndPoints extends BaseEndPoints {
	constructor({ parseRestClient }: BaseEndPointsProps) {
		super({ parseRestClient });
	}

	createStaffMember(params: CreateStaffMemberParams) {
		const formData = new FormData();
		_.entries(params).forEach((value) => {
			const [key, fieldValue] = value;
			formData.append(key, fieldValue);
		});

		return this.parseRestClient.cloudRun<
			CreateStaffMemberFunction.Return,
			FormData
		>(functionName.staff.staffMember.create, {
			params: formData,
			headers: {
				'Content-Type': 'multipart/form-data',
			},
		});
	}
}
