import { useState, useEffect } from 'react';
import { Word } from '../types';
import { motion } from 'motion/react';

interface Props {
  words: Word[];
  step: number;
  maxSteps: number;
  onComplete: (selectedIds: Set<string>) => void;
}

export function TestView({ words, step, maxSteps, onComplete }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection when step changes (new words are provided)
  useEffect(() => {
    setSelected(new Set());
  }, [step]);

  const toggleWord = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const progressPercentage = ((step - 1) / maxSteps) * 100;

  return (
    <div className="min-h-screen pb-32">
      <header className="bg-[#fcfcfc] sticky top-0 z-10 border-b border-stone-200">
        <div className="absolute top-0 left-0 h-1 bg-stone-900 transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }} />
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-widest mb-1">Step {step} / {maxSteps}</span>
            <h2 className="font-serif font-semibold text-stone-900 text-lg">知っている単語を選択</h2>
          </div>
          <span className="text-stone-500 text-sm font-medium">
            {selected.size} / {words.length}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {words.map((w, index) => (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.3) }}
              key={w.id}
              onClick={() => toggleWord(w.id)}
              className={`
                relative p-5 text-left transition-all duration-200 select-none
                border
                ${selected.has(w.id)
                  ? 'bg-stone-900 text-white border-stone-900 shadow-md transform scale-[1.02]'
                  : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400 hover:shadow-sm'
                }
              `}
            >
              <div className="text-lg font-medium flex items-center justify-between">
                <span>{w.word}</span>
                {selected.has(w.id) && (
                  <motion.span 
                    initial={{ scale: 0 }} 
                    animate={{ scale: 1 }} 
                    className="w-2 h-2 rounded-full bg-white"
                  />
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-[#fcfcfc] border-t border-stone-200 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
        <div className="max-w-4xl mx-auto flex justify-end">
          <button
            onClick={() => onComplete(selected)}
            className="bg-stone-900 hover:bg-stone-800 text-white font-medium py-3 px-8 transition-colors flex items-center gap-3"
          >
            完了して結果を見る 
            <span className="text-xl">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
