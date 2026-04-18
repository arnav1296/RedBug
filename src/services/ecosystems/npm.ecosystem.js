import axios from 'axios';

export const registryName = 'npm';

export function parseDependencies(fileContent) {
  const pkg = JSON.parse(fileContent);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(deps).map(([name, version]) => ({ name, version }));
}

export async function fetchMetadata(packageName) {
  const response = await axios.get(`https://registry.npmjs.org/${packageName}/latest`);
  const deps = Object.keys(response.data.dependencies || {}).map(name => ({ name, version: 'latest' }));
  return { name: packageName, latestVersion: response.data.version, dependencies: deps };
}