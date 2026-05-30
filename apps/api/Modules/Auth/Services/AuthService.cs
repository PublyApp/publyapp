using PublyApp.Api.Lib.DI;

namespace PublyApp.Api.Modules.Auth.Services;

public interface IAuthService { }

[Service(ServiceLifetime.Scoped)]
public class AuthService : IAuthService { }
