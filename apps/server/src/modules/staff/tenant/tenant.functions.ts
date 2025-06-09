import {
	fromStaffMemberParseFunction,
	type FunctionParams,
	type FunctionReturn,
} from '@/server/lib/parse/cloud/function';
import { functionName, roleSet } from '@/shared/lib/constants';
import { sleep } from '@/shared/utils/any.utils';
import { getNewTenantSchemaServerSide } from '@org/shared/validations/tenant/tenant.validations';

export namespace CreateTenantFunction {
	export type Params = FunctionParams<typeof createTenant>;
	export type Return = FunctionReturn<typeof createTenant>;
}

export const createTenant = fromStaffMemberParseFunction({
	name: functionName.staff.tenant.create,
	allowedRoles: roleSet.STAFF_ADMIN_ONLY,
	validateParams: ({ params, z }) => {
		console.dir(params, { depth: null });
		return getNewTenantSchemaServerSide(z).parse(params);
	},
	action: async ({ params /* , user, req, z, t */ }) => {
		await sleep(3000);
		return { params };
	},
});
