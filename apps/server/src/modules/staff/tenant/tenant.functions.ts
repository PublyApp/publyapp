import { HttpException } from '@/server/exceptions/HttpException';
import {
	fromStaffMemberParseFunction,
	type FunctionParams,
	type FunctionReturn,
} from '@/server/lib/parse/cloud/function';
import { functionName, roleSet } from '@/shared/lib/constants';
import { sleep } from '@/shared/utils/any.utils';
import { getNewTenantSchemaServerSide } from '@org/shared/validations/tenant/tenant.validations';
import _ from 'lodash';

export namespace CreateTenantFunction {
	export type Params = FunctionParams<typeof createTenant>;
	export type Return = FunctionReturn<typeof createTenant>;
}

export const createTenant = fromStaffMemberParseFunction({
	name: functionName.staff.tenant.create,
	allowedRoles: roleSet.STAFF_ADMIN_ONLY,
	validateParams: ({ params, z }) => {
		const maxUsers = Number(_.get(params, 'maxUsers'));
		let initialUsers = _.get(params, 'initialUsers');

		try {
			initialUsers = JSON.parse(initialUsers);
		} catch (error) {
			throw new HttpException(
				400,
				z.t('initial-users-must-be-a-valid-json-string'),
			);
		}

		// const processedParams = {};
		return getNewTenantSchemaServerSide(z).parse({
			...params,
			maxUsers,
			initialUsers,
		});
	},
	action: async ({ params /* , user, req, z, t */ }) => {
		await sleep(3000);
		return { params };
	},
});
