using MainApi.Lib.DI;

namespace MainApi.Modules.Auth.Services;

public interface IAuthService { }

[Service(ServiceLifetime.Scoped)]
public class AuthService : IAuthService { }
