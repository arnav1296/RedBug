import axios from 'axios';

export const registryName = 'npm';

export function parseDependencies(fileContent) {
  const pkg = JSON.parse(fileContent);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(deps).map(([name, version]) => ({ name, version }));
}

export async function fetchMetadata(packageName) {
  const response = await axios.get(`https://registry.npmjs.org/${packageName}/latest`);
  const deps = Object.entries(response.data.dependencies || {}).map(([name, version]) => ({
    name,
    version: response.data.version  // ← use ACTUAL resolved version, not "latest"
  }));
  return { 
    name: packageName, 
    latestVersion: response.data.version, 
    dependencies: deps 
  };
}