using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;

using ProjectEntity = PublyApp.Api.Modules.Projects.Entities.Project;
using TenantEntity = PublyApp.Api.Modules.Tenants.Entities.Tenant;
using UserEntity = PublyApp.Api.Modules.Users.Entities.User;

namespace PublyApp.Api.Modules.Invitations.Entities;

[Table("invitations")]
[Index(nameof(Invitation.Email), nameof(Invitation.Scope), nameof(Invitation.Status))]
[Index(nameof(Invitation.InvitedByUserId))]
[Index(nameof(Invitation.ExpiresAt))]
[Index(nameof(Invitation.TenantId), nameof(Invitation.Scope))]
[Index(nameof(Invitation.Token), IsUnique = true)]
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

	private UserEntity? _InvitedByUser;
	[JsonIgnore]
	public UserEntity InvitedByUser {
		get { return RequiredNavigation.Get(this._InvitedByUser, nameof(Invitation), nameof(this.InvitedByUser)); }
		set { this._InvitedByUser = value; }
	}

	// Multiple roles via junction table
	[JsonIgnore]
	public ICollection<InvitationRole> InvitationRoles { get; set; } = new List<InvitationRole>();

	// Helper property for easy access
	[NotMapped]
	public List<Guid> RoleIds {
		get {
			return this.InvitationRoles.Select(ip => ip.RoleId).ToList();
		}
	}

	public bool IsStaffInvitation {
		get {
			return this.Scope == InvitationScope.Staff && this.TenantId is null && this.ProjectId is null;
		}
	}

	public bool IsTenantInvitation {
		get {
			return this.Scope == InvitationScope.Tenant && this.TenantId is not null && this.ProjectId is null;
		}
	}

	public bool IsProjectInvitation {
		get {
			return this.Scope == InvitationScope.Project && this.TenantId is not null && this.ProjectId is not null;
		}
	}

	public static Invitation CreateStaffInvitationWithRoles(
		string email,
		List<Guid> roleIds,
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

		// Add roles via junction table
		// InvitationId will be set by EF Core when invitation is saved
		foreach (var roleId in roleIds) {
			invitation.InvitationRoles.Add(new InvitationRole {
				InvitationId = default, // Will be set by EF Core when invitation is saved
				RoleId = roleId
			});
		}

		return invitation;
	}

	public static Invitation CreateTenantInvitationWithRoles(
		string email,
		Guid tenantId,
		List<Guid> roleIds,
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

		// Add roles via junction table
		// InvitationId will be set by EF Core when invitation is saved
		foreach (var roleId in roleIds) {
			invitation.InvitationRoles.Add(new InvitationRole {
				InvitationId = default, // Will be set by EF Core when invitation is saved
				RoleId = roleId
			});
		}

		return invitation;
	}

	public static Invitation CreateProjectInvitationWithRoles(
		string email,
		Guid tenantId,
		Guid projectId,
		List<Guid> roleIds,
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

		// Add roles via junction table
		// InvitationId will be set by EF Core when invitation is saved
		foreach (var roleId in roleIds) {
			invitation.InvitationRoles.Add(new InvitationRole {
				InvitationId = default, // Will be set by EF Core when invitation is saved
				RoleId = roleId
			});
		}

		return invitation;
	}

	public void ValidateInvitationType() {
		switch (this.Scope) {
			case InvitationScope.Staff:
				if (this.TenantId is not null || this.ProjectId is not null) {
					throw new InvalidOperationException("Staff invitations cannot have TenantId or ProjectId");
				}
				break;
			case InvitationScope.Tenant:
				if (this.TenantId is null || this.ProjectId is not null) {
					throw new InvalidOperationException("Tenant invitations must have TenantId and no ProjectId");
				}
				break;
			case InvitationScope.Project:
				if (this.TenantId is null || this.ProjectId is null) {
					throw new InvalidOperationException("Project invitations must have TenantId and ProjectId");
				}
				break;
			default:
				throw new ArgumentOutOfRangeException(
					nameof(this.Scope),
					this.Scope,
					$"Unhandled InvitationScope: {this.Scope}"
				);
		}
	}

	public bool CanBeAccepted() {
		return this.IsPending()
			&& !this.IsDeleted
			&& this.ExpiresAt > DateTime.UtcNow;
	}

	public bool IsPending() {
		return Invitation.IsPending(this.Status);
	}

	public bool IsAccepted() {
		return Invitation.IsAccepted(this.Status);
	}

	public bool IsRevoked() {
		return Invitation.IsRevoked(this.Status);
	}

	public bool IsExpired(DateTime utcNow) {
		// Expiration is time-derived so rows do not need background writes when time passes.
		return this.IsPending()
			&& this.ExpiresAt <= utcNow;
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
