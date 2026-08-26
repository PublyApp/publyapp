using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Users.Entities;

using ProjectEntity = PublyApp.Api.Modules.Projects.Entities.Project;
using TenantEntity = PublyApp.Api.Modules.Tenants.Entities.Tenant;
using UserEntity = PublyApp.Api.Modules.Users.Entities.User;

namespace PublyApp.Api.Modules.Invitations.Entities;

[Table("invitations")]
[Index(nameof(Email), nameof(Scope), nameof(Status))]
[Index(nameof(InvitedByUserId))]
[Index(nameof(ExpiresAt))]
[Index(nameof(TenantId), nameof(Scope))]
[Index(nameof(Token), IsUnique = true)]
public class Invitation : BaseAttributes, IOptionalTenantEntity {
	[Column("email")]
	public required string Email { get; set; }

	[Column("scope")]
	public InvitationScope Scope { get; set; } = InvitationScope.Tenant;

	[Column("tenant_id")]
	public Guid? TenantId { get; set; }
	[JsonIgnore]
	public TenantEntity? Tenant { get; set; }

	[Column("project_id")]
	public Guid? ProjectId { get; set; }
	[JsonIgnore]
	public ProjectEntity? Project { get; set; }

	[Column("token")]
	public required string Token { get; set; }

	[Column("expires_at")]
	public required DateTime ExpiresAt { get; set; }

	[Column("status")]
	// Persisted invitation lifecycle. Expiration is derived from Pending + ExpiresAt.
	public InvitationStatus Status { get; set; } = InvitationStatus.Pending;

	[Column("accepted_at")]
	public DateTime? AcceptedAt { get; set; }

	[Column("revoked_at")]
	public DateTime? RevokedAt { get; set; }

	[Column("invited_by_user_id")]
	public required Guid InvitedByUserId { get; set; }

	private UserEntity? _invitedByUser;
	[JsonIgnore]
	public UserEntity InvitedByUser {
		get { return RequiredNavigation.Get(_invitedByUser, nameof(Invitation), nameof(InvitedByUser)); }
		set { _invitedByUser = value; }
	}

	[Column("account_level")]
	public AccountLevel? AccountLevel { get; set; }

	// Multiple profiles via junction table
	[JsonIgnore]
	public ICollection<InvitationProfile> InvitationProfiles { get; set; } = new List<InvitationProfile>();

	// Helper property for easy access
	[NotMapped]
	public List<Guid> ProfileIds {
		get {
			return InvitationProfiles.Select(ip => ip.ProfileId).ToList();
		}
	}

	public bool IsStaffInvitation {
		get {
			return Scope == InvitationScope.Staff && TenantId is null && ProjectId is null;
		}
	}

	public bool IsTenantInvitation {
		get {
			return Scope == InvitationScope.Tenant && TenantId is not null && ProjectId is null;
		}
	}

	public bool IsProjectInvitation {
		get {
			return Scope == InvitationScope.Project && TenantId is not null && ProjectId is not null;
		}
	}

	public static Invitation CreateStaffInvitationWithProfiles(
		string email,
		List<Guid> profileIds,
		Guid invitedByUserId,
		DateTime expiresAt,
		string token
	) {
		var invitation = new Invitation {
			Email = email.ToLowerInvariant(),
			Scope = InvitationScope.Staff,
			TenantId = null,
			ProjectId = null,
			InvitedByUserId = invitedByUserId,
			ExpiresAt = expiresAt,
			Token = token,
		};

		// Add profiles via junction table
		// InvitationId will be set by EF Core when invitation is saved
		foreach (var profileId in profileIds) {
			invitation.InvitationProfiles.Add(new InvitationProfile {
				InvitationId = default, // Will be set by EF Core when invitation is saved
				ProfileId = profileId
			});
		}

		return invitation;
	}

	public static Invitation CreateTenantInvitationWithProfiles(
		string email,
		Guid tenantId,
		List<Guid> profileIds,
		Guid invitedByUserId,
		DateTime expiresAt,
		string token
	) {
		var invitation = new Invitation {
			Email = email.ToLowerInvariant(),
			Scope = InvitationScope.Tenant,
			TenantId = tenantId,
			ProjectId = null,
			InvitedByUserId = invitedByUserId,
			ExpiresAt = expiresAt,
			Token = token,
		};

		// Add profiles via junction table
		// InvitationId will be set by EF Core when invitation is saved
		foreach (var profileId in profileIds) {
			invitation.InvitationProfiles.Add(new InvitationProfile {
				InvitationId = default, // Will be set by EF Core when invitation is saved
				ProfileId = profileId
			});
		}

		return invitation;
	}

