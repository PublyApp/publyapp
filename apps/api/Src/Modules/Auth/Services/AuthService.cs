using MainApi.Src.Lib.DI;

namespace MainApi.Src.Modules.Auth.Services;

public interface IAuthService { }

[Service(ServiceLifetime.Scoped)]
public class AuthService : IAuthService { }
