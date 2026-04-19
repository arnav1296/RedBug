import { Router } from 'express';

import { analyzeRepository } from '../controllers/analyze.controller.js';
import { generateReport } from '../services/report.service.js';


const router = Router();

router.post('/', analyzeRepository);

router.post('/report', async (req, res, next) => {
  try {
    res.json(await generateReport(req.body.repoUrl));
  } catch (e) { next(e); }
});

export default router;

