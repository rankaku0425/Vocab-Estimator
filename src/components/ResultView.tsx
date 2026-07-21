import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Word, VocabResult } from '../types';
import { fetchRankingStats, RankingStats } from '../supabase';

// ── CEFR / 試験換算テーブル ──────────────────────────────────────────────────
const CEFR_TABLE = [
  { min: 0,     max: 1500,     cefr: 'A1', toeic: '〜300',    eiken: '5級',      label: 'Starter' },
  { min: 1500,  max: 3000,     cefr: 'A2', toeic: '300〜500', eiken: '4〜3級',   label: 'Elementary' },
  { min: 3000,  max: 5000,     cefr: 'B1', toeic: '500〜700', eiken: '3〜準2級', label: 'Intermediate' },
  { min: 5000,  max: 7500,     cefr: 'B2', toeic: '700〜860', eiken: '準2〜2級', label: 'Upper Intermediate' },
  { min: 7500,  max: 9500,     cefr: 'C1', toeic: '860〜950', eiken: '2〜準1級', label: 'Advanced' },
  { min: 9500,  max: Infinity, cefr: 'C2', toeic: '950〜',    eiken: '1級',      label: 'Proficient' },
] as const;

function getCefrRow(estimate: number) {
  return CEFR_TABLE.find(r => estimate >= r.min && estimate < r.max)
    ?? CEFR_TABLE[CEFR_TABLE.length - 1];
}

// ── レベル別棒グラフ ─────────────────────────────────────────────────────────
const MAX_BAR_PX = 80;

