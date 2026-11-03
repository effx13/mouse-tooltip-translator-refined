export function matchOrThrow(text: string, pattern: RegExp, group = 1): string {
  const value = pattern.exec(text)?.[group];
  // a scraped page changed shape; defineEngine turns the throw into a failed translation
  if (value === undefined) throw new Error(`no match for ${pattern}`);
  return value;
}

export function required<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`${what} is missing`);
  return value;
}
