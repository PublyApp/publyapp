import { describe, expect, test } from 'vitest';
import { auditLogExportDownloadDescriptor } from '~/lib/audit-log-export-format';

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

	test('does not let runtime mutation affect later descriptors', () => {
		const descriptor = auditLogExportDownloadDescriptor('json');

		Reflect.set(descriptor, 'extension', 'csv');
		Reflect.set(descriptor, 'mimeType', 'text/csv');

		expect(auditLogExportDownloadDescriptor('json')).toStrictEqual({
			extension: 'json',
			mimeType: 'application/json',
		});
	});
});
