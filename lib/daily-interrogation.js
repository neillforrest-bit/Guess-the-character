import cases from '../data/cases.json';

export function interrogate(caseId, suspectName, question) {
  const caseFile = cases.find(item => item.id === caseId);
  if (!caseFile || !caseFile.notes[suspectName]) throw new Error('Unknown case or suspect.');
  const note = caseFile.notes[suspectName];
  const text = String(question || '').trim();
  if (!text || text.length > 90) throw new Error('Ask a question of up to 90 characters.');
  return {
    suspectName,
    question: text,
    answer: `"${note.alibi}" That is all I can say about the night. As for ${caseFile.victim.name}, ${note.relationship.charAt(0).toLowerCase()}${note.relationship.slice(1)}`,
  };
}
