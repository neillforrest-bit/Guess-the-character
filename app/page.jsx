'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import noirSuspects from '../data/suspects.json';
import afterPartySuspects from '../data/after-party.json';
import trivia from '../data/trivia.json';

const pick = (items) => items[Math.floor(Math.random() * items.length)];
const CASE_FILES = [
  { id: 'noir', title: 'Noir Detectives', code: 'CASE 040', synopsis: 'The Cluny Mews Affair', deck: noirSuspects, available: true },
  { id: 'sports', title: 'Sports Legends', code: 'CASE 122', synopsis: 'The Lost Championship', deck: noirSuspects, available: false },
  { id: 'heroes', title: 'Superheroes', code: 'CASE 319', synopsis: 'The Vanishing Signal', deck: noirSuspects, available: false },
  { id: 'afterparty', title: 'Midnight After-Party (18+)', code: 'CASE 666', synopsis: 'After Hours', deck: afterPartySuspects, available: true, mature: true },
];
const QUESTION_CATEGORIES = ['Appearance', 'Accessories', 'Vibe'];
const categoryTraits = (deck, category) => {
  const base = {
    Appearance: ['wear glasses', 'have facial hair'],
    Accessories: ['wear a hat or cap'],
    Vibe: [],
  };
  const traitWords = [...new Set(deck.flatMap((suspect) => suspect.trait.split('·').map((trait) => trait.trim())))];
  if (category === 'Vibe') return traitWords.slice(0, 10);
  return base[category];
};
function Portrait({ suspect }) { return <div className="portrait" role="img" aria-label={`${suspect.name} portrait`} style={{ backgroundImage: `url("${suspect.portrait}")` }}><span className="portrait-flare" /></div>; }

