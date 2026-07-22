import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { VocabResult, TestHistoryEntry } from '../types';
import { loadHistory } from '../App';

interface Props {
  onStart: () => void;
  hasSavedSession: boolean;
  onResume: () => void;
  onViewHistory: (result: VocabResult) => void;
}

export function WelcomeView({ onStart, hasSavedSession, onResume, onViewHistory }: Props) {
  const [history, setHistory] = useState<TestHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory().filter(h => h.result).reverse()); // 新しい順
  }, []);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-6 max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full"
      >
        <h1 className="text-4xl md:text-5xl font-serif font-semibold tracking-tight text-stone-900 mb-6 leading-tight">
          Vocabulary <br/><span className="italic text-stone-500">Estimator.</span>
        </h1>
        <div className="w-12 h-1 bg-stone-900 mb-8"></div>
        <p className="text-stone-600 mb-10 leading-relaxed text-lg">
          表示される英単語の中から、意味を知っている単語をすべて選んでください。
          項目応答理論（IRT）に基づき、あなたの推定語彙力を診断します。
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <button
            onClick={onStart}
            className="bg-stone-900 hover:bg-stone-800 text-white font-medium py-4 px-8 transition-colors text-lg"
          >
            テストを開始する
          </button>

          {hasSavedSession && (
            <button
              onClick={onResume}
              className="border-2 border-stone-900 text-stone-900 hover:bg-stone-100 font-medium py-4 px-8 transition-colors text-lg"
            >
              前回の続きから再開
            </button>
          )}
        </div>

        {hasSavedSession && (
          <p className="mb-10 text-xs text-stone-400">
            ※「テストを開始する」を押すと、保存中の進行状況は削除されます。
          </p>
        )}

        {/* 過去の結果一覧 */}
        {history.length > 0 && (
          <div className="mt-4">
            <h2 className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-3">
              過去の結果
            </h2>
            <div className="space-y-2">
              {history.map((entry, i) => {
                const date = new Date(entry.date);
                const label = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                return (
                  <button
                    key={i}
                    onClick={() => entry.result && onViewHistory(entry.result)}
                    className="w-full flex items-center justify-between border border-stone-200 bg-white hover:bg-stone-50 px-5 py-3 transition-colors text-left"
                  >
                    <span className="text-xs text-stone-400 font-mono">{label}</span>
                    <span className="text-lg font-serif font-bold text-stone-900">
                      {entry.estimate.toLocaleString()} <span className="text-sm text-stone-500 font-sans font-normal">語</span>
                    </span>
                    <span className="text-xs text-stone-400">詳細を見る →</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </main>
  );
}
