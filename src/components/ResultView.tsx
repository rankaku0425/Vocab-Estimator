import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Word, VocabResult, TestHistoryEntry } from '../types';
import { fetchRankingStats, RankingStats } from '../supabase';

// ── CEFR / 試験換算テーブル ──────────────────────────────────────────────────
const CEFR_TABLE = [
  { min: 0,     max: 1500,     cefr: 'A1', toeic: '〜300',    eiken: '3級',        label: 'Starter' },
  { min: 1500,  max: 3000,     cefr: 'A2', toeic: '300〜500', eiken: '準2級',      label: 'Elementary' },
  { min: 3000,  max: 5000,     cefr: 'B1', toeic: '500〜700', eiken: '2級',        label: 'Intermediate' },
  { min: 5000,  max: 7500,     cefr: 'B2', toeic: '700〜860', eiken: '準1級',      label: 'Upper Intermediate' },
  { min: 7500,  max: 9500,     cefr: 'C1', toeic: '860〜950', eiken: '1級',        label: 'Advanced' },
  { min: 9500,  max: Infinity, cefr: 'C2', toeic: '950〜',    eiken: '1級（上位）', label: 'Proficient' },
] as const;

function getCefrRow(estimate: number) {
  return CEFR_TABLE.find(r => estimate >= r.min && estimate < r.max)
    ?? CEFR_TABLE[CEFR_TABLE.length - 1];
}

// ── カテゴリ定義 ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { label: '基礎語',   levels: [1, 2, 3],     desc: 'Basic' },
  { label: '一般語',   levels: [4, 5, 6],     desc: 'General' },
  { label: '学術語',   levels: [7, 8],        desc: 'Academic' },
  { label: '専門語',   levels: [9, 10],       desc: 'Advanced' },
] as const;

