export class FeasibilityTimeout extends Error {
  override readonly name = "FeasibilityTimeout";
  constructor() {
    super("feasibility-timeout");
  }
}

export async function bounded<T>(operation: Promise<T>, milliseconds = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FeasibilityTimeout()), milliseconds);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
