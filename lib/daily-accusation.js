import cases from '../data/cases.json';

function findCase(caseId, suspectId) {
  const caseFile = cases.find(item => item.id === caseId);
  if (!caseFile || !caseFile.notes[suspectId]) throw new Error('Unknown case or suspect.');
  return caseFile;
}

export function accuse(caseId, suspectId) {
  const caseFile = findCase(caseId, suspectId);
  return caseFile.culprit === suspectId ? { correct: true } : { correct: false, culprit: caseFile.culprit };
}

export function verdict(caseId, suspectId) {
  const caseFile = findCase(caseId, suspectId);
  const correct = caseFile.culprit === suspectId;
  return { correct, culprit: caseFile.culprit, confession: caseFile.confession };
}
