import BaseEndPoints, {
	type BaseEndPointsProps,
} from '@/parse-api-client/classes/BaseEndPoints';
import type {
	CreateStaffMemberFunction,
	FindStaffMemberFunction,
	GetStaffMemberByIdFunction,
} from '@/server/modules/staff/staff-member/staff-member.functions';
import { functionName } from '@/shared/lib/constants';
import _ from 'lodash';

export type CreateStaffMemberParams = CreateStaffMemberFunction.Params & {
	avatar?: File | string;
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

	findStaffMember(params: FindStaffMemberFunction.Params) {
		return this.parseRestClient.cloudRun<
			FindStaffMemberFunction.Return,
			FindStaffMemberFunction.Params
		>(functionName.staff.staffMember.find, {
			params,
		});
	}

	getStaffMemberById(params: GetStaffMemberByIdFunction.Params) {
		return this.parseRestClient.cloudRun<
			GetStaffMemberByIdFunction.Return,
			GetStaffMemberByIdFunction.Params
		>(functionName.staff.staffMember.getById, {
			params,
		});
	}
}
