export async function checkPackageVulnerabilities({ packageName, version, ecosystem = 'npm' } = {}) {
  console.log('Stub: check vulnerabilities via OSV', {
    packageName,
    version,
    ecosystem,
  });

  return {
    source: 'osv',
    packageName: packageName || 'placeholder-package',
    version: version || '0.0.0-placeholder',
    ecosystem,
    vulnerabilities: [],
  };
}

