import axios from 'axios';

export const registryName = 'pypi';

export function parseDependencies(fileContent) {
  return fileContent.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const [name, version] = line.split(/[=><~!]+/);
      return { name: name.trim(), version: version?.trim() || 'latest' };
    });
}

export async function fetchMetadata(packageName) {
  const response = await axios.get(`https://pypi.org/pypi/${packageName}/json`);
  return { name: packageName, latestVersion: response.data.info.version, dependencies: [] };
}