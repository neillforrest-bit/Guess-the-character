import { caseForDate, publicCase } from '../../lib/daily-case';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
  return res.status(200).json(publicCase(caseForDate(new Date())));
}
