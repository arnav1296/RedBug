import { fetchPackageJsonFromGitHub } from './github.service.js';
import { fetchNpmPackageMetadata } from './npm.service.js';
import { checkPackageVulnerabilities } from './osv.service.js';

export async function analyzeDependencies(payload = {}) {
  console.log('Stub: orchestrate dependency analysis', payload);

  const repository = await fetchPackageJsonFromGitHub(payload);
  const npmMetadata = await fetchNpmPackageMetadata('placeholder-package');
  const osvResult = await checkPackageVulnerabilities({
    packageName: 'placeholder-package',
    version: '0.0.0-placeholder',
  });

  return {
    repository: {
      owner: repository.owner,
      repo: repository.repo,
      branch: repository.branch,
    },
    summary: {
      status: 'placeholder',
      dependenciesScanned: 0,
      vulnerableDependencies: 0,
      riskScore: 0,
    },
    placeholders: {
      npmMetadata,
      osvResult,
    },
  };
}

