import { useState } from 'react';
import { motion } from 'motion/react';
import { Demographics, AgeGroup, Gender } from '../types';

const AGE_GROUPS: AgeGroup[] = ['10代', '20代', '30代', '40代', '50代', '60代以上'];
const GENDERS: Gender[]      = ['男性', '女性', 'その他'];

interface Props {
  saved:      Demographics | null;
  onComplete: (d: Demographics) => void;
}

export function SurveyView({ saved, onComplete }: Props) {
  const [editing,   setEditing]   = useState(saved === null);
  const [ageGroup,  setAgeGroup]  = useState<AgeGroup | null>(saved?.ageGroup ?? null);
  const [gender,    setGender]    = useState<Gender   | null>(saved?.gender   ?? null);

  const canProceed = ageGroup !== null && gender !== null;

  const handleSubmit = () => {
    if (!ageGroup || !gender) return;
    onComplete({ ageGroup, gender });
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-6 max-w-xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full"
      >
        <h1 className="text-3xl font-serif font-semibold tracking-tight text-stone-900 mb-2">
          テスト前アンケート
        </h1>
        <div className="w-10 h-0.5 bg-stone-900 mb-6" />
        <p className="text-stone-500 text-sm mb-8 leading-relaxed">
          同年代・同性別との比較などに使用します。一度入力すると次回以降は自動的に反映されます。
        </p>

        {/* 保存済みで編集モードでない場合：確認UI */}
        {saved && !editing ? (
          <div className="border border-stone-200 bg-white p-6 mb-8">
            <p className="text-xs text-stone-400 uppercase tracking-wider mb-4">前回の回答</p>
            <div className="flex gap-6 mb-6">
              <div>
                <p className="text-xs text-stone-400 mb-1">年代</p>
                <p className="text-xl font-serif font-bold text-stone-900">{saved.ageGroup}</p>
              </div>
              <div>
                <p className="text-xs text-stone-400 mb-1">性別</p>
                <p className="text-xl font-serif font-bold text-stone-900">{saved.gender}</p>
              </div>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-stone-400 hover:text-stone-700 underline"
            >
              変更する
            </button>
          </div>
        ) : (
          /* 入力フォーム */
          <div className="space-y-8 mb-8">
            {/* 年代 */}
            <div>
              <p className="text-sm font-medium text-stone-700 mb-3">年代</p>
              <div className="grid grid-cols-3 gap-2">
                {AGE_GROUPS.map(ag => (
                  <button
                    key={ag}
                    onClick={() => setAgeGroup(ag)}
                    className={`py-3 text-sm font-medium border transition-colors ${
                      ageGroup === ag
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-stone-500'
                    }`}
                  >
                    {ag}
                  </button>
                ))}
              </div>
            </div>

            {/* 性別 */}
            <div>
              <p className="text-sm font-medium text-stone-700 mb-3">性別</p>
              <div className="grid grid-cols-3 gap-2">
                {GENDERS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`py-3 text-sm font-medium border transition-colors ${
                      gender === g
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-stone-500'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canProceed}
          className="bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white font-medium py-4 px-8 transition-colors text-lg w-full sm:w-auto"
        >
          テストに進む
        </button>
      </motion.div>
    </main>
  );
}
