export type LoginResponse = {
	userId: string;
	sessionToken: string;
	sessionExpiresAt: string;
	sessionExpiresInMs: number;
};

export type TenantSummary = {
	id: string;
	name: string;
	code: string;
};

export type TenantsForPickerResponse = {
	tenants: TenantSummary[];
	totalCount: number;
	activeCount: number;
	hasDeletedTenants: boolean;
	hasSuspendedTenants: boolean;
};

export type PostStatus = 'draft' | 'scheduled' | 'published';

export type PostSummary = {
	id: string;
	status: PostStatus;
	bodyPreview: string;
	createdAt: string;
};

export type PostsResponse = {
	data: PostSummary[];
	nextCursor: string | null;
};
