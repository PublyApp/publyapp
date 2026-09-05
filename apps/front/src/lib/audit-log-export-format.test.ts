import { describe, expect, test } from 'vitest';
import {
	AUDIT_LOG_EXPORT_DOWNLOAD_DESCRIPTORS,
	auditLogExportDownloadDescriptor,
} from '~/lib/audit-log-export-format';

describe('auditLogExportDownloadDescriptor', () => {
	test('returns csv extension and text/csv MIME for the CSV format', () => {
		expect(auditLogExportDownloadDescriptor('csv')).toStrictEqual({
			extension: 'csv',
			mimeType: 'text/csv',
		});
	});

	test('returns json extension and application/json MIME for the JSON format', () => {
		expect(auditLogExportDownloadDescriptor('json')).toStrictEqual({
			extension: 'json',
			mimeType: 'application/json',
		});
	});

	test('exposes the full mapping table so no format can ship without both fields declared', () => {
		expect(AUDIT_LOG_EXPORT_DOWNLOAD_DESCRIPTORS).toStrictEqual({
			csv: { extension: 'csv', mimeType: 'text/csv' },
			json: { extension: 'json', mimeType: 'application/json' },
		});
	});
});
