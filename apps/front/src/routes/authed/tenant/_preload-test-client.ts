import {
	buildFakeApiClient,
	type FakeClientCall,
	type FakeResponse,
} from '~/routes/authed/staff/_preload-test-harness';

// Kept apart from `_preload-test-support`: the tests' `vi.mock` factory for the
// client manager imports this file, and the support file imports modules that
// import the client manager (a factory cannot wait on itself).

/** The fake client manager: tenant-scoped clients prefix every call path with
 * the tenant id they were built for. */
export const buildTenantClientManager = (
	respond: (call: FakeClientCall) => FakeResponse | Promise<FakeResponse>,
) => {
	const plain = buildFakeApiClient(respond);
	return {
		getOrCreateClient: (tenantId: string) =>
			buildFakeApiClient((call) =>
				respond({ path: [tenantId, ...call.path], args: call.args }),
			),
		getOrCreateStaffClient: () => plain,
		getOrCreateTenantScopeClient: () => plain,
		getOrCreateAnonymousClient: () => plain,
		getOrCreateSessionClient: () => plain,
		clearClients: () => {},
	};
};
