namespace PublyApp.Api.Modules.Profiles.Services;

// Represents per-item failures for bulk operations where some rows can succeed and
// some fail independently.
public sealed record BulkProfileActionFailedItem(
	Guid ProfileId,
	string Error
);

// Normalized aggregate result returned from bulk delete operations.
public sealed record BulkProfileActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkProfileActionFailedItem> FailedItems
);
