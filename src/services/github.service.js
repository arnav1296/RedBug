import axios from 'axios';

export function parseGitHubRepoUrl(repoUrl) {
  if (!repoUrl) {
    throw new Error('GitHub repo URL is required');
  }

  const { hostname, pathname } = new URL(repoUrl);

  if (hostname !== 'github.com') {
    throw new Error('Invalid GitHub repo URL');
  }

  const [owner, repo] = pathname.replace(/^\/|\/$/g, '').split('/');

  if (!owner || !repo) {
    throw new Error('Invalid GitHub repo URL');
  }

  return {
    owner,
    repo: repo.replace(/\.git$/, ''),
  };
}

export async function fetchRootFilenames(repoUrl) {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);

  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/contents/`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    },
  );

  return response.data.map((item) => item.name);
}


export async function fetchFileContent(repoUrl, filePath) {
  const { owner, repo } = parseGitHubRepoUrl(repoUrl);

  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );

  return Buffer.from(response.data.content, 'base64').toString('utf-8');
}
