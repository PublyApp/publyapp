namespace PublyApp.Api.Lib;

/// <summary>
/// Hosting role for the single PublyApp.Api image (design §3, D1). One build/image;
/// the APP_ROLE env var picks composition at startup:
/// <list type="bullet">
/// <item><see cref="Api"/> — maps the HTTP surface; registers NO job hosted-services.</item>
/// <item><see cref="Worker"/> — registers the job engine (processor, scheduler leader,
/// Quartz, heartbeat); serves NO HTTP request surface.</item>
/// <item><see cref="All"/> — both. Reserved for local development and the worker
/// integration fixtures (C6/F24): it is the default when APP_ROLE is unset/blank ONLY
/// under the Development and Testing host environments. Anywhere else a missing APP_ROLE
/// is a fail-fast startup error, never a fallback to <see cref="All"/> — composing the
/// job engine into a process an operator intended as API-only is a defect, not a safe
/// default. See <see cref="AppEnvironment.Role"/>.</item>
/// </list>
/// </summary>
public enum AppRole {
	Api,
	Worker,
	All
}
