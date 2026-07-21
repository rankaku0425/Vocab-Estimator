import { motion } from 'motion/react';

interface Props {
  onStart: () => void;
  hasSavedSession: boolean;
  onResume: () => void;
}

export function WelcomeView({ onStart, hasSavedSession, onResume }: Props) {
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

        <div className="flex flex-col sm:flex-row gap-4">
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
          <p className="mt-4 text-xs text-stone-400">
            ※「テストを開始する」を押すと、保存中の進行状況は削除されます。
          </p>
        )}
      </motion.div>
    </main>
  );
}
