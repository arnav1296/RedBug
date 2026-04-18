import { detectEcosystem } from '../services/ecosystems/index.js';
import { fetchRootFilenames } from '../services/github.service.js';

export async function analyzeRepository(req, res, next) {
  try {
    const { repoUrl } = req.body;
    const files = await fetchRootFilenames(repoUrl);
    const ecosystem = detectEcosystem(files);

    res.status(200).json({ ecosystem, files });
  } catch (error) {
    next(error);
  }
}
