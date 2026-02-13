namespace MainApi.Src.Lib;

public readonly struct PatchField<T> {
	private readonly T? _value;

	public bool IsPresent { get; }

	public T? Value => IsPresent
		? _value
		: throw new InvalidOperationException(
			"Cannot access Value on an absent "
			+ "PatchField. Check IsPresent first."
		);

	private PatchField(bool isPresent, T? value) {
		IsPresent = isPresent;
		_value = value;
	}

	public static PatchField<T> Absent() =>
		new(false, default);

	public static PatchField<T> Set(T? value) =>
		new(true, value);

	public bool TryGetValue(out T? value) {
		value = _value;
		return IsPresent;
	}

	public TResult Match<TResult>(
		Func<T?, TResult> onPresent,
		Func<TResult> onAbsent
	) {
		ArgumentNullException.ThrowIfNull(onPresent);
		ArgumentNullException.ThrowIfNull(onAbsent);
		return IsPresent
			? onPresent(_value)
			: onAbsent();
	}
}