function LevelBarChart({ breakdown }: { breakdown: { level: number; probability: number }[] }) {
  return (
    <div>
      <h4 className="font-bold text-stone-900 mb-4 text-sm uppercase tracking-wider">
        レベル別 既知語率
      </h4>
      {/* bars: flex items-end で下揃え、高さはピクセル指定で正確に描画 */}
      <div className="flex items-end gap-1.5" style={{ height: MAX_BAR_PX + 40 }}>
        {breakdown.map(({ level, probability }) => {
          const barPx = Math.max(2, Math.round(probability * MAX_BAR_PX));
          return (
            <div
              key={level}
              className="flex-1 flex flex-col items-center"
              style={{ height: '100%', justifyContent: 'flex-end' }}
            >
              {/* パーセント表示 */}
              <span className="text-[9px] text-stone-500 font-mono leading-none mb-1">
                {Math.round(probability * 100)}%
              </span>
              {/* バー（ピクセル高さでアニメーション） */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: barPx }}
                transition={{ duration: 0.7, delay: level * 0.05, ease: 'easeOut' }}
                className="w-full bg-stone-900 rounded-t-sm"
              />
              {/* レベル番号 */}
              <span className="text-[9px] text-stone-400 font-mono leading-none mt-1.5">
                {level}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-stone-400 mt-2">
        IRT（ラッシュモデル）による各レベルの推定既知割合
      </p>
    </div>
  );
}

// ── ランキングセクション ──────────────────────────────────────────────────────
function RankingSection({ estimate }: { estimate: number }) {
  const [ranking, setRanking]   = useState<RankingStats | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetchRankingStats(estimate)
      .then(setRanking)
      .catch(() => { /* ランキング取得失敗は静かに無視 */ })
      .finally(() => setLoading(false));
  }, [estimate]);

  if (loading) {
    return (
      <div className="border border-stone-200 bg-white p-6 mb-10">
        <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">ランキング</h4>
        <p className="text-stone-400 text-sm">集計中...</p>
      </div>
    );
  }

  if (!ranking || ranking.total === 0) {
    return (
      <div className="border border-stone-200 bg-white p-6 mb-10">
        <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">ランキング</h4>
        <p className="text-stone-500 text-sm">まだ十分なデータがありません。あなたが先駆者です！</p>
      </div>
    );
  }

  const isAboveMedian = estimate >= ranking.median;

  return (
    <div className="border border-stone-200 bg-white p-6 mb-10">
      <h4 className="font-bold text-stone-900 mb-4 text-sm uppercase tracking-wider">ランキング</h4>

      {/* パーセンタイル表示 */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-4xl font-serif font-bold text-stone-900">
          上位 {(100 - ranking.percentile).toFixed(1)}%
        </span>
      </div>

      {/* パーセンタイルバー */}
      <div className="mb-4">
        <div className="relative w-full h-2 bg-stone-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${100 - ranking.percentile}%` }}
            transition={{ duration: 1.0, ease: 'easeOut' }}
            className="absolute right-0 h-full bg-stone-900 rounded-full"
          />
        </div>
        <div className="flex justify-between text-xs text-stone-400 font-mono mt-1">
          <span>下位</span>
          <span>上位</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">参加者全体の中央値</p>
          <p className="font-medium text-stone-900">
            {Math.round(ranking.median).toLocaleString()} 語
            <span className={`ml-2 text-xs ${isAboveMedian ? 'text-stone-600' : 'text-stone-400'}`}>
              ({isAboveMedian ? '中央値以上' : '中央値以下'})
            </span>
          </p>
        </div>
        <div>
          <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">総参加者数</p>
          <p className="font-medium text-stone-900">{ranking.total.toLocaleString()} 人</p>
        </div>
      </div>
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────
interface Props {
  result: VocabResult;
  allShownWords: Word[];
  selectedIds: Set<string>;
  onRetry: () => void;
}

export function ResultView({ result, allShownWords, selectedIds, onRetry }: Props) {
  const { estimate, lower, upper, levelBreakdown } = result;
  const cefrRow = getCefrRow(estimate);

  const fillPct      = Math.min((estimate / 12000) * 100, 100);
  const fillPctLower = Math.min((lower   / 12000) * 100, 100);
  const fillPctUpper = Math.min((upper   / 12000) * 100, 100);

  const dummyShown    = allShownWords.filter(w => w.isDummy);
  const selectedDummy = dummyShown.filter(w => selectedIds.has(w.id));

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-6 py-16 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full">

        {/* ── 推定値 ── */}
        <div className="mb-10">
          <span className="text-xs font-medium text-stone-500 uppercase tracking-widest mb-4 block">
            Final Result
          </span>
          <div className="flex items-baseline gap-3 mb-1">
            <span className="text-7xl font-serif font-bold text-stone-900">
              {estimate.toLocaleString()}
            </span>
            <span className="text-2xl text-stone-500">語</span>
          </div>
          <p className="text-stone-500 text-sm mb-6">
            95% 信頼区間：
            <span className="font-medium text-stone-700">
              {lower.toLocaleString()} 〜 {upper.toLocaleString()} 語
            </span>
          </p>

          {/* スケールバー（信頼区間付き） */}
          <div className="mb-2">
            <div className="relative w-full h-3 bg-stone-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0, left: '0%' }}
                animate={{ width: `${fillPctUpper - fillPctLower}%`, left: `${fillPctLower}%` }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="absolute h-full bg-stone-300 rounded-full"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${fillPct}%` }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="absolute h-full bg-stone-900 rounded-full"
              />
            </div>
            <div className="flex justify-between text-xs text-stone-400 font-mono mt-1">
              <span>0</span><span>12,000+</span>
            </div>
          </div>
        </div>

        {/* ── ランキング ── */}
        <RankingSection estimate={estimate} />

        {/* ── CEFR 換算表 ── */}
        <div className="mb-10 border border-stone-200 bg-white">
          <div className="px-6 py-4 border-b border-stone-100">
            <h4 className="font-bold text-stone-900 text-sm uppercase tracking-wider">試験換算の目安</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 uppercase tracking-wider">
                  <th className="px-6 py-2 text-left font-medium">語彙数</th>
                  <th className="px-4 py-2 text-left font-medium">CEFR</th>
                  <th className="px-4 py-2 text-left font-medium">TOEIC</th>
                  <th className="px-4 py-2 text-left font-medium">英検</th>
                </tr>
              </thead>
              <tbody>
                {CEFR_TABLE.map(row => {
                  const active = row.cefr === cefrRow.cefr;
                  return (
                    <tr
                      key={row.cefr}
                      className={active
                        ? 'bg-stone-900 text-white'
                        : 'border-t border-stone-100 text-stone-600'}
                    >
                      <td className="px-6 py-2.5 font-mono text-xs">
                        {row.min.toLocaleString()}{row.max === Infinity ? '〜' : `〜${row.max.toLocaleString()}`}
                      </td>
                      <td className="px-4 py-2.5 font-bold">{row.cefr}</td>
                      <td className="px-4 py-2.5">{row.toeic}</td>
                      <td className="px-4 py-2.5">{row.eiken}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-stone-200 bg-stone-50">
            <p className="text-xs text-stone-400">
              ※ 試験スコアとの換算は研究上の目安であり、各試験の公式換算ではありません。
            </p>
          </div>
        </div>

        {/* ── レベル別棒グラフ ── */}
        <div className="mb-10 border border-stone-200 bg-white p-6">
          <LevelBarChart breakdown={levelBreakdown} />
        </div>

        {/* ── ダミー検出・アルゴリズム ── */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="border border-stone-200 p-6 bg-white">
            <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">
              ダミー単語の検出
            </h4>
            <p className="text-stone-600 text-sm mb-3">
              出題された {dummyShown.length} 個の存在しない単語のうち、
              {selectedDummy.length} 個を選択しました。
            </p>
            {selectedDummy.length > 0 ? (
              <p className="text-stone-900 text-sm font-medium">
                選択した単語: {selectedDummy.map(w => w.word).join(', ')}
              </p>
            ) : (
              <p className="text-stone-500 text-sm italic">ダミー単語には騙されませんでした。</p>
            )}
          </div>
          <div className="border border-stone-200 p-6 bg-white">
            <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">
              推計アルゴリズム
            </h4>
            <ul className="text-sm text-stone-600 space-y-2">
              <li>• <strong className="text-stone-800">IRT（ラッシュモデル）</strong>による潜在能力推定</li>
              <li>• <strong className="text-stone-800">CAT（適応型テスト）</strong>による最適出題</li>
              <li>• Fisher情報量に基づく <strong className="text-stone-800">95% 信頼区間</strong></li>
              <li>• ダミー選択率によるペナルティ補正</li>
            </ul>
          </div>
        </div>

        <button
          onClick={onRetry}
          className="border-2 border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white font-medium py-4 px-8 transition-colors flex items-center justify-center gap-3 w-full sm:w-auto"
        >
          もう一度テストする
        </button>
      </motion.div>
    </main>
  );
}
