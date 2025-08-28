namespace MainApi.Src.Lib.Filters;

using FluentValidation;

public class BodyValidationFailResult : AppResponseResult
{
	public new string Message { get; set; } = "Validation failed";
	public new string Key { get; set; } = "validation-failed";
	public object FieldErrors { get; set; } = new Dictionary<string, string[]>();
}

public class BodyValidationFilter<TRequest> : IEndpointFilter
{
	private readonly IValidator<TRequest> _validator;

	public BodyValidationFilter(IValidator<TRequest> validator)
	{
		_validator = validator;
	}

	public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext httpContext, EndpointFilterDelegate next)
	{
		var request = httpContext.GetArgument<TRequest>(0);
		var result = await _validator.ValidateAsync(request, httpContext.HttpContext.RequestAborted);

		if (!result.IsValid)
		{
			return TypedResults.BadRequest(new BodyValidationFailResult
			{
				FieldErrors = result.ToDictionary()
			});
		}

		return await next(httpContext);
	}
}

public static class BodyValidationFilterExtensions
{
	public static RouteHandlerBuilder WithBodyValidation<TRequest>(this RouteHandlerBuilder builder)
	{
		return builder.AddEndpointFilter<BodyValidationFilter<TRequest>>();
	}
}

