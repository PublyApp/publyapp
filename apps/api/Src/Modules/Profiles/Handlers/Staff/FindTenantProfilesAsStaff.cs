using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public class ProfileAsStaffItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
}

public class FindTenantProfilesAsStaffResult {
	public required List<ProfileAsStaffItem> Profiles { get; set; }
	public required int Count { get; set; }
}

public class FindTenantProfilesAsStaffQuery : PaginatedQuery { }

public class FindTenantProfilesAsStaffQueryValidator : OffsetPaginatedQueryValidator<FindTenantProfilesAsStaffQuery> { }

public class FindTenantProfilesAsStaff {
	public static async Task<
		Results<
			Ok<FindTenantProfilesAsStaffResult>,
			AppBadRequestHttpResult
		>
	> HandleFindTenantProfilesAsStaff(
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[AsParameters] FindTenantProfilesAsStaffQuery findTenantProfilesAsStaffQuery,
		[FromRoute] string tenantId,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest("Invalid tenant ID", ResponseKeys.BadRequest);
		}

		var page = findTenantProfilesAsStaffQuery.GetPage();
		var limit = findTenantProfilesAsStaffQuery.GetLimit();
		var sortId = findTenantProfilesAsStaffQuery.GetSortId();
		var sortOrder = findTenantProfilesAsStaffQuery.GetSortOrder();

		var profiles = await profileAsStaffService.FindTenantProfilesAsync(
			tenantId: tenantIdGuid,
			page: page,
			limit: limit,
			sortId: sortId,
			sortOrder: sortOrder,
			cancellationToken: cancellationToken
		);

		return TypedResults.Ok(new FindTenantProfilesAsStaffResult {
			Profiles = profiles
				.Select(profile => new ProfileAsStaffItem {
					Id = profile.GetRequiredId(),
					Name = profile.Name,
				})
				.ToList(),
			Count = profiles.Count,
		});
	}
}
