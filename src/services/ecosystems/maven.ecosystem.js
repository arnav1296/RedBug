import axios from 'axios';

export const registryName = 'maven';

export function parseDependencies(fileContent) {
  const matches = [...fileContent.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)];
  return matches.map(match => {
    const groupId = match[1].match(/<groupId>(.*?)<\/groupId>/)?.[1];
    const artifactId = match[1].match(/<artifactId>(.*?)<\/artifactId>/)?.[1];
    const version = match[1].match(/<version>(.*?)<\/version>/)?.[1];
    const name = groupId && artifactId ? `${groupId}:${artifactId}` : artifactId;
    return { name, version: version || 'latest' };
  }).filter(dep => dep.name);
}

export async function fetchMetadata(packageName) {
  const artifactId = packageName.includes(':') ? packageName.split(':')[1] : packageName;
  const response = await axios.get(
    `https://search.maven.org/solrsearch/select?q=a:${artifactId}&rows=1&wt=json`
  );
  const latest = response.data.response.docs[0]?.latestVersion || 'unknown';
  return { name: packageName, latestVersion: latest, dependencies: [] };
}