	public static Invitation CreateProjectInvitationWithProfiles(
		string email,
		Guid tenantId,
		Guid projectId,
		List<Guid> profileIds,
		Guid invitedByUserId,
		DateTime expiresAt,
		string token
	) {
		var invitation = new Invitation {
			Email = email.ToLowerInvariant(),
			Scope = InvitationScope.Project,
			TenantId = tenantId,
			ProjectId = projectId,
			InvitedByUserId = invitedByUserId,
			ExpiresAt = expiresAt,
			Token = token,
		};

		// Add profiles via junction table
		// InvitationId will be set by EF Core when invitation is saved
		foreach (var profileId in profileIds) {
			invitation.InvitationProfiles.Add(new InvitationProfile {
				InvitationId = default, // Will be set by EF Core when invitation is saved
				ProfileId = profileId
			});
		}

		return invitation;
	}

	public void ValidateInvitationType() {
		switch (Scope) {
			case InvitationScope.Staff:
				if (TenantId is not null || ProjectId is not null) {
					throw new InvalidOperationException("Staff invitations cannot have TenantId or ProjectId");
				}
				break;
			case InvitationScope.Tenant:
				if (TenantId is null || ProjectId is not null) {
					throw new InvalidOperationException("Tenant invitations must have TenantId and no ProjectId");
				}
				break;
			case InvitationScope.Project:
				if (TenantId is null || ProjectId is null) {
					throw new InvalidOperationException("Project invitations must have TenantId and ProjectId");
				}
				break;
			default:
				throw new ArgumentOutOfRangeException(
					nameof(Scope),
					Scope,
					$"Unhandled InvitationScope: {Scope}"
				);
		}
	}

	public bool CanBeAccepted() {
		return IsPending()
			&& !IsDeleted
			&& ExpiresAt > DateTime.UtcNow;
	}

	public bool IsPending() {
		return IsPending(Status);
	}

	public bool IsAccepted() {
		return IsAccepted(Status);
	}

	public bool IsRevoked() {
		return IsRevoked(Status);
	}

	public bool IsExpired(DateTime utcNow) {
		// Expiration is time-derived so rows do not need background writes when time passes.
		return IsPending()
			&& ExpiresAt <= utcNow;
	}

	public static bool IsPending(InvitationStatus status) {
		return status == InvitationStatus.Pending;
	}

	public static bool IsAccepted(InvitationStatus status) {
		return status == InvitationStatus.Accepted;
	}

	public static bool IsRevoked(InvitationStatus status) {
		return status == InvitationStatus.Revoked;
	}

	public static InvitationEffectiveStatus GetEffectiveStatus(
		InvitationStatus status,
		DateTime expiresAt,
		DateTime utcNow
	) {
		// Effective status is what list/filter APIs expose; it can include derived Expired.
		if (status == InvitationStatus.Pending && expiresAt <= utcNow) {
			return InvitationEffectiveStatus.Expired;
		}

		return status switch {
			InvitationStatus.Pending => InvitationEffectiveStatus.Pending,
			InvitationStatus.Accepted => InvitationEffectiveStatus.Accepted,
			InvitationStatus.Revoked => InvitationEffectiveStatus.Revoked,
			_ => InvitationEffectiveStatus.Pending,
		};
	}

	public static InvitationEffectiveStatus? ParseEffectiveStatus(string status) {
		if (string.Equals(status, nameof(InvitationEffectiveStatus.Pending), StringComparison.OrdinalIgnoreCase)) {
			return InvitationEffectiveStatus.Pending;
		}

		if (string.Equals(status, nameof(InvitationEffectiveStatus.Accepted), StringComparison.OrdinalIgnoreCase)) {
			return InvitationEffectiveStatus.Accepted;
		}

		if (string.Equals(status, nameof(InvitationEffectiveStatus.Expired), StringComparison.OrdinalIgnoreCase)) {
			return InvitationEffectiveStatus.Expired;
		}

		if (string.Equals(status, nameof(InvitationEffectiveStatus.Revoked), StringComparison.OrdinalIgnoreCase)) {
			return InvitationEffectiveStatus.Revoked;
		}

		return null;
	}

	public static string GetPersistedStatusDescription(InvitationStatus status) {
		return status switch {
			InvitationStatus.Pending => nameof(InvitationStatus.Pending),
			InvitationStatus.Accepted => nameof(InvitationStatus.Accepted),
			InvitationStatus.Revoked => nameof(InvitationStatus.Revoked),
			_ => "Unknown",
		};
	}

	public static string GetEffectiveStatusDescription(InvitationEffectiveStatus status) {
		return status switch {
			InvitationEffectiveStatus.Pending => nameof(InvitationEffectiveStatus.Pending),
			InvitationEffectiveStatus.Accepted => nameof(InvitationEffectiveStatus.Accepted),
			InvitationEffectiveStatus.Expired => nameof(InvitationEffectiveStatus.Expired),
			InvitationEffectiveStatus.Revoked => nameof(InvitationEffectiveStatus.Revoked),
			_ => "Unknown",
		};
	}
}

public enum InvitationScope {
	Staff = 0,
	Tenant = 1,
	Project = 2,
}

public enum InvitationStatus {
	Pending,
	Accepted,
	Revoked
}

[JsonConverter(typeof(JsonStringEnumConverter<InvitationEffectiveStatus>))]
public enum InvitationEffectiveStatus {
	Pending,
	Accepted,
	Expired,
	Revoked
}
