import cases from '../data/cases.json';

function firstPersonAlibi(text) {
  return text
    .replace(/^Said she was /, 'I was ')
    .replace(/^Claimed he was /, 'I was ')
    .replace(/^Was /, 'I was ')
    .replace(/^His /, 'My ')
    .replace(/\bher\b/gi, 'my ')
    .replace(/\btheir\b/gi, 'my ');
}

function firstPersonRelationship(text) {
  return text
    .replace(/\bfor her\b/gi, 'for me')
    .replace(/\bfor him\b/gi, 'for me')
    .replace(/\bher\b/gi, 'me')
    .replace(/\bhim\b/gi, 'me');
}

export function interrogate(caseId, suspectName, question) {
  const caseFile = cases.find(item => item.id === caseId);
  if (!caseFile || !caseFile.notes[suspectName]) throw new Error('Unknown case or suspect.');
  const note = caseFile.notes[suspectName];
  const text = String(question || '').trim();
  if (!text || text.length > 90) throw new Error('Ask a question of up to 90 characters.');
  return {
    suspectName,
    question: text,
    answer: `I stand by my alibi: "${firstPersonAlibi(note.alibi)}" My connection to ${caseFile.victim.name} is on the record: ${firstPersonRelationship(note.relationship)}`,
  };
}
