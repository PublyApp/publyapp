using MainApi.Src.Data;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using ProfileEntity = MainApi.Src.Features.Common.Profile.Profile;
using ProjectEntity = MainApi.Src.Features.Common.Project.Project;
using TenantEntity = MainApi.Src.Features.Common.Tenant.Tenant;
using UserEntity = MainApi.Src.Features.Common.User.User;

namespace MainApi.Src.Features.Common.Invitation;

[Table("invitations")]
[Index(nameof(Email), nameof(Scope), nameof(IsAccepted))]
[Index(nameof(InvitedByUserId))]
[Index(nameof(ExpiresAt))]
[Index(nameof(TenantId), nameof(Scope))]
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

	[Column("token_hash")]
	public required string TokenHash { get; set; }

	[Column("expires_at")]
	public required DateTime ExpiresAt { get; set; }

	[Column("is_accepted")]
	public bool IsAccepted { get; set; } = false;

	[Column("accepted_at")]
	public DateTime? AcceptedAt { get; set; }

	[Column("is_revoked")]
	public bool IsRevoked { get; set; } = false;

	[Column("revoked_at")]
	public DateTime? RevokedAt { get; set; }

	[Column("invited_by_user_id")]
	public required Guid InvitedByUserId { get; set; }
	[JsonIgnore]
	public UserEntity InvitedByUser { get; set; } = null!;

	[Column("profile_id")]
	public required Guid ProfileId { get; set; }
	[JsonIgnore]
	public ProfileEntity Profile { get; set; } = null!;

	public bool IsStaffInvitation => Scope == InvitationScope.Staff && TenantId is null && ProjectId is null;
	public bool IsTenantInvitation => Scope == InvitationScope.Tenant && TenantId is not null && ProjectId is null;
	public bool IsProjectInvitation => Scope == InvitationScope.Project && TenantId is not null && ProjectId is not null;

	public static Invitation CreateStaffInvitation(string email, Guid profileId, Guid invitedByUserId, DateTime expiresAt, string tokenHash) {
		return new Invitation {
			Email = email.ToLowerInvariant(),
			Scope = InvitationScope.Staff,
			TenantId = null,
			ProjectId = null,
			ProfileId = profileId,
			InvitedByUserId = invitedByUserId,
			ExpiresAt = expiresAt,
			TokenHash = tokenHash,
		};
	}

	public static Invitation CreateTenantInvitation(string email, Guid tenantId, Guid profileId, Guid invitedByUserId, DateTime expiresAt, string tokenHash) {
		return new Invitation {
			Email = email.ToLowerInvariant(),
			Scope = InvitationScope.Tenant,
			TenantId = tenantId,
			ProjectId = null,
			ProfileId = profileId,
			InvitedByUserId = invitedByUserId,
			ExpiresAt = expiresAt,
			TokenHash = tokenHash,
		};
	}

	public static Invitation CreateProjectInvitation(string email, Guid tenantId, Guid projectId, Guid profileId, Guid invitedByUserId, DateTime expiresAt, string tokenHash) {
		return new Invitation {
			Email = email.ToLowerInvariant(),
			Scope = InvitationScope.Project,
			TenantId = tenantId,
			ProjectId = projectId,
			ProfileId = profileId,
			InvitedByUserId = invitedByUserId,
			ExpiresAt = expiresAt,
			TokenHash = tokenHash,
		};
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
		}
	}

	public bool CanBeAccepted() {
		return IsAccepted is false
			&& IsRevoked is false
			&& IsDeleted is false
			&& ExpiresAt > DateTime.UtcNow;
	}
}

public enum InvitationScope {
	Staff = 0,
	Tenant = 1,
	Project = 2,
}
