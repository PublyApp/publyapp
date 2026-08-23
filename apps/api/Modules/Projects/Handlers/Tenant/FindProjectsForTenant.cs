using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Projects.Services;

namespace PublyApp.Api.Modules.Projects.Handlers.Tenant;

public sealed class FindProjectsForTenant {
	public static async Task<Ok<FindProjectsForTenantResponse>> Handle(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IProjectService projectService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var projects = await projectService.GetProjectsForTenantAsync(
			tenantId, cancellationToken
		);

		return TypedResults.Ok(new FindProjectsForTenantResponse {
			Items = projects
				.Select(p => new ProjectListItem {
					Id = p.GetRequiredId(),
					Name = p.Name,
				})
				.ToList(),
		});
	}
}

public record FindProjectsForTenantResponse {
	public required IReadOnlyList<ProjectListItem> Items { get; init; }
}

public record ProjectListItem {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
}
