using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;

using Microsoft.EntityFrameworkCore;

using UserEntity = MainApi.Src.Modules.Users.Entities.User;

namespace MainApi.Src.Modules.SystemNotices.Entities;

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
		return IsDeleted is false
			&& StartsAt <= now
			&& (ExpiresAt is null || ExpiresAt > now);
	}

	public static NoticeSeverity? ParseSeverity(
		string severity
	) {
		var isInfo = string.Compare(
			severity, "info",
			StringComparison.OrdinalIgnoreCase
		) == 0;
		if (isInfo) {
			return NoticeSeverity.Info;
		}
		var isWarning = string.Compare(
			severity, "warning",
			StringComparison.OrdinalIgnoreCase
		) == 0;
		if (isWarning) {
			return NoticeSeverity.Warning;
		}
		var isCritical = string.Compare(
			severity, "critical",
			StringComparison.OrdinalIgnoreCase
		) == 0;
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