export default function Home() {
  const [selectedCaseId, setSelectedCaseId] = useState('noir');
  const [gameStarted, setGameStarted] = useState(false);
  const [gameMode, setGameMode] = useState('cpu');
  const [setupPlayer, setSetupPlayer] = useState(null);
  const [playerSecrets, setPlayerSecrets] = useState({ player1: null, player2: null });
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const activeCase = CASE_FILES.find((caseFile) => caseFile.id === selectedCaseId) ?? CASE_FILES[0];
  const deck = activeCase.deck;
  const cpuSecret = useMemo(() => pick(deck), [deck]);
  const [messages, setMessages] = useState([{ id: 'opening', type: 'system', text: 'Case opened. The machine has selected a suspect.' }]);
  const [selectedSuspect, setSelectedSuspect] = useState(null);
  const [cleared, setCleared] = useState([]);
  const [turn, setTurn] = useState('player');
  const [thinking, setThinking] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [category, setCategory] = useState('Appearance');
  const [evidence, setEvidence] = useState([]);
  const [triviaOpen, setTriviaOpen] = useState(false);
  const [triviaUsed, setTriviaUsed] = useState(false);
  const [activeTrivia, setActiveTrivia] = useState(null);
  const [reward, setReward] = useState(null);
  const [extraTurn, setExtraTurn] = useState(false);
  const [muteCpu, setMuteCpu] = useState(false);
  const [guessOpen, setGuessOpen] = useState(false);
  const [result, setResult] = useState(null);
  const localGame = gameMode === 'local';
  const playerCanAct = !localGame ? turn === 'player' : turn === 'player1' || turn === 'player2';
  const playerLabel = turn === 'player2' || (turn === 'answer' && pendingQuestion?.asker === 'player1') ? 'PLAYER 2' : 'PLAYER 1';
  const append = (message) => setMessages((history) => [...history, { id: crypto.randomUUID(), ...message }]);
  const secretForTurn = () => localGame ? playerSecrets[pendingQuestion?.asker === 'player1' ? 'player2' : 'player1'] : cpuSecret;
  const traitMatches = (suspect, trait) => {
    const words = trait.toLowerCase();
    if (words.includes('glasses')) return suspect.features.glasses;
    if (words.includes('hat') || words.includes('cap')) return suspect.features.hat;
    if (words.includes('facial hair')) return Boolean(suspect.features.facialHair);
    return suspect.trait.toLowerCase().includes(words.replace(/^wear /, ''));
  };
  const sendTraitQuestion = async (trait) => {
    if (!playerCanAct || thinking || result || setupPlayer) return;
    const text = `Does your suspect ${trait}?`;
    setDrawerOpen(true);
    append({ type: 'question', text: localGame ? `${playerLabel}: ${text}` : text });
    if (localGame) { setPendingQuestion({ asker: turn, text, trait }); setTurn('answer'); return; }
    setThinking(true);
    setTimeout(() => {
      const answer = traitMatches(cpuSecret, trait) ? 'Yes.' : 'No.';
      append({ type: 'answer', text: answer });
      setEvidence((items) => [...items, { trait, answer }]);
      setThinking(false);
      if (extraTurn) { setExtraTurn(false); append({ type: 'system', text: 'EXTRA TURN — ask again immediately.' }); return; }
      setTurn('cpu');
      setTimeout(() => {
        if (muteCpu) { setMuteCpu(false); append({ type: 'system', text: 'MUTE EXECUTED — machine forfeits its turn.' }); }
        else append({ type: 'system', text: 'Machine turn complete. Your move.' });
        setTurn('player');
      }, 600);
    }, 1500);
  };
  const answerHuman = (answer) => { append({ type: 'answer', text: `${playerLabel}: ${answer}` }); setEvidence((items) => [...items, { trait: pendingQuestion.trait, answer }]); const next = pendingQuestion.asker === 'player1' ? 'player2' : 'player1'; setPendingQuestion(null); setTurn(next); setDrawerOpen(false); };
  const chooseSecret = (suspect) => { if (setupPlayer === 'player1') { setPlayerSecrets((secrets) => ({ ...secrets, player1: suspect })); setSetupPlayer('player2'); return; } setPlayerSecrets((secrets) => ({ ...secrets, player2: suspect })); setSetupPlayer(null); setTurn('player1'); append({ type: 'system', text: 'Both files are sealed. Player 1 asks first.' }); };
  const startGame = (mode) => { setGameMode(mode); setGameStarted(true); if (mode === 'local') { setTurn('player1'); setSetupPlayer('player1'); setMessages([{ id: 'setup', type: 'system', text: 'Pass the device. Each player chooses a secret file privately.' }]); } };
  const award = () => { const type = pick(['clue', 'extra', 'mute']); if (type === 'clue') { const candidate = pick(deck.filter((suspect) => suspect.name !== cpuSecret.name && !cleared.includes(suspect.name))); if (candidate) setCleared((list) => [...list, candidate.name]); setReward({ type, detail: candidate ? `${candidate.name} has been stamped CLEARED.` : 'Every incorrect file is already cleared.' }); } if (type === 'extra') { setExtraTurn(true); setReward({ type, detail: 'Your next answer will not end your turn.' }); } if (type === 'mute') { setMuteCpu(true); setReward({ type, detail: 'The machine will forfeit its next turn.' }); } };
  const makeGuess = (name) => { const target = localGame ? playerSecrets[turn === 'player1' ? 'player2' : 'player1'] : cpuSecret; const won = name === target?.name; setResult(won ? { won, name, winner: localGame ? playerLabel : null } : { won, name, culprit: target?.name, winner: localGame ? (turn === 'player1' ? 'PLAYER 2' : 'PLAYER 1') : null }); setGuessOpen(false); };

  if (!gameStarted) return <main className="case lobby-screen"><header className="top"><div><p>PRIVATE CASE · 1VCPU</p><h1>The Black Book</h1></div><b>CASE ARCHIVE</b></header><section className="lobby-panel"><small>CONFIDENTIAL GAME CABINET</small><h2>Select your case file</h2><p>Choose an investigation deck. The selected case is passed into the board when the interrogation begins.</p><label className="case-select-label" htmlFor="case-file">SELECT CASE FILE</label><div className="case-select-wrap"><select id="case-file" value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>{CASE_FILES.map((caseFile) => <option key={caseFile.id} value={caseFile.id}>{caseFile.title}{caseFile.available ? '' : ' — coming soon'}</option>)}</select></div><article className="selected-case"><small>{activeCase.code} · {activeCase.available ? 'READY FOR REVIEW' : 'ARCHIVED FOR FUTURE RELEASE'}</small><strong>{activeCase.title}</strong><span>{activeCase.synopsis}</span>{activeCase.mature && <b className="content-warning">18+ EXPLICIT CONTENT WARNING</b>}{!activeCase.available && <em>Preview selector only — this deck currently uses the noir prototype board.</em>}</article><div className="play-options"><button className="play secondary" onClick={() => startGame('local')}>PLAY 1V1</button><button className="play" onClick={() => startGame('cpu')}>PLAY VS CPU</button></div></section></main>;

  return <main className="case"><header className="top"><div><p>{activeCase.title.toUpperCase()} · {localGame ? '1V1' : '1VCPU'}</p><h1>The Black Book</h1></div><b>{result ? 'CASE CLOSED' : setupPlayer ? `${setupPlayer === 'player1' ? 'PLAYER 1' : 'PLAYER 2'} SELECTING` : localGame ? (pendingQuestion ? `${playerLabel} ANSWERS` : `${playerLabel} TURN`) : thinking ? 'MACHINE THINKING' : turn === 'player' ? 'YOUR TURN' : 'MACHINE TURN'}</b></header><section className="brief"><div><small>{activeCase.code} · {activeCase.title.toUpperCase()}</small><strong>{activeCase.synopsis.toUpperCase()}</strong></div><div className="case-progress">{cleared.length}<small>/{deck.length - 1}</small></div></section><section className="board">{deck.map((suspect, index) => { const isCleared = cleared.includes(suspect.name); const isSelected = selectedSuspect === suspect.name; return <motion.article key={suspect.name} className={`card ${isCleared ? 'cleared' : ''} ${isSelected ? 'selected' : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .015 }}><button aria-pressed={isSelected} disabled={!!result || !!setupPlayer} onClick={() => setSelectedSuspect(isSelected ? null : suspect.name)}><Portrait suspect={suspect}/><b>{suspect.name}</b></button>{isCleared && <i className="stamp">CLEARED</i>}</motion.article>; })}</section><section className="evidence-strip">{evidence.length ? evidence.slice(-3).map((item, index) => <span key={`${item.trait}-${index}`} className={item.answer === 'Yes.' || item.answer === 'YES' ? 'yes' : 'no'}>{item.answer} · {item.trait}</span>) : <span>NO EVIDENCE LOGGED — OPEN INTERROGATION</span>}</section><div className="actions"><button disabled={!selectedSuspect || cleared.includes(selectedSuspect) || !!result || !!setupPlayer} onClick={() => { setCleared((list) => [...list, selectedSuspect]); setSelectedSuspect(null); }} className="clear">{selectedSuspect ? 'CLEAR FILE' : 'SELECT FILE'}</button><button disabled={triviaUsed || !playerCanAct || !!result || !!setupPlayer} onClick={() => { setTriviaUsed(true); setActiveTrivia(pick(trivia)); setTriviaOpen(true); }} className="intercept">WIRE</button><button disabled={!playerCanAct || !!result || !!setupPlayer} onClick={() => setGuessOpen(true)} className="guess">GUESS</button></div><button className="interrogate" onClick={() => setDrawerOpen(true)}>INTERROGATE <span>↑</span></button><AnimatePresence>{drawerOpen && <motion.section className="drawer" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 26, stiffness: 260 }}><div className="drawer-grab" onClick={() => setDrawerOpen(false)} /><header><div><small>CHESTER · SECURE LINE</small><strong>INTERROGATION</strong></div><button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close interrogation">×</button></header><div className="thread">{messages.map((message) => <p key={message.id} className={message.type}>{message.type === 'question' ? `Q · ${message.text}` : message.type === 'answer' ? `A · ${message.text}` : message.text}</p>)}</div>{localGame && pendingQuestion ? <div className="answer-prompt"><span>{playerLabel}: answer privately.</span><button onClick={() => answerHuman('YES')}>YES</button><button onClick={() => answerHuman('NO')}>NO</button></div> : <div className="builder"><div className="builder-row">{QUESTION_CATEGORIES.map((name) => <button key={name} className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{name}</button>)}</div><div className="builder-row traits">{categoryTraits(deck, category).map((trait) => <button key={trait} disabled={!playerCanAct || thinking || !!result || !!setupPlayer} onClick={() => sendTraitQuestion(trait)}>{trait}</button>)}</div></div>}</motion.section>}</AnimatePresence><AnimatePresence>{setupPlayer && <motion.dialog open className="modal secret-select" initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }}><small>PRIVATE CASE FILE</small><h2>{setupPlayer === 'player1' ? 'Player 1, choose your suspect' : 'Player 2, take the device and choose your suspect'}</h2><div className="secret-grid">{deck.map((suspect) => <button key={suspect.name} onClick={() => chooseSecret(suspect)}><Portrait suspect={suspect}/><span>{suspect.name}</span></button>)}</div></motion.dialog>}</AnimatePresence><AnimatePresence>{triviaOpen && <motion.dialog open className="modal" initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }}><small>WIRE INTERCEPT · FIRST CORRECT ANSWER</small><h2>{activeTrivia.question}</h2>{activeTrivia.options.map((option) => <button key={option} onClick={() => { setTriviaOpen(false); option === activeTrivia.answer ? award() : append({ type: 'system', text: 'WIRE INTERCEPT LOST.' }); }}>{option}</button>)}</motion.dialog>}</AnimatePresence><AnimatePresence>{reward && <motion.dialog open className="modal reward" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}><small>WIRE INTERCEPT REWARD</small><h2>{reward.type.toUpperCase()}</h2><p>{reward.detail}</p><button onClick={() => setReward(null)}>CONTINUE CASE</button></motion.dialog>}</AnimatePresence><AnimatePresence>{guessOpen && <motion.dialog open className="modal guess-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><small>FINAL ACCUSATION</small><h2>Who is the hidden suspect?</h2>{deck.filter((suspect) => !cleared.includes(suspect.name)).map((suspect) => <button key={suspect.name} onClick={() => makeGuess(suspect.name)}>{suspect.name}</button>)}<button className="cancel" onClick={() => setGuessOpen(false)}>CANCEL</button></motion.dialog>}</AnimatePresence><AnimatePresence>{result && <motion.dialog open className="modal result" initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }}><small>CASE FILE SEALED</small><h2>{result.won ? 'CULPRIT IDENTIFIED' : 'THE CASE GOES COLD'}</h2><p>{result.won ? `${result.winner ? `${result.winner} wins. ` : ''}${result.name} was the culprit.` : `${result.winner ? `${result.winner} wins. ` : ''}${result.name} was innocent. The culprit was ${result.culprit}.`}</p><button onClick={() => location.reload()}>OPEN NEW CASE</button></motion.dialog>}</AnimatePresence></main>;
}
