export function detectEcosystem(files = []) {
  if (files.includes('package.json')) {
    return 'npm';
  }

  if (files.includes('requirements.txt')) {
    return 'pypi';
  }

  if (files.includes('pom.xml')) {
    return 'maven';
  }

  throw new Error('Unsupported ecosystem');
}
