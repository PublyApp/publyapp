
using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Projects.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Projects.Services;

public sealed class ProjectServiceSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public ProjectServiceSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldSoftDeleteProjectWithoutChangingLifecycleStatusWhenDeleting() {
		await using var db = this._Fixture.OpenDb();

		var tenantId = await db.Context.Tenant
			.Where(t => t.Code == SeedConstants.Tenants.AcmeCode)
			.Select(t => t.Id)
			.SingleAsync();
		if (tenantId is null) {
			throw new InvalidOperationException("Seed tenant id was unexpectedly null.");
		}

		var project = new Project {
			TenantId = tenantId.Value,
			Name = $"Soft Delete Project {Guid.NewGuid():N}",
			Status = ProjectStatus.Active
		};

		db.Context.Project.Add(project);
		await db.Context.SaveChangesAsync();

		var projectId = project.GetRequiredId();
		var service = new ProjectService(db.Context);

		await service.DeleteProjectAsync(projectId);

		db.Context.ChangeTracker.Clear();
		var deletedProject = await db.Context.Project
			.SingleAsync(p => p.Id == projectId);

		deletedProject.IsDeleted.Should().BeTrue();
		deletedProject.DeletedAt.Should().NotBeNull();
		deletedProject.Status.Should().Be(ProjectStatus.Active);

		var visibleProjects = await service.GetProjectsForTenantAsync(tenantId.Value);
		visibleProjects.Should().NotContain(p => p.Id == projectId);
	}
}
