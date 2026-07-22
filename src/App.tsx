import { useState, useEffect } from 'react';
import { WelcomeView } from './components/WelcomeView';
import { SurveyView } from './components/SurveyView';
import { TestView } from './components/TestView';
import { StepResultView } from './components/StepResultView';
import { ResultView } from './components/ResultView';
import { AdminView } from './components/AdminView';
import { ViewState, Word, VocabResult, TestHistoryEntry, Demographics } from './types';
import { estimateWithCI, estimateTheta, selectNextWords } from './vocabEngine';
import { fetchWords, logResponses, submitScore } from './supabase';

const MAX_STEPS   = 5;
const SESSION_KEY = 'vocab_test_session_v1';
const HISTORY_KEY = 'vocab_test_history_v1';
const DEMO_KEY    = 'vocab_demographics_v1';

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

export function loadHistory(): TestHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as TestHistoryEntry[]) : [];
  } catch { return []; }
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
  const [historyResult, setHistoryResult]           = useState<VocabResult | null>(null);
  const [historyShownWords, setHistoryShownWords]   = useState<Word[]>([]);
  const [historySelectedIds, setHistorySelectedIds] = useState<Set<string>>(new Set());
  const [wordList, setWordList]           = useState<Word[]>([]);
  const [dummyWords, setDummyWords]       = useState<Word[]>([]);
  const [loadError, setLoadError]         = useState<string | null>(null);
  const [savedSession, setSavedSession]   = useState<SavedSession | null>(null);
  const [demographics, setDemographics]   = useState<Demographics | null>(null);

  useEffect(() => {
    setSavedSession(loadSession());
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) setDemographics(JSON.parse(raw) as Demographics);
    } catch { /* no-op */ }
    fetchWords()
      .then(({ wordList, dummyWords }) => {
        setWordList(wordList);
        setDummyWords(dummyWords);
      })
      .catch(() => setLoadError('単語データの読み込みに失敗しました。ページを再読み込みしてください。'));
  }, []);

  const handleStart = () => {
    setView('survey');
  };

  const handleSurveyComplete = (demo: Demographics) => {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(demo)); } catch { /* no-op */ }
    setDemographics(demo);
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

  const handleViewHistory = (entry: TestHistoryEntry) => {
    if (!entry.result) return;
    setHistoryResult(entry.result);
    setHistoryShownWords(entry.allShownWords ?? []);
    setHistorySelectedIds(new Set(entry.selectedIds ?? []));
    setView('historyResult');
  };

  const handleCompleteStep = (stepSelectedIds: Set<string>) => {
    const newSelectedIds = new Set<string>(selectedIds);
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
      if (currentResult) {
        submitScore(currentResult, demographics ?? undefined);
        const entry: TestHistoryEntry = {
          estimate: currentResult.estimate,
          date: new Date().toISOString(),
          result: currentResult,
          allShownWords,
          selectedIds: [...selectedIds],
        };
        try {
          const prev = loadHistory();
          localStorage.setItem(HISTORY_KEY, JSON.stringify([...prev, entry].slice(-10)));
        } catch { /* no-op */ }
      }
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
          onViewHistory={handleViewHistory}
        />
      )}
      {view === 'survey' && (
        <SurveyView
          saved={demographics}
          onComplete={handleSurveyComplete}
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
          demographics={demographics ?? undefined}
        />
      )}
      {view === 'historyResult' && historyResult && (
        <ResultView
          result={historyResult}
          allShownWords={historyShownWords}
          selectedIds={historySelectedIds}
          onRetry={handleRetry}
          isHistory
        />
      )}
    </div>
  );
}
