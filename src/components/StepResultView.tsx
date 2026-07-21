import { motion } from 'motion/react';
import { Word, VocabResult } from '../types';

interface Props {
  step: number;
  maxSteps: number;
  result: VocabResult;
  allShownWords: Word[];
  selectedIds: Set<string>;
  onNext: () => void;
}

export function StepResultView({ step, maxSteps, result, allShownWords, selectedIds, onNext }: Props) {
  const { estimate, lower, upper } = result;
  const isFinal = step === maxSteps;

  const dummyWordsShown    = allShownWords.filter(w => w.isDummy);
  const selectedDummyWords = dummyWordsShown.filter(w => selectedIds.has(w.id));

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-6 max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full"
      >
        <span className="text-xs font-medium text-stone-500 uppercase tracking-widest mb-4 block">
          Step {step} / {maxSteps} Completed
        </span>

        <h3 className="text-3xl font-serif font-semibold text-stone-900 mb-8">
          現時点の推定語彙数
        </h3>

        {/* 点推定 */}
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-6xl font-serif font-bold text-stone-900">
            {estimate.toLocaleString()}
          </span>
          <span className="text-xl text-stone-500">語</span>
        </div>

        {/* 95% 信頼区間 */}
        <p className="text-stone-500 text-sm mb-10">
          95% 信頼区間：
          <span className="font-medium text-stone-700">
            {lower.toLocaleString()} 〜 {upper.toLocaleString()} 語
          </span>
        </p>

        {dummyWordsShown.length > 0 && (
          <div className="mb-10 text-left border-l-2 border-stone-300 pl-4 py-1">
            <h4 className="text-sm font-bold text-stone-800 mb-2 uppercase tracking-wider">
              ダミー単語チェック
            </h4>
            <p className="text-stone-600 mb-2 text-sm">
              これまでに出題された {dummyWordsShown.length} 個のダミー単語のうち、
              {selectedDummyWords.length} 個を選択しています。
            </p>
            {selectedDummyWords.length > 0 ? (
              <p className="text-stone-900 font-medium text-sm">
                選択したダミー: {selectedDummyWords.map(w => w.word).join(', ')}
              </p>
            ) : (
              <p className="text-stone-500 text-sm">ダミー単語は正しく見破られています。</p>
            )}
          </div>
        )}

        <p className="text-stone-600 mb-10 leading-relaxed">
          {isFinal
            ? 'すべてのステップが完了しました。最終結果を確認しましょう。'
            : 'この結果をもとに、次に出題する単語のレベルを自動調整します。'}
        </p>

        <button
          onClick={onNext}
          className="bg-stone-900 hover:bg-stone-800 text-white font-medium py-4 px-8 transition-colors flex items-center gap-3 w-fit"
        >
          {isFinal ? '最終結果を見る' : '次のステップへ'}
          <span className="text-xl">→</span>
        </button>
      </motion.div>
    </main>
  );
}
