'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import suspects from '../data/suspects.json';
import trivia from '../data/trivia.json';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = (items) => items[Math.floor(Math.random() * items.length)];

function Portrait({ suspect, priority = false }) {
  return <div className="portrait" role="img" aria-label={`${suspect.name} portrait`} style={{ backgroundImage: `url("${suspect.portrait}")` }}>
    <span className="portrait-flare" />
    {priority && <span className="portrait-id">CONFIDENTIAL</span>}
  </div>;
}

export default function Home() {
  const cpuSecret = useMemo(() => pick(suspects), []);
  const [messages, setMessages] = useState([{ type: 'system', text: 'Case opened. The machine has selected a suspect.' }]);
  const [question, setQuestion] = useState('');
  const [cleared, setCleared] = useState([]);
  const [turn, setTurn] = useState('player');
  const [thinking, setThinking] = useState(false);
  const [triviaOpen, setTriviaOpen] = useState(false);
  const [triviaUsed, setTriviaUsed] = useState(false);
  const [activeTrivia, setActiveTrivia] = useState(null);
  const [reward, setReward] = useState(null);
  const [extraTurn, setExtraTurn] = useState(false);
  const [muteCpu, setMuteCpu] = useState(false);
  const [guessOpen, setGuessOpen] = useState(false);
  const [result, setResult] = useState(null);
  const timers = useRef([]);
  const append = (message) => setMessages((history) => [...history, { id: crypto.randomUUID(), ...message }]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const answerFor = (text) => {
    const words = text.toLowerCase();
    if (words.includes('glass')) return cpuSecret.features.glasses ? 'Yes.' : 'No.';
    if (words.includes('hat') || words.includes('cap')) return cpuSecret.features.hat ? 'Yes.' : 'No.';
    if (words.includes('beard') || words.includes('mustache') || words.includes('moustache')) return cpuSecret.features.facialHair ? 'Yes.' : 'No.';
    if (words.includes('name')) return 'The file is sealed. Ask about a visible characteristic.';
    return pick(['Yes.', 'No.', 'The evidence is inconclusive. Ask a more specific question.']);
  };

  const finishCpuTurn = () => {
    if (muteCpu) {
      setMuteCpu(false);
      setTurn('player');
      append({ type: 'system', text: 'MUTE EXECUTED — the machine forfeits its turn.' });
      return;
    }
    setTurn('player');
    append({ type: 'system', text: 'The machine has considered the evidence. Your turn.' });
  };

  const ask = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || turn !== 'player' || thinking || result) return;
    setQuestion('');
    setThinking(true);
    append({ type: 'question', text });
    await wait(1500);
    append({ type: 'answer', text: answerFor(text) });
    setThinking(false);
    if (extraTurn) {
      setExtraTurn(false);
      append({ type: 'system', text: 'EXTRA TURN EXECUTED — ask again immediately.' });
      return;
    }
    setTurn('cpu');
    const timer = setTimeout(finishCpuTurn, 650);
    timers.current.push(timer);
  };

  const startTrivia = () => {
    setTriviaUsed(true);
    setTriviaOpen(true);
    setActiveTrivia(pick(trivia));
  };

  const award = () => {
    const type = pick(['clue', 'extra', 'mute']);
    if (type === 'clue') {
      const candidates = suspects.filter((suspect) => suspect.name !== cpuSecret.name && !cleared.includes(suspect.name));
      const suspect = pick(candidates);
      if (suspect) setCleared((list) => [...list, suspect.name]);
      setReward({ type, detail: suspect ? `${suspect.name} has been stamped CLEARED.` : 'Every incorrect file is already cleared.' });
    }
    if (type === 'extra') {
      setExtraTurn(true);
      setReward({ type, detail: 'Your next answer will not end your turn.' });
    }
    if (type === 'mute') {
      setMuteCpu(true);
      setReward({ type, detail: 'The machine will forfeit its next turn.' });
    }
    append({ type: 'system', text: 'WIRE INTERCEPT RESOLVED — reward issued.' });
  };

  const answerTrivia = (answer) => {
    if (answer !== activeTrivia.answer) {
      setTriviaOpen(false);
      append({ type: 'system', text: 'WIRE INTERCEPT LOST — no reward this time.' });
      return;
    }
    setTriviaOpen(false);
    award();
  };

  const makeGuess = (name) => {
    const won = name === cpuSecret.name;
    setResult(won ? { won, name } : { won, name, culprit: cpuSecret.name });
    setGuessOpen(false);
    append({ type: 'system', text: won ? 'CASE CLOSED — culprit identified.' : 'CASE CLOSED — the machine reveals the true suspect.' });
  };

  return <main className="case">
    <header className="top"><div><p>PRIVATE CASE · 1VCPU</p><h1>The Black Book</h1></div><b>{result ? 'CASE CLOSED' : thinking ? 'MACHINE THINKING' : turn === 'player' ? 'YOUR TURN' : 'MACHINE TURN'}</b></header>
    <section className="brief"><div><small>CASE 040</small><strong>THE CLUNY MEWS AFFAIR</strong><span>Eliminate the innocent. Interrogate the machine. Name the culprit.</span></div><div className="case-progress">{cleared.length}<small>/24 CLEARED</small></div></section>
    <section className="board">{suspects.map((suspect, index) => { const isCleared = cleared.includes(suspect.name); return <motion.article key={suspect.name} className={`card ${isCleared ? 'cleared' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .025 }}><button disabled={!!result} onClick={() => setCleared((list) => isCleared ? list.filter((name) => name !== suspect.name) : [...list, suspect.name])}><Portrait suspect={suspect}/><span className="case-label">CASE FILE {String(index + 1).padStart(2, '0')}</span><b>{suspect.name}</b><small>{suspect.trait}</small></button>{isCleared && <i className="stamp">CLEARED</i>}</motion.article>})}</section>
    <section className={`chat ${thinking ? 'alert' : ''}`}><div className="chat-head">INTERROGATION LOG <span>{thinking ? 'DECODING RESPONSE…' : 'ENCRYPTED LINE OPEN'}</span></div><div className="thread">{messages.map((message, index) => <p key={message.id || index} className={message.type}>{message.type === 'question' ? `YOU · ${message.text}` : message.type === 'answer' ? `CPU · ${message.text}` : message.text}</p>)}</div><form onSubmit={ask}><input disabled={turn !== 'player' || thinking || !!result} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a yes / no question"/><button disabled={turn !== 'player' || thinking || !!result}>ASK</button></form></section>
    <div className="actions"><button disabled={triviaUsed || turn !== 'player' || !!result} onClick={startTrivia} className="intercept">{triviaUsed ? 'WIRE INTERCEPT USED' : 'WIRE INTERCEPT · 1×'}</button><button disabled={turn !== 'player' || !!result} onClick={() => setGuessOpen(true)} className="guess">MAKE A GUESS</button></div>
    <AnimatePresence>{triviaOpen && <motion.dialog open className="modal" initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }}><small>WIRE INTERCEPT · FIRST CORRECT ANSWER</small><h2>{activeTrivia.question}</h2>{activeTrivia.options.map((option) => <button key={option} onClick={() => answerTrivia(option)}>{option}</button>)}</motion.dialog>}</AnimatePresence>
    <AnimatePresence>{reward && <motion.dialog open className="modal reward" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}><small>WIRE INTERCEPT REWARD</small><h2>{reward.type === 'clue' ? 'FREE CLUE' : reward.type === 'extra' ? 'EXTRA TURN' : 'MUTE'}</h2><p>{reward.detail}</p><button onClick={() => setReward(null)}>CONTINUE CASE</button></motion.dialog>}</AnimatePresence>
    <AnimatePresence>{guessOpen && <motion.dialog open className="modal guess-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><small>FINAL ACCUSATION</small><h2>Who is the hidden suspect?</h2>{suspects.filter((suspect) => !cleared.includes(suspect.name)).map((suspect) => <button key={suspect.name} onClick={() => makeGuess(suspect.name)}>{suspect.name}</button>)}<button className="cancel" onClick={() => setGuessOpen(false)}>CANCEL</button></motion.dialog>}</AnimatePresence>
    <AnimatePresence>{result && <motion.dialog open className="modal result" initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }}><small>CASE FILE SEALED</small><h2>{result.won ? 'CULPRIT IDENTIFIED' : 'THE MACHINE PREVAILS'}</h2><p>{result.won ? `${result.name} was the culprit. The Black Book closes another case.` : `${result.name} was innocent. The culprit was ${result.culprit}.`}</p><button onClick={() => location.reload()}>OPEN NEW CASE</button></motion.dialog>}</AnimatePresence>
  </main>;
}
