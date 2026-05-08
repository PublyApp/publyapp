import type { DatePickerFormat } from '#app/utils/format-time.ts';

export type TenantUserCompanyData = {
	id: string;
	tenantId: string;
	tenantName: string;
	tenantLogoUrl?: string;
	level?: string;
	status?: string;
	createdAt?: DatePickerFormat;
	updatedAt?: DatePickerFormat;
};
