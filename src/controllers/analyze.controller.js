import { detectEcosystem } from '../services/ecosystems/index.js';
import { fetchRootFilenames, fetchFileContent } from '../services/github.service.js';
import * as npm from '../services/ecosystems/npm.ecosystem.js';
import * as pypi from '../services/ecosystems/pypi.ecosystem.js';
import * as maven from '../services/ecosystems/maven.ecosystem.js';

const ecosystems = { npm, pypi, maven };
const manifestFile = {
  npm: 'package.json',
  pypi: 'requirements.txt',
  maven: 'pom.xml'
};

async function buildDepTree(repoUrl, directDeps, handler) {
  const visited = new Set();
  const nodes = [];
  const edges = [];

  // extract repo name for the root node
  const repoLabel = repoUrl.replace('https://github.com/', '');

  // root node
  nodes.push({ id: 'repo', label: repoLabel, type: 'repo', risk: 'NONE' });

  // depth 1 — direct deps
  for (const dep of directDeps) {
    if (visited.has(dep.name)) continue;
    visited.add(dep.name);

    nodes.push({
      id: dep.name,
      label: `${dep.name}@${dep.version}`,
      type: 'package',
      depth: 1,
      risk: 'UNKNOWN'
    });

    edges.push({ from: 'repo', to: dep.name, label: 'direct' });
  }

  // depth 2 — transitive deps
  for (const dep of directDeps) {
    try {
      const metadata = await handler.fetchMetadata(dep.name);
      for (const transitive of metadata.dependencies) {
        if (visited.has(transitive.name)) continue;
        visited.add(transitive.name);

        nodes.push({
          id: transitive.name,
          label: `${transitive.name}@${transitive.version}`,
          type: 'package',
          depth: 2,
          risk: 'UNKNOWN'
        });

        edges.push({ from: dep.name, to: transitive.name, label: 'transitive' });
      }
    } catch (e) {
      console.warn(`Could not fetch metadata for ${dep.name}`);
    }
  }

  return { nodes, edges };
}

export async function analyzeRepository(req, res, next) {
  try {
    const { repoUrl } = req.body;

    const files = await fetchRootFilenames(repoUrl);
    const ecosystem = detectEcosystem(files);
    const handler = ecosystems[ecosystem];

    const content = await fetchFileContent(repoUrl, manifestFile[ecosystem]);
    const directDeps = handler.parseDependencies(content);

    const { nodes, edges } = await buildDepTree(repoUrl, directDeps, handler);

    const packages = nodes.filter(n => n.type === 'package');

    res.status(200).json({
      ecosystem,
      summary: {
        total: packages.length,
        direct: packages.filter(n => n.depth === 1).length,
        transitive: packages.filter(n => n.depth === 2).length,
        vulnerable: 0,       // filled in after OSV step
        clean: packages.length
      },
      graph: { nodes, edges }
    });

  } catch (error) {
    next(error);
  }
}