export async function fetchNpmPackageMetadata(packageName) {
  console.log('Stub: fetch npm package metadata', { packageName });

  return {
    source: 'npm',
    packageName: packageName || 'placeholder-package',
    latestVersion: '0.0.0-placeholder',
    metadata: {},
  };
}

