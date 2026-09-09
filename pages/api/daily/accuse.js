import { accuse } from '../../../lib/daily-accusation';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  try {
    const { caseId, suspectId } = req.body || {};
    return res.status(200).json(accuse(caseId, suspectId));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
