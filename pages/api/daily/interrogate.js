import { interrogate } from '../../../lib/daily-interrogation';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  try {
    const { caseId, suspectName, question } = req.body || {};
    return res.status(200).json(interrogate(caseId, suspectName, question));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
