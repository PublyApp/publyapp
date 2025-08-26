using FluentValidation;

namespace MainApi.Src.Lib.Filters;

public class ValidationFilter<TRequest> : IEndpointFilter
{
	private readonly IValidator<TRequest> _validator;

	public ValidationFilter(IValidator<TRequest> validator)
	{
		_validator = validator;
	}

	public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
	{
		var request = context.GetArgument<TRequest>(0);
		var result = await _validator.ValidateAsync(request, context.HttpContext.RequestAborted);

		if (!result.IsValid)
		{
			return TypedResults.BadRequest(result.ToDictionary());
		}

		return await next(context);
	}
}
