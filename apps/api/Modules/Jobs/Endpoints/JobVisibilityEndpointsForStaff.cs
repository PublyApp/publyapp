using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Jobs.Handlers.Staff;

namespace PublyApp.Api.Modules.Jobs.Endpoints;

/// <summary>
/// A5 (#636): the staff jobs dashboard surfaces. Mounted under the staff group in
/// Program.cs. Three MapGroups are built here over the SAME /staff/jobs/system-jobs
/// path prefix with DIFFERENT rate-limit policies — each policy applies only to the
/// routes registered through its own group variable. Do NOT merge them: the trigger
/// must not share the reads' heavy-search bucket (Global Constraint 4).
/// </summary>
public static class JobVisibilityEndpointsForStaff {
	public static IEndpointRouteBuilder MapJobVisibilityEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		// /staff/jobs/queue — reads only, heavy-search list bucket.
		var queueGroup = routes.MapGroup(
			PathUtils.Join(Routes.Staff.Root,
				Routes.Jobs.ForStaff.JobsRoot,
				Routes.Jobs.ForStaff.Queue.Root)
		)
			.RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
			.WithTags("Staff Jobs");

		queueGroup.MapGet(
				Routes.Jobs.ForStaff.Queue.GetById,
				GetJobQueueItemForStaff.Handle
			)
			.WithName("StaffJobQueueGetById")
			.WithPermission([AppPermissions.Staff.Jobs.VIEW]);

		queueGroup.MapGet("/", FindJobQueueItemsForStaff.Handle)
			.WithName("StaffJobQueueFind")
			.WithPermission([AppPermissions.Staff.Jobs.VIEW]);

		// /staff/jobs/dead-letter — READS (list, get-by-id) only. The requeue POST
		// lives in the EXTENDED K-1 group (JobDeadLetterEndpointsForStaff) so its
		// path stays at the K-1 root /staff/dead-letter/{id}/requeue.
		var dlqReadsGroup = routes.MapGroup(
			PathUtils.Join(Routes.Staff.Root,
				Routes.Jobs.ForStaff.JobsRoot,
				Routes.Jobs.ForStaff.DeadLetter.Root)
		)
			.RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
			.WithTags("Staff Jobs");

		dlqReadsGroup.MapGet(
				Routes.Jobs.ForStaff.DeadLetter.GetById,
				GetDeadLetterForStaff.Handle
			)
			.WithName("StaffDeadLetterGetById")
			.WithPermission([AppPermissions.Staff.Jobs.VIEW]);

		dlqReadsGroup.MapGet("/", FindDeadLettersForStaff.Handle)
			.WithName("StaffDeadLetterFind")
			.WithPermission([AppPermissions.Staff.Jobs.VIEW]);

		// /staff/jobs/system-jobs — reads, heavy-search bucket.
		var sysGroup = routes.MapGroup(
			PathUtils.Join(Routes.Staff.Root,
				Routes.Jobs.ForStaff.JobsRoot,
				Routes.Jobs.ForStaff.SystemJobs.Root)
		)
			.RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
			.WithTags("Staff Jobs");

		sysGroup.MapGet(
				Routes.Jobs.ForStaff.SystemJobs.GetById,
				GetSystemJobDefinitionForStaff.Handle
			)
			.WithName("StaffSystemJobDefinitionGetById")
			.WithPermission([AppPermissions.Staff.Jobs.VIEW]);

		sysGroup.MapGet("/", FindSystemJobDefinitionsForStaff.Handle)
			.WithName("StaffSystemJobDefinitionFind")
			.WithPermission([AppPermissions.Staff.Jobs.VIEW]);

		// Same path prefix, mutations bucket (authenticated default).
		var sysMutationGroup = routes.MapGroup(
			PathUtils.Join(Routes.Staff.Root,
				Routes.Jobs.ForStaff.JobsRoot,
				Routes.Jobs.ForStaff.SystemJobs.Root)
		)
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTags("Staff Jobs");

		sysMutationGroup.MapPatch(
				Routes.Jobs.ForStaff.SystemJobs.UpdateEnabled,
				UpdateSystemJobDefinitionEnabledForStaff.Handle
			)
			.WithName("StaffSystemJobDefinitionUpdateEnabled")
			.WithReqBodyValidation<UpdateSystemJobDefinitionEnabledForStaffBody>()
			.WithPermission([AppPermissions.Staff.Jobs.SYSTEM_JOB_UPDATE]);

		sysMutationGroup.MapPatch(
				Routes.Jobs.ForStaff.SystemJobs.UpdateCron,
				UpdateSystemJobDefinitionCronForStaff.Handle
			)
			.WithName("StaffSystemJobDefinitionUpdateCron")
			.WithReqBodyValidation<UpdateSystemJobDefinitionCronForStaffBody>()
			.WithPermission([AppPermissions.Staff.Jobs.SYSTEM_JOB_UPDATE]);

		// Same path prefix again, dedicated trigger bucket — it produces real
		// job_queue work and must not share any other bucket.
		var triggerGroup = routes.MapGroup(
			PathUtils.Join(Routes.Staff.Root,
				Routes.Jobs.ForStaff.JobsRoot,
				Routes.Jobs.ForStaff.SystemJobs.Root)
		)
			.RequireRateLimiting(ApiRateLimitPolicies.SystemJobTrigger)
			.WithTags("Staff Jobs");

		triggerGroup.MapPost(
				Routes.Jobs.ForStaff.SystemJobs.Trigger,
				TriggerSystemJobDefinitionForStaff.Handle
			)
			.WithName("StaffSystemJobDefinitionTrigger")
			.WithPermission([AppPermissions.Staff.Jobs.SYSTEM_JOB_TRIGGER]);

		return routes;
	}
}
