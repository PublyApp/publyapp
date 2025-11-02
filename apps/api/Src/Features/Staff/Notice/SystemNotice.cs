using MainApi.Src.Data;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using UserEntity = MainApi.Src.Features.Common.User.User;

namespace MainApi.Src.Features.Staff.Notice;

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
}

public enum NoticeSeverity {
	Info = 0,
	Warning = 1,
	Critical = 2,
}
