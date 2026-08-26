import { deriveProfileCardStyle } from '~/lib/profiles/profile-card-style';

// Tenant surfaces keep their historical local name; #980 promoted the
// implementation to the shared `lib/profile-card-style` module so staff and
// tenant profiles fall back identically.
export const deriveTenantProfileCardStyle = deriveProfileCardStyle;
