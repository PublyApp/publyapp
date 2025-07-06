import BaseEndPoints, {
	type BaseEndPointsProps,
} from '@/parse-api-client/classes/BaseEndPoints';
import type { CreateTenantFunction } from '@/server/modules/staff/tenant/tenant.functions';
import { functionName } from '@/shared/lib/constants';
import _ from 'lodash';

export type CreateTenantParams = CreateTenantFunction.Params & {
	avatar?: File;
};

export default class TenantEndPoints extends BaseEndPoints {
	constructor({ parseRestClient }: BaseEndPointsProps) {
		super({ parseRestClient });
	}

	createTenant(params: CreateTenantParams) {
		const formData = new FormData();
		_.entries(params).forEach((value) => {
			const [key, fieldValue] = value;
			if (_.isArray(fieldValue)) {
				formData.append(key, JSON.stringify(fieldValue));
				return;
			}
			if (_.isNumber(fieldValue)) {
				formData.append(key, _.toString(fieldValue));
				return;
			}
			formData.append(key, fieldValue);
		});

		return this.parseRestClient.cloudRun<CreateTenantFunction.Return, FormData>(
			functionName.staff.tenant.create,
			{
				params: formData,
				headers: {
					'Content-Type': 'multipart/form-data',
				},
			},
		);
	}
}
