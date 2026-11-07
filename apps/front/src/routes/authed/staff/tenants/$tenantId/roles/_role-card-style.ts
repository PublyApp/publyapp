import { deriveRoleCardStyle } from '~/lib/roles/role-card-style';

// Tenant surfaces keep their historical local name; #980 promoted the
// implementation to the shared `lib/role-card-style` module so staff and
// tenant roles fall back identically.
export const deriveTenantRoleCardStyle = deriveRoleCardStyle;
