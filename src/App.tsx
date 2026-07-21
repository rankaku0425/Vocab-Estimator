import { useState, useEffect } from 'react';
import { WelcomeView } from './components/WelcomeView';
import { TestView } from './components/TestView';
import { StepResultView } from './components/StepResultView';
import { ResultView } from './components/ResultView';
import { AdminView } from './components/AdminView';
import { ViewState, Word, VocabResult } from './types';
import { estimateWithCI, estimateTheta, selectNextWords } from './vocabEngine';
import { fetchWords, logResponses, submitScore } from './supabase';

const MAX_STEPS = 5;
const SESSION_KEY = 'vocab_test_session_v1';

// ── セッション永続化 ──────────────────────────────────────────────────────────
type SavedSession = {
  step: number;
  allShownWords: Word[];
  selectedIds: string[];
  result: VocabResult;
};

function saveSession(s: SavedSession) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* no-op */ }
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch { return null; }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  // 管理画面チェック
  if (window.location.hash === '#admin') {
    return <AdminView />;
  }

  const [view, setView]                   = useState<ViewState>('start');
  const [step, setStep]                   = useState(1);
  const [allShownWords, setAllShownWords] = useState<Word[]>([]);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [currentStepWords, setCurrentStepWords] = useState<Word[]>([]);
  const [currentResult, setCurrentResult] = useState<VocabResult | null>(null);
  const [wordList, setWordList]           = useState<Word[]>([]);
  const [dummyWords, setDummyWords]       = useState<Word[]>([]);
  const [loadError, setLoadError]         = useState<string | null>(null);
  const [savedSession, setSavedSession]   = useState<SavedSession | null>(null);

  useEffect(() => {
    setSavedSession(loadSession());
    fetchWords()
      .then(({ wordList, dummyWords }) => {
        setWordList(wordList);
        setDummyWords(dummyWords);
      })
      .catch(() => setLoadError('単語データの読み込みに失敗しました。ページを再読み込みしてください。'));
  }, []);

  const handleStart = () => {
    clearSession();
    setSavedSession(null);
    const nextWords = selectNextWords(wordList, dummyWords, [], new Set());
    setAllShownWords(nextWords);
    setCurrentStepWords(nextWords);
    setSelectedIds(new Set());
    setStep(1);
    setCurrentResult(null);
    setView('test');
  };

  const handleResume = () => {
    if (!savedSession) return;
    setStep(savedSession.step);
    setAllShownWords(savedSession.allShownWords);
    setSelectedIds(new Set(savedSession.selectedIds));
    setCurrentResult(savedSession.result);
    setCurrentStepWords([]);
    setSavedSession(null);
    setView('stepResult');
  };

  const handleCompleteStep = (stepSelectedIds: Set<string>) => {
    const newSelectedIds = new Set(selectedIds);
    stepSelectedIds.forEach(id => newSelectedIds.add(id));
    setSelectedIds(newSelectedIds);

    const shownReals = allShownWords.filter(w => !w.isDummy);
    const theta = estimateTheta(shownReals, newSelectedIds);
    logResponses(currentStepWords, stepSelectedIds, theta);

    const result = estimateWithCI(allShownWords, newSelectedIds);
    setCurrentResult(result);

    saveSession({
      step,
      allShownWords,
      selectedIds: [...newSelectedIds],
      result,
    });

    setView('stepResult');
  };

  const handleNextStep = () => {
    if (step >= MAX_STEPS) {
      clearSession();
      if (currentResult) submitScore(currentResult);
      setView('finalResult');
    } else {
      const nextWords = selectNextWords(wordList, dummyWords, allShownWords, selectedIds);
      setAllShownWords(prev => [...prev, ...nextWords]);
      setCurrentStepWords(nextWords);
      setStep(step + 1);
      setView('test');
    }
  };

  const handleRetry = () => {
    clearSession();
    setSavedSession(null);
    setView('start');
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fcfcfc]">
        <p className="text-stone-500">{loadError}</p>
      </div>
    );
  }

  if (wordList.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fcfcfc]">
        <p className="text-stone-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-stone-900 font-sans selection:bg-stone-200">
      {view === 'start' && (
        <WelcomeView
          onStart={handleStart}
          hasSavedSession={savedSession !== null}
          onResume={handleResume}
        />
      )}
      {view === 'test' && (
        <TestView
          words={currentStepWords}
          step={step}
          maxSteps={MAX_STEPS}
          onComplete={handleCompleteStep}
        />
      )}
      {view === 'stepResult' && currentResult && (
        <StepResultView
          step={step}
          maxSteps={MAX_STEPS}
          result={currentResult}
          allShownWords={allShownWords}
          selectedIds={selectedIds}
          onNext={handleNextStep}
        />
      )}
      {view === 'finalResult' && currentResult && (
        <ResultView
          result={currentResult}
          allShownWords={allShownWords}
          selectedIds={selectedIds}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}
