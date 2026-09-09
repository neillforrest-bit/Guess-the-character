import cases from '../data/cases.json';

export function caseForDate(date = new Date()) {
  const utcDay = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
  return cases[((utcDay % cases.length) + cases.length) % cases.length];
}

export function publicCase(caseDefinition) {
  return {
    id: caseDefinition.id,
    title: caseDefinition.title,
    victim: caseDefinition.victim,
    scene: caseDefinition.scene,
    suspects: Object.entries(caseDefinition.notes).map(([name, note]) => ({ name, ...note })),
  };
}
