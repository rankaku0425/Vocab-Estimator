import { useState, useEffect } from 'react';
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

// ── カテゴリ詳細モーダル ──────────────────────────────────────────────────────
type CategoryDef = typeof CATEGORIES[number];

function CategoryModal({
  cat,
  allShownWords,
  selectedIds,
  onClose,
}: {
  cat: CategoryDef;
  allShownWords: Word[];
  selectedIds: Set<string>;
  onClose: () => void;
}) {
  const catWords  = allShownWords.filter(w => !w.isDummy && (cat.levels as readonly number[]).includes(w.level));
  const known     = catWords.filter(w => selectedIds.has(w.id));
  const unknown   = catWords.filter(w => !selectedIds.has(w.id));
  const hasData   = catWords.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white border border-stone-200 w-full max-w-md max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div>
            <p className="text-xs text-stone-400 uppercase tracking-wider">{cat.desc}</p>
            <h3 className="font-bold text-stone-900">{cat.label} — Lv {cat.levels.join(', ')}</h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5">
          {!hasData ? (
            <p className="text-sm text-stone-400 italic">
              このカテゴリの単語は今回のテストで出題されませんでした。
            </p>
          ) : (
            <div className="space-y-5">
              {/* 知っていた */}
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">
                  知っていた単語 ({known.length}/{catWords.length})
                </p>
                {known.length === 0 ? (
                  <p className="text-sm text-stone-400 italic">なし</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {known.map(w => (
                      <span key={w.id} className="bg-stone-900 text-white text-sm px-2.5 py-1 font-medium">
                        {w.word}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 知らなかった */}
              <div>
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">
                  知らなかった単語 ({unknown.length}/{catWords.length})
                </p>
                {unknown.length === 0 ? (
                  <p className="text-sm text-stone-400 italic">なし</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {unknown.map(w => (
                      <span key={w.id} className="border border-stone-300 text-stone-600 text-sm px-2.5 py-1">
                        {w.word}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── カテゴリ別診断 ────────────────────────────────────────────────────────────
function CategoryBreakdown({
  breakdown,
  allShownWords,
  selectedIds,
}: {
  breakdown: { level: number; probability: number }[];
  allShownWords: Word[];
  selectedIds: Set<string>;
}) {
  const [activeCat, setActiveCat] = useState<CategoryDef | null>(null);

  return (
    <div className="mb-10 border border-stone-200 bg-white p-6">
      <h4 className="font-bold text-stone-900 mb-1 text-sm uppercase tracking-wider">
        カテゴリ別 語彙診断
      </h4>
      <p className="text-xs text-stone-400 mb-4">カードをクリックすると出題単語の詳細を確認できます</p>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(cat => {
          const probs = (cat.levels as readonly number[]).map(lv => breakdown.find(b => b.level === lv)?.probability ?? 0);
          const avg = probs.reduce((s, p) => s + p, 0) / probs.length;
          const pct = Math.round(avg * 100);
          const shownCount = allShownWords.filter(w => !w.isDummy && (cat.levels as readonly number[]).includes(w.level)).length;
          return (
            <button
              key={cat.label}
              onClick={() => setActiveCat(cat)}
              className="border border-stone-100 p-4 text-left hover:border-stone-400 hover:bg-stone-50 transition-colors cursor-pointer"
            >
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-stone-400 uppercase tracking-wider">{cat.desc}</span>
                <span className="text-lg font-serif font-bold text-stone-900">{pct}%</span>
              </div>
              <p className="text-sm font-medium text-stone-700 mb-1">{cat.label}</p>
              {shownCount > 0 && (
                <p className="text-xs text-stone-400 mb-2">{shownCount} 語出題</p>
              )}
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
            </button>
          );
        })}
      </div>

      {activeCat && (
        <CategoryModal
          cat={activeCat}
          allShownWords={allShownWords}
          selectedIds={selectedIds}
          onClose={() => setActiveCat(null)}
        />
      )}
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

// ── Canvas API によるエクスポート描画 ─────────────────────────────────────────
function createResultCanvas(result: VocabResult): HTMLCanvasElement {
  const W = 600;
  const PAD = 48;
  const scale = 2;
  const cefrRow = getCefrRow(result.estimate);

  const categories = CATEGORIES.map(cat => {
    const probs = (cat.levels as readonly number[]).map(
      lv => result.levelBreakdown.find(b => b.level === lv)?.probability ?? 0
    );
    const avg = probs.reduce((s, p) => s + p, 0) / probs.length;
    return { label: cat.label, avg };
  });

  // 高さを事前計算
  const H = 680;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const date = new Date().toLocaleDateString('ja-JP');
  let y = PAD;

  // ヘッダーラベル
  ctx.font = '11px Arial, sans-serif';
  ctx.fillStyle = '#a8a29e';
  ctx.textAlign = 'left';
  ctx.fillText('VOCABULARY ESTIMATOR  —  RESULT', PAD, y);
  y += 18;

  // 横線
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 20;

  // 大きい数字
  ctx.font = 'bold 60px Georgia, serif';
  ctx.fillStyle = '#1c1917';
  ctx.fillText(result.estimate.toLocaleString(), PAD, y + 60);
  const numW = ctx.measureText(result.estimate.toLocaleString()).width;
  ctx.font = '22px Georgia, serif';
  ctx.fillStyle = '#78716c';
  ctx.fillText(' 語', PAD + numW, y + 50);
  y += 96; // 数字（60px font）とCIテキストの間に十分な余白

  // CI テキスト
  ctx.font = '12px Arial, sans-serif';
  ctx.fillStyle = '#78716c';
  ctx.fillText(
    `95% 信頼区間: ${result.lower.toLocaleString()} 〜 ${result.upper.toLocaleString()} 語`,
    PAD, y
  );
  y += 18;

  // スケールバー
  const barW = W - PAD * 2;
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(PAD, y, barW, 8);
  ctx.fillStyle = '#d6d3d1';
  const lowerPct = Math.min(result.lower / 12000, 1);
  const upperPct = Math.min(result.upper / 12000, 1);
  ctx.fillRect(PAD + barW * lowerPct, y, barW * (upperPct - lowerPct), 8);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(PAD, y, barW * Math.min(result.estimate / 12000, 1), 8);
  y += 24;

  // CEFR バッジ
  const badges = [
    { label: 'CEFR', value: cefrRow.cefr },
    { label: 'TOEIC', value: cefrRow.toeic },
    { label: '英検', value: cefrRow.eiken },
  ];
  const badgeW = (barW - 16) / 3;
  badges.forEach((b, i) => {
    const bx = PAD + i * (badgeW + 8);
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, y, badgeW, 52);
    ctx.font = '10px Arial, sans-serif';
    ctx.fillStyle = '#a8a29e';
    ctx.textAlign = 'left';
    ctx.fillText(b.label, bx + 10, y + 16);
    ctx.font = 'bold 17px Arial, sans-serif';
    ctx.fillStyle = '#1c1917';
    ctx.fillText(b.value, bx + 10, y + 38);
  });
  y += 68;

  // カテゴリ別
  ctx.font = '10px Arial, sans-serif';
  ctx.fillStyle = '#a8a29e';
  ctx.textAlign = 'left';
  ctx.fillText('カテゴリ別 語彙診断', PAD, y);
  y += 12;

  const catW = (barW - 8) / 2;
  const catH = 48;
  categories.forEach((cat, i) => {
    const cx = PAD + (i % 2) * (catW + 8);
    const cy = y + Math.floor(i / 2) * (catH + 8);
    ctx.strokeStyle = '#f5f5f4';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, cy, catW, catH);
    const pct = Math.round(cat.avg * 100);
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillStyle = '#1c1917';
    ctx.textAlign = 'left';
    ctx.fillText(cat.label, cx + 10, cy + 18);
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${pct}%`, cx + catW - 10, cy + 18);
    ctx.fillStyle = '#f5f5f4';
    ctx.fillRect(cx + 10, cy + 30, catW - 20, 4);
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(cx + 10, cy + 30, (catW - 20) * (pct / 100), 4);
  });
  y += catH * 2 + 8 + 16;

  // レベル別バー
  ctx.font = '10px Arial, sans-serif';
  ctx.fillStyle = '#a8a29e';
  ctx.textAlign = 'left';
  ctx.fillText('レベル別 既知語率', PAD, y);
  y += 12;

  const maxBarH = 56;
  const lvBarW = (barW - 9 * 3) / 10;
  result.levelBreakdown.forEach(({ level, probability }, i) => {
    const bx = PAD + i * (lvBarW + 3);
    const bh = Math.max(2, Math.round(probability * maxBarH));
    const by = y + maxBarH - bh;
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(bx, by, lvBarW, bh);
    ctx.font = '8px Arial, sans-serif';
    ctx.fillStyle = '#78716c';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(probability * 100)}%`, bx + lvBarW / 2, by - 2);
    ctx.fillStyle = '#a8a29e';
    ctx.fillText(`${level}`, bx + lvBarW / 2, y + maxBarH + 11);
  });
  y += maxBarH + 20;

  // フッター
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 14;
  ctx.font = '11px Arial, sans-serif';
  ctx.fillStyle = '#a8a29e';
  ctx.textAlign = 'left';
  ctx.fillText('Vocab Estimator', PAD, y);
  ctx.textAlign = 'right';
  ctx.fillText(date, W - PAD, y);

  // 実際の高さでクロップ
  const finalH = y + 20;
  const cropped = document.createElement('canvas');
  cropped.width = W * scale;
  cropped.height = finalH * scale;
  cropped.getContext('2d')!.drawImage(canvas, 0, 0, W * scale, finalH * scale, 0, 0, W * scale, finalH * scale);
  return cropped;
}

// ── エクスポートボタン ────────────────────────────────────────────────────────
function ExportButtons({ result }: { result: VocabResult }) {
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);

  const exportPNG = async () => {
    setExporting('png');
    try {
      const canvas = createResultCanvas(result);
      const link = document.createElement('a');
      link.download = `vocab_result_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally { setExporting(null); }
  };

  const exportPDF = async () => {
    setExporting('pdf');
    try {
      const canvas = createResultCanvas(result);
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
      <div className="flex gap-3">
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
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────
interface Props {
  result: VocabResult;
  allShownWords: Word[];
  selectedIds: Set<string>;
  onRetry: () => void;
  isHistory?: boolean;
}

export function ResultView({ result, allShownWords, selectedIds, onRetry, isHistory = false }: Props) {
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
        <CategoryBreakdown breakdown={levelBreakdown} allShownWords={allShownWords} selectedIds={selectedIds} />

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
        <ExportButtons result={result} />

        <button
          onClick={onRetry}
          className="border-2 border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white font-medium py-4 px-8 transition-colors flex items-center justify-center gap-3 w-full sm:w-auto"
        >
          {isHistory ? 'ホームに戻る' : 'もう一度テストする'}
        </button>
      </motion.div>
    </main>
  );
}
