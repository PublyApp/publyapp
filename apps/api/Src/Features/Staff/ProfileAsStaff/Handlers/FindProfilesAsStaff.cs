using MainApi.Localization;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.ProfileAsStaff.Handlers;

public class ProfileAsStaffItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
}

public class FindProfilesAsStaffResult {
	public required List<ProfileAsStaffItem> Profiles { get; set; }
	public required int Count { get; set; }
}


public class FindProfilesAsStaff {
	public static async Task<
		Results<
			Ok<FindProfilesAsStaffResult>,
			BadRequest<ApiResponse>
		>
	> HandleFindProfilesAsStaff(
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromRoute] string tenantId,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Tenant not found",
				ResponseKeys.NotFound
			));
		}

		// var page = null;// findProfilesAsStaffQuery.GetPage();
		// var limit = null;// findProfilesAsStaffQuery.GetLimit();
		// var sortId = null;// findProfilesAsStaffQuery.GetSortId();
		// var sortOrder = null;// findProfilesAsStaffQuery.GetSortOrder();

		var profiles = await profileAsStaffService.FindTenantProfilesAsync(
			tenantId: tenantIdGuid,
			page: null,
			limit: null,
			sortId: null,
			sortOrder: null,
			cancellationToken: cancellationToken);

		return TypedResults.Ok(
			new FindProfilesAsStaffResult {
				Profiles = profiles.Select(profile => new ProfileAsStaffItem {
					Id = profile.Id,
					Name = profile.Name,
				}).ToList(),
				Count = profiles.Count,
			}
		);
	}
}
