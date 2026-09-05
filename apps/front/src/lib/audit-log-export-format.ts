/**
 * Maps a {@link StaffAuditLogExportFormat} to the file extension and MIME
 * type used when the user actually downloads the export. The download call
 * MUST use the same extension AND MIME as the requested format — Excel
 * trusts one, downstream importers trust the other, and a mismatched
 * `audit-logs-….json` saved as `.csv` announced as `text/csv` is the exact
 * silent failure this mapping defends against (issue #2035).
 *
 * A single source of truth removes the duplication between the dashboard
 * report and the audit-log drawer that let one of them drift out of test
 * coverage.
 */
export type AuditLogExportDownloadDescriptor = {
	extension: 'csv' | 'json';
	mimeType: 'text/csv' | 'application/json';
};

export const AUDIT_LOG_EXPORT_DOWNLOAD_DESCRIPTORS = {
	csv: { extension: 'csv', mimeType: 'text/csv' },
	json: { extension: 'json', mimeType: 'application/json' },
} as const satisfies Record<string, AuditLogExportDownloadDescriptor>;

/** Resolves the (extension, MIME) pair for a format. Exhaustive — the return
 * type is the literal descriptor, so a future format added here without
 * listing both fields fails type-checking instead of silently shipping a
 * frozen default. */
export const auditLogExportDownloadDescriptor = (
	format: 'csv' | 'json',
): AuditLogExportDownloadDescriptor =>
	AUDIT_LOG_EXPORT_DOWNLOAD_DESCRIPTORS[format];
