namespace PublyApp.Api.Modules.Roles.Services;

// Represents per-item failures for bulk operations where some rows can succeed and
// some fail independently.
public sealed record BulkRoleActionFailedItem(
	Guid RoleId,
	string Error
);

// Normalized aggregate result returned from bulk delete operations.
public sealed record BulkRoleActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkRoleActionFailedItem> FailedItems
);
