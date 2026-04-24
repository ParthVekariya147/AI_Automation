export function extractApiError(error: unknown, fallback: string) {
  const candidate = error as {
    response?: {
      data?: {
        message?: string;
        errors?: Record<string, string[] | undefined>;
      };
    };
  };

  const data = candidate.response?.data;
  const fieldErrors = data?.errors;

  if (fieldErrors) {
    const firstFieldError = Object.values(fieldErrors)
      .flat()
      .find(Boolean);

    if (firstFieldError) {
      return firstFieldError;
    }
  }

  return data?.message || fallback;
}
