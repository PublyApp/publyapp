namespace PublyApp.Api.Modules.Roles.Services;

// Rows (members or invitations) holding one staff role over a filtered
// collection; shared by the staff members and staff invitations lists.
public sealed record StaffRoleCount(Guid RoleId, string Name, int Count);

// Wire shape of <see cref="StaffRoleCount"/> in list responses.
public class StaffRoleCountItem {
	public Guid RoleId { get; set; }
	public string Name { get; set; } = string.Empty;
	public int Count { get; set; }

	public static StaffRoleCountItem From(StaffRoleCount role) {
		return new StaffRoleCountItem {
			RoleId = role.RoleId,
			Name = role.Name,
			Count = role.Count,
		};
	}
}
