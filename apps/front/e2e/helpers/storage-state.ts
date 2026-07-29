/** Shared between playwright.config.ts (project `use.storageState`) and
 * e2e/auth.setup.ts (where it's written) — kept out of auth.setup.ts itself
 * so the config file never has to import a file that registers a test. */
export const STAFF_ADMIN_STORAGE_STATE = 'playwright/.auth/staff-admin.json';
