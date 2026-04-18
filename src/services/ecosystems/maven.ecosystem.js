import axios from 'axios';

export const registryName = 'maven';

export function parseDependencies(fileContent) {
  const matches = [...fileContent.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)];
  return matches.map(match => {
    const artifactId = match[1].match(/<artifactId>(.*?)<\/artifactId>/)?.[1];
    const version = match[1].match(/<version>(.*?)<\/version>/)?.[1];
    return { name: artifactId, version: version || 'latest' };
  });
}

export async function fetchMetadata(packageName) {
  const response = await axios.get(
    `https://search.maven.org/solrsearch/select?q=a:${packageName}&rows=1&wt=json`
  );
  const latest = response.data.response.docs[0]?.latestVersion || 'unknown';
  return { name: packageName, latestVersion: latest, dependencies: [] };
}