export function deduplicateDependencies(dependencies) {
  const seen = new Map();

  for (const dependency of dependencies) {
    const key = `${dependency.ecosystem}:${dependency.name}:${dependency.version}`;

    if (!seen.has(key)) {
      seen.set(key, dependency);
    }
  }

  return [...seen.values()];
}
