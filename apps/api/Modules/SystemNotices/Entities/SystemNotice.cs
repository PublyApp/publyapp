using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Data;

using Microsoft.EntityFrameworkCore;

using UserEntity = MainApi.Modules.Users.Entities.User;

namespace MainApi.Modules.SystemNotices.Entities;

[Table("system_notices")]
[Index(nameof(StartsAt), nameof(ExpiresAt))]
[Index(nameof(Severity))]
public class SystemNotice : BaseAttributes, INoTenantEntity {
	[Column("severity")]
	public required NoticeSeverity Severity { get; set; }

	[Column("title")]
	public required string Title { get; set; }

	[Column("message")]
	public required string Message { get; set; }

	[Column("starts_at")]
	public required DateTime StartsAt { get; set; }

	[Column("expires_at")]
	public DateTime? ExpiresAt { get; set; }

	[Column("created_by_staff_id")]
	public required Guid CreatedByStaffId { get; set; }
	[JsonIgnore]
	public UserEntity CreatedByStaff { get; set; } = null!;

	public bool IsActive() {
		var now = DateTime.UtcNow;
		return !IsDeleted
			&& StartsAt <= now
			&& (ExpiresAt is null || ExpiresAt > now);
	}

	public static NoticeSeverity? ParseSeverity(
		string severity
	) {
		var isInfo = string.Equals(
			severity, "info",
			StringComparison.OrdinalIgnoreCase
		);
		if (isInfo) {
			return NoticeSeverity.Info;
		}
		var isWarning = string.Equals(
			severity, "warning",
			StringComparison.OrdinalIgnoreCase
		);
		if (isWarning) {
			return NoticeSeverity.Warning;
		}
		var isCritical = string.Equals(
			severity, "critical",
			StringComparison.OrdinalIgnoreCase
		);
		if (isCritical) {
			return NoticeSeverity.Critical;
		}
		return null;
	}
}

public enum NoticeSeverity {
	Info = 0,
	Warning = 1,
	Critical = 2,
}
