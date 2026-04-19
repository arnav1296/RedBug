import { detectEcosystem } from '../services/ecosystems/index.js';
import { fetchRootFilenames, fetchFileContent } from '../services/github.service.js';
import * as npm from '../services/ecosystems/npm.ecosystem.js';
import * as pypi from '../services/ecosystems/pypi.ecosystem.js';
import * as maven from '../services/ecosystems/maven.ecosystem.js';
import { scanVulnerabilities } from '../services/osv.service.js';

const ecosystems = { npm, pypi, maven };
const manifestFile = {
  npm: 'package.json',
  pypi: 'requirements.txt',
  maven: 'pom.xml'
};

function packageKey(node) {
  return `${node.ecosystem}:${node.name}:${node.version}`;
}

async function buildDepTree(repoUrl, directDeps, handler, ecosystem) {
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
      name: dep.name,
      version: dep.version,
      ecosystem,
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
          name: transitive.name,
          version: transitive.version,
          ecosystem,
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

    const { nodes, edges } = await buildDepTree(repoUrl, directDeps, handler, ecosystem);

    const packages = nodes.filter(n => n.type === 'package');
    const vulnerabilitiesByDependency = await scanVulnerabilities(packages, { repoUrl });
    const vulnerabilitySummary = {
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0,
    };

    for (const node of packages) {
      const result = vulnerabilitiesByDependency.get(packageKey(node)) || {
        risk: 'UNKNOWN',
        vulnerabilities: [],
        scannedVersion: null,
      };

      node.risk = result.risk;
      node.vulnerabilities = result.vulnerabilities;
      node.scannedVersion = result.scannedVersion;

      if (result.risk === 'HIGH') vulnerabilitySummary.high += 1;
      if (result.risk === 'MEDIUM') vulnerabilitySummary.medium += 1;
      if (result.risk === 'LOW') vulnerabilitySummary.low += 1;
      if (result.risk === 'UNKNOWN') vulnerabilitySummary.unknown += 1;
    }

    const vulnerable = packages.filter(n => ['HIGH', 'MEDIUM', 'LOW'].includes(n.risk)).length;

    res.status(200).json({
      ecosystem,
      summary: {
        total: packages.length,
        direct: packages.filter(n => n.depth === 1).length,
        transitive: packages.filter(n => n.depth === 2).length,
        vulnerable,
        clean: packages.filter(n => n.risk === 'NONE').length,
        ...vulnerabilitySummary
      },
      graph: { nodes, edges }
    });

  } catch (error) {
    next(error);
  }
}