// ── カテゴリ別診断 ────────────────────────────────────────────────────────────
function CategoryBreakdown({ breakdown }: { breakdown: { level: number; probability: number }[] }) {
  return (
    <div className="mb-10 border border-stone-200 bg-white p-6">
      <h4 className="font-bold text-stone-900 mb-4 text-sm uppercase tracking-wider">
        カテゴリ別 語彙診断
      </h4>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(cat => {
          const probs = cat.levels.map(lv => breakdown.find(b => b.level === lv)?.probability ?? 0);
          const avg = probs.reduce((s, p) => s + p, 0) / probs.length;
          const pct = Math.round(avg * 100);
          return (
            <div key={cat.label} className="border border-stone-100 p-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-stone-400 uppercase tracking-wider">{cat.desc}</span>
                <span className="text-lg font-serif font-bold text-stone-900">{pct}%</span>
              </div>
              <p className="text-sm font-medium text-stone-700 mb-2">{cat.label}</p>
              <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={`h-full rounded-full ${
                    pct >= 70 ? 'bg-stone-900' : pct >= 40 ? 'bg-stone-500' : 'bg-stone-300'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 弱点レベルのハイライト ────────────────────────────────────────────────────
function WeaknessHighlight({ breakdown }: { breakdown: { level: number; probability: number }[] }) {
  const weakLevels   = breakdown.filter(b => b.probability < 0.4).sort((a, b) => a.probability - b.probability);
  const strongLevels = breakdown.filter(b => b.probability > 0.7).sort((a, b) => b.probability - a.probability);

  if (weakLevels.length === 0 && strongLevels.length === 0) return null;

  return (
    <div className="mb-10 border border-stone-200 bg-white p-6">
      <h4 className="font-bold text-stone-900 mb-4 text-sm uppercase tracking-wider">
        学習フィードバック
      </h4>
      <div className="space-y-3">
        {weakLevels.length > 0 && (
          <div>
            <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">要強化</p>
            {weakLevels.slice(0, 3).map(({ level, probability }) => (
              <div key={level} className="flex items-center gap-3 mb-1.5">
                <span className="text-xs font-mono bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                  Lv {level}
                </span>
                <span className="text-sm text-stone-600">
                  既知率 {Math.round(probability * 100)}% — このレベルの単語を重点的に学習しましょう。
                </span>
              </div>
            ))}
          </div>
        )}
        {strongLevels.length > 0 && (
          <div className={weakLevels.length > 0 ? 'pt-3 border-t border-stone-100' : ''}>
            <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">強み</p>
            {strongLevels.slice(0, 3).map(({ level, probability }) => (
              <div key={level} className="flex items-center gap-3 mb-1.5">
                <span className="text-xs font-mono bg-stone-900 text-white px-2 py-0.5 rounded">
                  Lv {level}
                </span>
                <span className="text-sm text-stone-600">
                  既知率 {Math.round(probability * 100)}% — このレベルは得意です。
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── レベル別棒グラフ ─────────────────────────────────────────────────────────
const MAX_BAR_PX = 80;

function LevelBarChart({ breakdown }: { breakdown: { level: number; probability: number }[] }) {
  return (
    <div>
      <h4 className="font-bold text-stone-900 mb-4 text-sm uppercase tracking-wider">
        レベル別 既知語率
      </h4>
      <div className="flex items-end gap-1.5" style={{ height: MAX_BAR_PX + 40 }}>
        {breakdown.map(({ level, probability }) => {
          const barPx = Math.max(2, Math.round(probability * MAX_BAR_PX));
          return (
            <div
              key={level}
              className="flex-1 flex flex-col items-center"
              style={{ height: '100%', justifyContent: 'flex-end' }}
            >
              <span className="text-[9px] text-stone-500 font-mono leading-none mb-1">
                {Math.round(probability * 100)}%
              </span>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: barPx }}
                transition={{ duration: 0.7, delay: level * 0.05, ease: 'easeOut' }}
                className="w-full bg-stone-900 rounded-t-sm"
              />
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

// ── 履歴グラフ（機能14） ──────────────────────────────────────────────────────
const HISTORY_KEY = 'vocab_test_history_v1';
const MAX_HISTORY_BAR_PX = 80;
const MAX_VOCAB = 12000;

function HistoryChart() {
  const [history, setHistory] = useState<TestHistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw) as TestHistoryEntry[]);
    } catch { /* no-op */ }
  }, []);

  if (history.length < 2) return null;

  const maxEstimate = Math.max(...history.map(h => h.estimate), MAX_VOCAB * 0.3);

  return (
    <div className="mb-10 border border-stone-200 bg-white p-6">
      <h4 className="font-bold text-stone-900 mb-4 text-sm uppercase tracking-wider">
        スコア履歴
      </h4>
      <div className="flex items-end gap-2" style={{ height: MAX_HISTORY_BAR_PX + 40 }}>
        {history.map((entry, i) => {
          const barPx = Math.max(2, Math.round((entry.estimate / maxEstimate) * MAX_HISTORY_BAR_PX));
          const date = new Date(entry.date);
          const label = `${date.getMonth() + 1}/${date.getDate()}`;
          const isLatest = i === history.length - 1;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center"
              style={{ height: '100%', justifyContent: 'flex-end' }}
            >
              <span className="text-[9px] text-stone-500 font-mono leading-none mb-1">
                {entry.estimate.toLocaleString()}
              </span>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: barPx }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: 'easeOut' }}
                className={`w-full rounded-t-sm ${isLatest ? 'bg-stone-900' : 'bg-stone-300'}`}
              />
              <span className="text-[9px] text-stone-400 font-mono leading-none mt-1.5">
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-stone-400 mt-2">
        過去のテスト結果（最大10件）。右端が今回のスコア。
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

      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-4xl font-serif font-bold text-stone-900">
          上位 {(100 - ranking.percentile).toFixed(1)}%
        </span>
      </div>

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

// ── エクスポートカード（PDF/画像用の隠しレイアウト） ────────────────────────
interface ExportCardProps {
  result: VocabResult;
  cefrRow: typeof CEFR_TABLE[number];
}

function ExportCard({ result, cefrRow }: ExportCardProps) {
  const { estimate, lower, upper, levelBreakdown } = result;
  const date = new Date().toLocaleDateString('ja-JP');

  const categories = CATEGORIES.map(cat => {
    const probs = cat.levels.map(lv => levelBreakdown.find(b => b.level === lv)?.probability ?? 0);
    const avg = probs.reduce((s, p) => s + p, 0) / probs.length;
    return { ...cat, avg };
  });

  return (
    <div
      style={{
        width: '600px',
        background: '#fff',
        fontFamily: 'Georgia, serif',
        padding: '48px',
        boxSizing: 'border-box',
        color: '#1c1917',
      }}
    >
      {/* ヘッダー */}
      <p style={{ fontSize: '11px', letterSpacing: '3px', color: '#78716c', marginBottom: '8px', textTransform: 'uppercase' }}>
        Vocabulary Estimator — Result
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '4px' }}>
        <span style={{ fontSize: '72px', fontWeight: 'bold', lineHeight: 1 }}>{estimate.toLocaleString()}</span>
        <span style={{ fontSize: '24px', color: '#78716c' }}>語</span>
      </div>
      <p style={{ fontSize: '13px', color: '#78716c', marginBottom: '4px' }}>
        95% 信頼区間: {lower.toLocaleString()} 〜 {upper.toLocaleString()} 語
      </p>

      {/* バー */}
      <div style={{ background: '#f5f5f4', height: '8px', borderRadius: '4px', margin: '16px 0', overflow: 'hidden' }}>
        <div style={{
          background: '#1c1917',
          height: '100%',
          width: `${Math.min((estimate / 12000) * 100, 100)}%`,
          borderRadius: '4px',
        }} />
      </div>

      {/* CEFR バッジ */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {[
          { label: 'CEFR', value: cefrRow.cefr },
          { label: 'TOEIC', value: cefrRow.toeic },
          { label: '英検', value: cefrRow.eiken },
        ].map(({ label, value }) => (
          <div key={label} style={{ border: '1px solid #e7e5e4', padding: '8px 16px' }}>
            <p style={{ fontSize: '10px', color: '#a8a29e', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</p>
            <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* カテゴリ別 */}
      <p style={{ fontSize: '10px', letterSpacing: '2px', color: '#a8a29e', textTransform: 'uppercase', marginBottom: '12px' }}>
        カテゴリ別 語彙診断
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        {categories.map(cat => (
          <div key={cat.label} style={{ border: '1px solid #f5f5f4', padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{cat.label}</span>
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{Math.round(cat.avg * 100)}%</span>
            </div>
            <div style={{ background: '#f5f5f4', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ background: '#1c1917', height: '100%', width: `${Math.round(cat.avg * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* レベル別棒グラフ */}
      <p style={{ fontSize: '10px', letterSpacing: '2px', color: '#a8a29e', textTransform: 'uppercase', marginBottom: '8px' }}>
        レベル別 既知語率
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px', marginBottom: '24px' }}>
        {levelBreakdown.map(({ level, probability }) => (
          <div key={level} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '8px', color: '#a8a29e', marginBottom: '2px' }}>{Math.round(probability * 100)}%</span>
            <div style={{ background: '#1c1917', width: '100%', height: `${Math.max(2, Math.round(probability * 60))}px` }} />
            <span style={{ fontSize: '8px', color: '#a8a29e', marginTop: '2px' }}>{level}</span>
          </div>
        ))}
      </div>

      {/* フッター */}
      <div style={{ borderTop: '1px solid #e7e5e4', paddingTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: '#a8a29e' }}>Vocab Estimator</span>
        <span style={{ fontSize: '11px', color: '#a8a29e' }}>{date}</span>
      </div>
    </div>
  );
}

// ── エクスポートボタン ────────────────────────────────────────────────────────
function ExportButtons({ result, cefrRow }: ExportCardProps) {
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const capture = async () => {
    const { default: html2canvas } = await import('html2canvas');
    if (!cardRef.current) return null;
    return html2canvas(cardRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });
  };

  const exportPNG = async () => {
    setExporting('png');
    try {
      const canvas = await capture();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `vocab_result_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally { setExporting(null); }
  };

  const exportPDF = async () => {
    setExporting('pdf');
    try {
      const canvas = await capture();
      if (!canvas) return;
      const { jsPDF } = await import('jspdf');
      const imgData = canvas.toDataURL('image/png');
      const pxToMm = (px: number) => px * 0.264583;
      const w = pxToMm(canvas.width);
      const h = pxToMm(canvas.height);
      const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait' });
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);
      pdf.save(`vocab_result_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setExporting(null); }
  };

  return (
    <div className="mb-12">
      <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">結果を保存</h4>
      <div className="flex gap-3 mb-4">
        <button
          onClick={exportPNG}
          disabled={!!exporting}
          className="border border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white text-sm font-medium py-2.5 px-5 transition-colors disabled:opacity-40"
        >
          {exporting === 'png' ? '生成中...' : '画像（PNG）で保存'}
        </button>
        <button
          onClick={exportPDF}
          disabled={!!exporting}
          className="border border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white text-sm font-medium py-2.5 px-5 transition-colors disabled:opacity-40"
        >
          {exporting === 'pdf' ? '生成中...' : 'PDF で保存'}
        </button>
      </div>
      {/* エクスポート用カード（画面外に配置してキャプチャ） */}
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px' }}>
        <div ref={cardRef}>
          <ExportCard result={result} cefrRow={cefrRow} />
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

        {/* ── 学習フィードバック（機能12） ── */}
        <WeaknessHighlight breakdown={levelBreakdown} />

        {/* ── カテゴリ別診断（機能11） ── */}
        <CategoryBreakdown breakdown={levelBreakdown} />

        {/* ── レベル別棒グラフ ── */}
        <div className="mb-10 border border-stone-200 bg-white p-6">
          <LevelBarChart breakdown={levelBreakdown} />
        </div>

        {/* ── スコア履歴（機能14） ── */}
        <HistoryChart />

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

        {/* ── エクスポート ── */}
        <ExportButtons result={result} cefrRow={cefrRow} />

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
