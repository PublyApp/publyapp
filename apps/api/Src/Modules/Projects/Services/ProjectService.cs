using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Projects.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Projects.Services;

public interface IProjectService {
	Task<Project?> GetProjectAsync(Guid projectId, CancellationToken cancellationToken = default);
	Task<List<Project>> GetProjectsForTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);
	Task<Project> CreateProjectAsync(Project project, CancellationToken cancellationToken = default);
	Task<Project> UpdateProjectAsync(Project project, CancellationToken cancellationToken = default);
	Task DeleteProjectAsync(Guid projectId, CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public class ProjectService : IProjectService {
	private readonly MainApiDbContext _dbContext;

	public ProjectService(MainApiDbContext context) {
		_dbContext = context;
	}

	public async Task<Project?> GetProjectAsync(
		Guid projectId,
		CancellationToken cancellationToken = default
	) {
		return await _dbContext.Project
			.Where(x => x.Id == projectId && !x.IsDeleted)
			.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<List<Project>> GetProjectsForTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		return await _dbContext.Project
			.Where(x =>
				x.TenantId == tenantId
				&& !x.IsDeleted
				&& x.Status == ProjectStatus.Active
			)
			.OrderBy(x => x.Name)
			.ToListAsync(cancellationToken);
	}

	public async Task<Project> CreateProjectAsync(
		Project project,
		CancellationToken cancellationToken = default
	) {
		await _dbContext.Project.AddAsync(project, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);
		return project;
	}

	public async Task<Project> UpdateProjectAsync(
		Project project,
		CancellationToken cancellationToken = default
	) {
		_dbContext.Project.Update(project);
		await _dbContext.SaveChangesAsync(cancellationToken);
		return project;
	}

	public async Task DeleteProjectAsync(Guid projectId, CancellationToken cancellationToken = default) {
		var project = await GetProjectAsync(projectId, cancellationToken);
		if (project is not null) {
			// Deletion is audit state. ProjectStatus.Inactive remains available for non-deleted projects.
			project.IsDeleted = true;
			project.DeletedAt = DateTime.UtcNow;
			await _dbContext.SaveChangesAsync(cancellationToken);
		}
	}
}
