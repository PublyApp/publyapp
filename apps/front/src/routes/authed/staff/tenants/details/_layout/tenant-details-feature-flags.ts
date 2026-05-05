export const TENANT_DETAILS_BILLING_ENABLED = false;

// Keep the future Activity tab visible but gated until tenant-scoped audit
// loading is implemented under the dedicated follow-up issue.
export const TENANT_DETAILS_ACTIVITY_ENABLED = false;

// Keep tenant usage visible in the IA while product/API metric definitions
// stay deferred; direct URL access is guarded by the matching route flag.
export const TENANT_DETAILS_USAGE_ENABLED = false;
