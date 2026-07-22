import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Word, VocabResult, TestHistoryEntry, Demographics } from '../types';
import { fetchRankingStats, RankingStats, fetchDemoRankingStats, DemoRankingStats, fetchDemographicStats, DemographicStat, submitSelfEvaluation, submitRealScore, SelfEvaluation } from '../supabase';

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

// ── 5段階習熟度（モノクローム） ──────────────────────────────────────────────
function proficiencyInfo(pct: number): { label: string; cls: string } {
  if (pct >= 80) return { label: '習得済み', cls: 'bg-stone-900 text-white' };
  if (pct >= 60) return { label: 'ほぼ習得', cls: 'bg-stone-600 text-white' };
  if (pct >= 40) return { label: '定着途上', cls: 'bg-stone-200 text-stone-700' };
  if (pct >= 20) return { label: '学習中',   cls: 'bg-stone-100 text-stone-500' };
  return                { label: '未習得',   cls: 'border border-stone-300 text-stone-400' };
}

function barColorCls(pct: number): string {
  if (pct >= 80) return 'bg-stone-900';
  if (pct >= 60) return 'bg-stone-700';
  if (pct >= 40) return 'bg-stone-500';
  if (pct >= 20) return 'bg-stone-300';
  return 'bg-stone-200';
}

function shortLabel(pct: number): string {
  if (pct >= 80) return '得';
  if (pct >= 60) return '習';
  if (pct >= 40) return '定';
  if (pct >= 20) return '学';
  return '未';
}

// ── 学習目的別ヒント（アイデア10） ───────────────────────────────────────────
const PURPOSE_TIPS: Record<string, string> = {
  '受験・資格取得': '語彙問題頻出の Lv5〜7 が最重要です。英検・TOEIC の頻出語を中心に、出題単語リストと照合しながら学習しましょう。',
  '仕事・ビジネス': 'ビジネス英語に直結する Lv6〜8 を中心に強化しましょう。メール・会議・交渉で使う実用語を意識して取り入れるのが効果的です。',
  '海外留学・移住': '日常会話（Lv3〜5）とアカデミック語彙（Lv7〜8）を並行して学習するのが効果的です。留学先での読み書きにも対応できる語彙幅を目指しましょう。',
  '趣味・自己啓発': '興味ある分野の英語コンテンツ（映画・書籍・ポッドキャスト）を通じて、自然な文脈で語彙を広げましょう。楽しみながら続けることが最大の近道です。',
};

// ── 習熟パターン分析（アイデア8） ────────────────────────────────────────────
function analyzePattern(breakdown: { level: number; probability: number }[]): { label: string; message: string } {
  const probs = breakdown.map(b => b.probability);
  const avg   = probs.reduce((s, p) => s + p, 0) / probs.length;

  if (avg >= 0.8) return {
    label: '高得点型',
    message: '全レベルにわたって高い語彙力があります。より上位の専門語（Lv9〜10）に挑戦しましょう。',
  };
  if (avg <= 0.3) return {
    label: '基礎強化型',
    message: '基礎語彙を固めることが最優先です。Lv1〜3から着実に積み上げましょう。',
  };

  let isMonotone = true;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[i - 1] + 0.08) { isMonotone = false; break; }
  }
  if (isMonotone) return {
    label: '均整型',
    message: '語彙力はレベルに沿って均整のとれた成長曲線を描いています。この調子で次のレベルへ進みましょう。',
  };

  const hasGap = breakdown.some((item, i) => {
    const prev       = breakdown[i - 1]?.probability ?? item.probability;
    const next       = breakdown[i + 1]?.probability ?? item.probability;
    const neighborAvg = (prev + next) / 2;
    return neighborAvg - item.probability > 0.25;
  });
  if (hasGap) return {
    label: 'ギャップ型',
    message: '特定のレベルで習熟度が落ち込んでいます。下のギャップ警告のレベルを集中的に補強しましょう。',
  };

  return {
    label: '発展途上型',
    message: '語彙力は発展途上です。弱点レベルに集中して取り組むことで、効率よく全体スコアを伸ばせます。',
  };
}

// ── レベルギャップ検出（アイデア9） ──────────────────────────────────────────
function detectGaps(breakdown: { level: number; probability: number }[]): { level: number; probability: number }[] {
  return breakdown.filter((item, i) => {
    const prev        = breakdown[i - 1]?.probability ?? item.probability;
    const next        = breakdown[i + 1]?.probability ?? item.probability;
    const neighborAvg = (prev + next) / 2;
    return neighborAvg - item.probability > 0.25;
  });
}

// ── 年代別学習アドバイス（定性的のみ・数値は実DBから取得） ────────────────────
const AGE_STUDY_TIPS: Record<string, { goalText: string; tipText: string }> = {
  '10代': {
    goalText: '大学受験・英検2級（B1）',
    tipText: '10代は語彙吸収が最も効率的な時期です。まず基礎語（Lv1〜3）を完全に固め、それが済んだら受験頻出の一般語（Lv4〜6）を集中強化しましょう。単語帳と英文読解の組み合わせが効果的です。',
  },
  '20代': {
    goalText: 'TOEIC 700〜・就職・グローバルビジネス（B2）',
    tipText: '就職・キャリアに直結する語彙力が重要な時期です。基礎〜一般語を土台として、学術語・ビジネス語（Lv7〜8）への橋渡しを意識しましょう。英語ニュースや専門書の多読が有効です。',
  },
  '30代': {
    goalText: 'ビジネス英語・社内外コミュニケーション（B2）',
    tipText: 'ビジネスで使える「実用語彙」の獲得が鍵です。基礎〜一般語が定着していれば、学術語（Lv7〜8）の範囲が実務に最も直結します。業界特有の専門語も意識して取り入れましょう。',
  },
  '40代': {
    goalText: '英語力の維持・実務活用（B1〜B2）',
    tipText: '語彙は継続的な接触で定着します。弱点レベルから順番に、既習語との関連付けを意識しながら取り組むことで効率よく習得できます。週単位で少しずつ積み上げる学習が持続しやすいです。',
  },
  '50代': {
    goalText: '語彙力の深化・教養英語（B1〜B2）',
    tipText: '深い語彙理解が強みになります。単語を文脈・語源と結びつけて覚えると定着しやすいです。まず未定着のレベルを確実に固めてから、上位レベルへ進みましょう。',
  },
  '60代以上': {
    goalText: '継続学習・知的探求（B1）',
    tipText: '語彙学習に遅すぎることはありません。毎日少しずつ弱点レベルの単語に接することが最大の近道です。好きな英語コンテンツ（映画・書籍・ニュース）を通じた自然な学習も効果的です。',
  },
};

// ── 弱点レベルのハイライト ────────────────────────────────────────────────────
const DEMO_MIN_COUNT = 5; // 比較表示に必要な最低データ件数

function WeaknessHighlight({
  breakdown,
  allShownWords,
  selectedIds,
  demographics,
  estimate,
}: {
  breakdown: { level: number; probability: number }[];
  allShownWords: Word[];
  selectedIds: Set<string>;
  demographics?: Demographics;
  estimate: number;
}) {
  const [demoStat, setDemoStat] = useState<DemographicStat | null>(null);

  useEffect(() => {
    if (!demographics) return;
    fetchDemographicStats()
      .then(stats => {
        const match = stats.find(
          s => s.age_group === demographics.ageGroup && s.gender === demographics.gender
        );
        setDemoStat(match ?? null);
      })
      .catch(() => setDemoStat(null));
  }, [demographics]);

  // カテゴリ別の平均既知率を計算
  const catAvg = CATEGORIES.map(cat => {
    const probs = (cat.levels as readonly number[]).map(lv => breakdown.find(b => b.level === lv)?.probability ?? 0);
    const avg = probs.reduce((s, p) => s + p, 0) / probs.length;
    return { cat, avg };
  });

  // 最優先学習レベル: 出題実単語があるレベルの中で最も既知率が低いもの
  const levelsWithWords = breakdown.filter(b =>
    allShownWords.some(w => !w.isDummy && w.level === b.level)
  );
  const priorityLevel = [...levelsWithWords].sort((a, b) => a.probability - b.probability)[0] ?? null;

  // 次のステップ: 基礎から順に「まだマスターしていない（avg < 0.8）」最初のカテゴリ
  // → 低レベルの穴を先に埋めることで上位レベルの習得効率が上がる
  const recommended = catAvg
    .filter(c => c.avg < 0.8)
    .sort((a, b) =>
      Math.min(...(a.cat.levels as unknown as number[])) -
      Math.min(...(b.cat.levels as unknown as number[]))
    )[0] ?? null;

  // 年代別アドバイス（定性的）
  const studyTip = demographics ? AGE_STUDY_TIPS[demographics.ageGroup] ?? null : null;

  // 同グループ比較（実DBデータ）
  const showDemoComp = demoStat !== null && demoStat.count >= DEMO_MIN_COUNT;
  const demoDiff     = showDemoComp && demoStat ? estimate - Math.round(demoStat.avg_estimate) : 0;

  // 習熟パターン分析（アイデア8）
  const pattern = analyzePattern(breakdown);
  // ギャップ検出（アイデア9）
  const gaps = detectGaps(breakdown);
  // 目的別ヒント（アイデア10）
  const purposeTip = demographics?.purpose ? PURPOSE_TIPS[demographics.purpose] ?? null : null;

  return (
    <div className="mb-10 border border-stone-200 bg-white p-6">
      <h4 className="font-bold text-stone-900 mb-5 text-sm uppercase tracking-wider">
        学習フィードバック
      </h4>

      {/* ⓪ 習熟パターン（アイデア8） */}
      <div className="flex items-start gap-3 mb-5 pb-5 border-b border-stone-100">
        <span className="text-[11px] font-medium bg-stone-900 text-white px-2 py-0.5 shrink-0 mt-0.5">
          {pattern.label}
        </span>
        <p className="text-sm text-stone-600">{pattern.message}</p>
      </div>

      {/* ⓪ ギャップ警告（アイデア9） */}
      {gaps.length > 0 && (
        <div className="border-l-4 border-stone-400 bg-stone-50 pl-4 py-3 mb-5">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">レベルギャップ検出</p>
          {gaps.map(g => (
            <p key={g.level} className="text-sm text-stone-700">
              Lv{g.level} の習熟度（{Math.round(g.probability * 100)}%）が前後のレベルと比べて大きく落ち込んでいます。集中的な復習をお勧めします。
            </p>
          ))}
        </div>
      )}

      {/* ① 最優先学習レベル（具体的な単語つき） */}
      {priorityLevel && Math.round(priorityLevel.probability * 100) < 80 && (
        <div className="bg-stone-50 border border-stone-200 p-4 mb-5">
          <p className="text-xs text-stone-400 uppercase tracking-wider mb-1">最優先学習レベル</p>
          <p className="font-bold text-stone-900 mb-2">
            Lv {priorityLevel.level} — 既知率 {Math.round(priorityLevel.probability * 100)}%
            <span className={`ml-2 text-xs font-normal ${proficiencyInfo(Math.round(priorityLevel.probability * 100)).cls} px-1.5 py-0.5 rounded`}>
              {proficiencyInfo(Math.round(priorityLevel.probability * 100)).label}
            </span>
          </p>
          {(() => {
            const levelWords   = allShownWords.filter(w => !w.isDummy && w.level === priorityLevel.level);
            const unknownWords = levelWords.filter(w => !selectedIds.has(w.id));
            const knownWords   = levelWords.filter(w =>  selectedIds.has(w.id));
            if (levelWords.length === 0) return null;
            return (
              <div className="space-y-3">
                {unknownWords.length > 0 && (
                  <div>
                    <p className="text-xs text-stone-500 mb-1.5">知らなかった単語（優先的に学習）:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {unknownWords.slice(0, 6).map(w => (
                        <span key={w.id} className="text-xs border border-stone-400 text-stone-700 px-2 py-0.5 font-medium">
                          {w.word}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {knownWords.length > 0 && (
                  <div>
                    <p className="text-xs text-stone-400 mb-1.5">知っていた単語:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {knownWords.map(w => (
                        <span key={w.id} className="text-xs text-stone-400 px-2 py-0.5">{w.word}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ② 実データによる同グループ比較（データ不足なら非表示） */}
      {showDemoComp && demoStat && demographics && (
        <div className="mb-5 border-l-2 border-stone-900 pl-4">
          <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">
            {demographics.ageGroup}・{demographics.gender} グループ比較
            <span className="ml-1 normal-case font-normal">（{demoStat.count}人のデータ）</span>
          </p>
          <p className="text-sm text-stone-700 leading-relaxed">
            同グループの平均語彙力は
            <span className="font-semibold text-stone-900 mx-1">
              {Math.round(demoStat.avg_estimate).toLocaleString()}語
            </span>
            です。あなたのスコア（{estimate.toLocaleString()}語）は
            <span className="font-semibold text-stone-900 ml-1">
              {demoDiff >= 0
                ? `平均より${Math.abs(demoDiff).toLocaleString()}語上`
                : `平均より${Math.abs(demoDiff).toLocaleString()}語下`}
            </span>
            です。
          </p>
        </div>
      )}

      {/* ③ 年代別アドバイス（定性的・常に表示） */}
      {studyTip && demographics && (
        <div className="mb-5">
          <p className="text-xs text-stone-400 uppercase tracking-wider mb-1">
            {demographics.ageGroup}向け 学習目標の目安
          </p>
          <p className="text-xs font-medium text-stone-700 mb-2">{studyTip.goalText}</p>
          <p className="text-sm text-stone-600 leading-relaxed">{studyTip.tipText}</p>
        </div>
      )}

      {/* ④ カテゴリ別の習熟状況サマリー */}
      <div className="mb-5">
        <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">カテゴリ習熟サマリー</p>
        <div className="space-y-1">
          {catAvg.map(({ cat, avg }) => {
            const pct  = Math.round(avg * 100);
            const info = proficiencyInfo(pct);
            const isFrontier = recommended?.cat.label === cat.label;
            return (
              <div key={cat.label} className={`flex items-center gap-2 py-1 px-2 ${isFrontier ? 'bg-stone-50' : ''}`}>
                <span className="text-xs text-stone-500 w-16 shrink-0">{cat.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${info.cls}`}>{info.label}</span>
                <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColorCls(pct)}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-mono text-stone-500 w-8 text-right shrink-0">{pct}%</span>
                {isFrontier && (
                  <span className="text-[10px] text-stone-900 font-medium shrink-0">← 次の目標</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ⑤ 次のステップ（基礎から順に推奨 → アドバイスと整合） */}
      {recommended && (
        <div className="border-t border-stone-100 pt-4">
          <p className="text-xs text-stone-400 uppercase tracking-wider mb-1">次のステップ</p>
          <p className="text-sm text-stone-700">
            <span className="font-medium">
              「{recommended.cat.label}（Lv {(recommended.cat.levels as readonly number[]).join('–')}）」
            </span>
            の強化が最も効果的です。
          </p>
          {(() => {
            const catIndex = catAvg.findIndex(c => c.cat.label === recommended.cat.label);
            const prevCat  = catIndex > 0 ? catAvg[catIndex - 1] : null;
            const prevMastered = prevCat && prevCat.avg >= 0.8;
            if (prevMastered) {
              return (
                <p className="text-xs text-stone-400 mt-1">
                  {prevCat.cat.label}（Lv {(prevCat.cat.levels as readonly number[]).join('–')}）は
                  習得済みです。次のステージへ進む準備ができています。
                </p>
              );
            }
            return null;
          })()}
        </div>
      )}

      {/* ⑥ 学習目的別ヒント（アイデア10） */}
      {purposeTip && demographics?.purpose && (
        <div className="border-t border-stone-100 pt-4 mt-4">
          <p className="text-xs text-stone-400 uppercase tracking-wider mb-1">
            目的別ヒント — {demographics.purpose}
          </p>
          <p className="text-sm text-stone-600 leading-relaxed">{purposeTip}</p>
        </div>
      )}
    </div>
  );
}

// ── レベル別棒グラフ ─────────────────────────────────────────────────────────
const MAX_BAR_PX = 80;

function LevelBarChart({ breakdown }: { breakdown: { level: number; probability: number }[] }) {
  const [prevBreakdown, setPrevBreakdown] = useState<{ level: number; probability: number }[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const hist = JSON.parse(raw) as TestHistoryEntry[];
      if (hist.length >= 2) {
        const prev = hist[hist.length - 2];
        if (prev.result?.levelBreakdown) setPrevBreakdown(prev.result.levelBreakdown);
      }
    } catch { /* no-op */ }
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-bold text-stone-900 text-sm uppercase tracking-wider">
          レベル別 既知語率
        </h4>
        {prevBreakdown && (
          <span className="text-[10px] text-stone-400">↑↓ 前回比</span>
        )}
      </div>
      <div className="flex items-end gap-1.5" style={{ height: MAX_BAR_PX + 56 }}>
        {breakdown.map(({ level, probability }) => {
          const pct   = Math.round(probability * 100);
          const barPx = Math.max(2, Math.round(probability * MAX_BAR_PX));
          const prevPct = prevBreakdown
            ? Math.round((prevBreakdown.find(b => b.level === level)?.probability ?? probability) * 100)
            : null;
          const delta = prevPct !== null ? pct - prevPct : null;
          return (
            <div
              key={level}
              className="flex-1 flex flex-col items-center"
              style={{ height: '100%', justifyContent: 'flex-end' }}
            >
              {/* 前回比 */}
              <span className={`text-[8px] font-mono leading-none mb-0.5 ${
                delta === null || delta === 0 ? 'invisible' :
                delta > 0 ? 'text-stone-600' : 'text-stone-400'
              }`}>
                {delta !== null && delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : '0'}
              </span>
              {/* % */}
              <span className="text-[9px] text-stone-500 font-mono leading-none mb-1">
                {pct}%
              </span>
              {/* バー（習熟度でシェード） */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: barPx }}
                transition={{ duration: 0.7, delay: level * 0.05, ease: 'easeOut' }}
                className={`w-full rounded-t-sm ${barColorCls(pct)}`}
              />
              {/* レベル番号 */}
              <span className="text-[9px] text-stone-400 font-mono leading-none mt-1.5">
                {level}
              </span>
              {/* 習熟度短縮ラベル */}
              <span className="text-[8px] text-stone-400 leading-none mt-0.5">
                {shortLabel(pct)}
              </span>
            </div>
          );
        })}
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
        {([
          ['習得済み', 'bg-stone-900'],
          ['ほぼ習得', 'bg-stone-700'],
          ['定着途上', 'bg-stone-500'],
          ['学習中',   'bg-stone-300'],
          ['未習得',   'bg-stone-200'],
        ] as [string, string][]).map(([label, cls]) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded-sm shrink-0 ${cls}`} />
            <span className="text-[9px] text-stone-400">{label}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-400 mt-2">
        IRT（ラッシュモデル）による各レベルの推定既知割合。凡例は習熟度の目安。
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

// ── ランキング位置グラフ ──────────────────────────────────────────────────────
const RANK_BUCKETS = 20; // 各棒 = 5パーセンタイル幅

// 逆正規CDF近似（Beasley-Springer-Moro法）
function invNorm(p: number): number {
  if (p <= 0.001) return -3.5;
  if (p >= 0.999) return  3.5;
  const t  = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));
  const z  = (2.515517 + 0.802853 * t + 0.010328 * t * t)
           / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return p < 0.5 ? -(t - z) : (t - z);
}

// パーセンタイル位置 p（0〜1）における人口密度
// = φ(Φ⁻¹(p))  ←「そのランク帯にどれだけ人が集中しているか」
// 正規分布なら中央付近が最大、上位・下位の極端な位置は低くなる
function rankDensity(p: number): number {
  const z = invNorm(p);
  return Math.exp(-0.5 * z * z);
}

function RankingDistributionChart({
  percentile,
  label,
}: {
  estimate:   number;
  median:     number;
  percentile: number;
  label:      string;
}) {
  const userBucket  = Math.min(Math.floor(percentile / (100 / RANK_BUCKETS)), RANK_BUCKETS - 1);
  const MAX_BAR_PX  = 72;

  const buckets = Array.from({ length: RANK_BUCKETS }, (_, i) => {
    const center = (i + 0.5) / RANK_BUCKETS; // バケット中心（0〜1）
    return { height: rankDensity(center), isUser: i === userBucket };
  });
  const maxH = Math.max(...buckets.map(b => b.height));

  const topPct      = 100 - percentile;
  const topPctLabel = topPct < 1 ? '上位 1% 以内' : `上位 ${topPct.toFixed(1)}%`;

  return (
    <div className="mb-1">
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-serif font-bold text-stone-900">{topPctLabel}</span>
        <span className="text-xs text-stone-400">{label}</span>
      </div>

      {/* 位置棒グラフ（高さ = そのランク帯の人口密度） */}
      <div className="relative" style={{ height: MAX_BAR_PX }}>
        <div className="flex items-end gap-px h-full">
          {buckets.map((b, i) => {
            const barH = Math.max(3, Math.round((b.height / maxH) * MAX_BAR_PX));
            return (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: barH }}
                transition={{ duration: 0.5, delay: i * 0.025, ease: 'easeOut' }}
                className={`flex-1 ${b.isUser ? 'bg-stone-900' : 'bg-stone-200'}`}
              />
            );
          })}
        </div>

        {/* 中央値（50パーセンタイル）の赤縦線 */}
        <div
          className="absolute top-0 bottom-0 w-px bg-red-400 pointer-events-none"
          style={{ left: '50%' }}
        />
      </div>

      {/* 軸ラベル */}
      <div className="relative mt-1">
        <div className="flex justify-between text-[10px] text-stone-400">
          <span>下位</span>
          <span>上位</span>
        </div>
        <div
          className="absolute top-0 text-[10px] text-red-400 -translate-x-1/2 whitespace-nowrap"
          style={{ left: '50%' }}
        >
          中央値
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-stone-900 shrink-0" />
          <span className="text-[10px] text-stone-500">あなたの位置</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-px h-3 bg-red-400 shrink-0" />
          <span className="text-[10px] text-stone-500">中央値</span>
        </div>
      </div>
    </div>
  );
}

function RankingSection({ estimate, demographics }: { estimate: number; demographics?: Demographics }) {
  const [overall,    setOverall]    = useState<RankingStats     | null>(null);
  const [demoStats,  setDemoStats]  = useState<DemoRankingStats | null>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const p1 = fetchRankingStats(estimate).then(setOverall).catch(() => {});
    const p2 = demographics
      ? fetchDemoRankingStats(estimate, demographics.ageGroup, demographics.gender)
          .then(setDemoStats).catch(() => {})
      : Promise.resolve();
    Promise.all([p1, p2]).finally(() => setLoading(false));
  }, [estimate, demographics]);

  if (loading) {
    return (
      <div className="border border-stone-200 bg-white p-6 mb-10">
        <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">ランキング</h4>
        <p className="text-stone-400 text-sm">集計中...</p>
      </div>
    );
  }

  if (!overall || overall.total === 0) {
    return (
      <div className="border border-stone-200 bg-white p-6 mb-10">
        <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">ランキング</h4>
        <p className="text-stone-500 text-sm">まだ十分なデータがありません。あなたが先駆者です！</p>
      </div>
    );
  }

  return (
    <div className="border border-stone-200 bg-white p-6 mb-10">
      <h4 className="font-bold text-stone-900 mb-5 text-sm uppercase tracking-wider">ランキング</h4>

      {/* 全体ランキング */}
      <div className="mb-5">
        <RankingDistributionChart
          estimate={estimate}
          median={overall.median}
          percentile={overall.percentile}
          label="全体"
        />
        <div className="grid grid-cols-2 gap-4 text-sm mt-4">
          <div>
            <p className="text-stone-400 text-xs uppercase tracking-wider mb-0.5">全体中央値</p>
            <p className="font-medium text-stone-900">{Math.round(overall.median).toLocaleString()} 語</p>
          </div>
          <div>
            <p className="text-stone-400 text-xs uppercase tracking-wider mb-0.5">参加者数</p>
            <p className="font-medium text-stone-900">{overall.total.toLocaleString()} 人</p>
          </div>
        </div>
      </div>

      {/* 同年代・同性別ランキング */}
      {demographics && demoStats && demoStats.total >= 3 && (
        <div className="border-t border-stone-100 pt-5">
          <RankingDistributionChart
            estimate={estimate}
            median={demoStats.median}
            percentile={demoStats.percentile}
            label={`${demographics.ageGroup} ${demographics.gender}`}
          />
          <div className="grid grid-cols-2 gap-4 text-sm mt-4">
            <div>
              <p className="text-stone-400 text-xs uppercase tracking-wider mb-0.5">同グループ中央値</p>
              <p className="font-medium text-stone-900">{Math.round(demoStats.median).toLocaleString()} 語</p>
            </div>
            <div>
              <p className="text-stone-400 text-xs uppercase tracking-wider mb-0.5">同グループ参加者</p>
              <p className="font-medium text-stone-900">{demoStats.total.toLocaleString()} 人</p>
            </div>
          </div>
        </div>
      )}
      {demographics && (!demoStats || demoStats.total < 3) && (
        <div className="border-t border-stone-100 pt-4">
          <p className="text-xs text-stone-400 italic">
            {demographics.ageGroup}・{demographics.gender} のデータがまだ少ないため同グループ比較は表示されません。
          </p>
        </div>
      )}
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
    { label: 'TOEIC (推測目安)', value: cefrRow.toeic },
    { label: '英検 (推測目安)', value: cefrRow.eiken },
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
  y += 58;
  // バッジ下の免責注記
  ctx.font = '9px Arial, sans-serif';
  ctx.fillStyle = '#a8a29e';
  ctx.textAlign = 'left';
  ctx.fillText('※ TOEIC・英検の換算は語彙力に基づく推測・目安です。各試験の公式換算ではありません。', PAD, y);
  y += 18;

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
function ExportButtons({
  result,
  allShownWords,
  selectedIds,
}: {
  result: VocabResult;
  allShownWords: Word[];
  selectedIds: Set<string>;
}) {
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

  // アイデア5: 知らなかった単語のCSVダウンロード
  const downloadCSV = () => {
    const unknownWords = allShownWords.filter(w => !w.isDummy && !selectedIds.has(w.id));
    if (unknownWords.length === 0) return;
    const csv = 'word,level\n' + unknownWords.map(w => `${w.word},${w.level}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'unknown_words.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // アイデア19: Anki形式エクスポート（タブ区切りテキスト）
  const downloadAnki = () => {
    const unknownWords = allShownWords.filter(w => !w.isDummy && !selectedIds.has(w.id));
    if (unknownWords.length === 0) return;
    const tsv  = unknownWords.map(w => `${w.word}\tLv${w.level}（英語語彙力テスト）`).join('\n');
    const blob = new Blob([tsv], { type: 'text/plain;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'anki_words.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const unknownCount = allShownWords.filter(w => !w.isDummy && !selectedIds.has(w.id)).length;

  return (
    <div className="mb-12">
      <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">結果を保存</h4>
      <div className="flex flex-wrap gap-3 mb-4">
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
      {unknownCount > 0 && (
        <div>
          <p className="text-xs text-stone-400 mb-2">
            知らなかった単語 {unknownCount} 語を書き出す
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={downloadCSV}
              className="border border-stone-300 text-stone-700 hover:bg-stone-900 hover:text-white hover:border-stone-900 text-sm font-medium py-2 px-4 transition-colors"
            >
              CSV ダウンロード
            </button>
            <button
              onClick={downloadAnki}
              className="border border-stone-300 text-stone-700 hover:bg-stone-900 hover:text-white hover:border-stone-900 text-sm font-medium py-2 px-4 transition-colors"
            >
              Anki 用エクスポート
            </button>
          </div>
          <p className="text-xs text-stone-400 mt-1.5">
            Anki 用ファイルはタブ区切り形式です。裏面に日本語訳を追加してお使いください。
          </p>
        </div>
      )}
    </div>
  );
}

// ── SNS シェア ────────────────────────────────────────────────────────────────
function ShareSection({ result }: { result: VocabResult }) {
  const hidden = window.location.hash.includes('snsnone');
  if (hidden) return null;

  const cefrRow = getCefrRow(result.estimate);
  const pageUrl = window.location.href.replace(/#.*$/, '');
  const text = [
    `英語語彙力テストの結果：推定 ${result.estimate.toLocaleString()} 語（CEFR ${cefrRow.cefr}）でした！`,
    `TOEIC ${cefrRow.toeic} / 英検 ${cefrRow.eiken} 相当`,
    '',
    pageUrl,
    '#英語語彙力テスト #英語学習',
  ].join('\n');

  return (
    <div className="mb-10">
      <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">結果をシェア</h4>
      <a
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 border border-stone-300 text-stone-700 hover:bg-stone-900 hover:text-white hover:border-stone-900 text-sm font-medium py-2.5 px-5 transition-colors"
      >
        <span className="font-bold text-base leading-none">𝕏</span>
        Twitter / X でシェア
      </a>
    </div>
  );
}

// ── 自己評価（アイデア24） ────────────────────────────────────────────────────
function SelfEvaluationSection({ result, demographics }: { result: VocabResult; demographics?: Demographics }) {
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);

  const handleEval = async (evaluation: SelfEvaluation) => {
    setLoading(true);
    await submitSelfEvaluation(result.estimate, evaluation, demographics);
    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="mb-10 border border-stone-200 bg-white p-6">
        <p className="text-sm text-stone-500">フィードバックありがとうございます。今後の精度向上に役立てます。</p>
      </div>
    );
  }

  return (
    <div className="mb-10 border border-stone-200 bg-white p-6">
      <h4 className="font-bold text-stone-900 mb-3 text-sm uppercase tracking-wider">
        この結果はあなたの感覚と合っていますか？
      </h4>
      <div className="flex gap-3 flex-wrap">
        {(['高すぎる', 'だいたい正確', '低すぎる'] as SelfEvaluation[]).map(ev => (
          <button
            key={ev}
            onClick={() => handleEval(ev)}
            disabled={loading}
            className="border border-stone-300 text-stone-700 hover:bg-stone-900 hover:text-white hover:border-stone-900 text-sm font-medium py-2.5 px-5 transition-colors disabled:opacity-40"
          >
            {ev}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 実スコア入力（アイデア23） ────────────────────────────────────────────────
const EIKEN_LEVELS = ['なし', '5級', '4級', '3級', '準2級', '2級', '準1級', '1級'] as const;

function RealScoreSection({ result, demographics }: { result: VocabResult; demographics?: Demographics }) {
  const [toeicScore, setToeicScore] = useState('');
  const [eikenLevel, setEikenLevel] = useState<string>('なし');
  const [submitted,  setSubmitted]  = useState(false);
  const [loading,    setLoading]    = useState(false);

  const canSubmit = toeicScore !== '' || eikenLevel !== 'なし';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const toeic = toeicScore !== '' ? parseInt(toeicScore, 10) : null;
    const eiken = eikenLevel !== 'なし' ? eikenLevel : null;
    await submitRealScore(result.estimate, toeic, eiken, demographics);
    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="mb-10 border border-stone-200 bg-white p-6">
        <p className="text-sm text-stone-500">ご協力ありがとうございました。データはスコア精度向上に活用します。</p>
      </div>
    );
  }

  return (
    <div className="mb-10 border border-stone-200 bg-white p-6">
      <h4 className="font-bold text-stone-900 mb-2 text-sm uppercase tracking-wider">
        実際のスコアを教えてください
        <span className="text-xs font-normal text-stone-400 ml-2">（任意）</span>
      </h4>
      <p className="text-xs text-stone-400 mb-5">
        入力いただいたデータは今後の推定精度向上に活用します。個人を特定する情報は含まれません。
      </p>
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs text-stone-500 block mb-1">TOEIC スコア</label>
          <input
            type="number"
            min="0"
            max="990"
            value={toeicScore}
            onChange={e => setToeicScore(e.target.value)}
            placeholder="例: 750"
            className="border border-stone-300 text-stone-900 text-sm py-2 px-3 w-28 focus:outline-none focus:border-stone-600"
          />
          <span className="text-xs text-stone-400 ml-1">点</span>
        </div>
        <div>
          <label className="text-xs text-stone-500 block mb-1">英検</label>
          <select
            value={eikenLevel}
            onChange={e => setEikenLevel(e.target.value)}
            className="border border-stone-300 text-stone-900 text-sm py-2 px-3 focus:outline-none focus:border-stone-600"
          >
            {EIKEN_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="border border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white text-sm font-medium py-2 px-5 transition-colors disabled:opacity-40"
        >
          {loading ? '送信中...' : '送信する'}
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
  demographics?: Demographics;
}

export function ResultView({ result, allShownWords, selectedIds, onRetry, isHistory = false, demographics }: Props) {
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

        {/* ── SNS シェア ── */}
        <ShareSection result={result} />

        {/* ── ランキング ── */}
        <RankingSection estimate={estimate} demographics={demographics} />

        {/* ── 学習フィードバック（機能12） ── */}
        <WeaknessHighlight
          breakdown={levelBreakdown}
          allShownWords={allShownWords}
          selectedIds={selectedIds}
          demographics={demographics}
          estimate={estimate}
        />

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
            <p className="text-xs text-stone-400 mt-1">
              TOEIC・英検欄は語彙力から推測した参考値です。実際のスコアとは異なります。
            </p>
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
              ※ TOEIC・英検の換算は、語彙力スコアに基づく<strong className="font-medium">推測・参考目安</strong>です。各試験の公式換算ではなく、実際のスコアを保証するものではありません。
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

        {/* ── 自己評価（アイデア24）：新規テスト完了時のみ ── */}
        {!isHistory && (
          <SelfEvaluationSection result={result} demographics={demographics} />
        )}

        {/* ── 実スコア入力（アイデア23）：新規テスト完了時のみ ── */}
        {!isHistory && (
          <RealScoreSection result={result} demographics={demographics} />
        )}

        {/* ── エクスポート ── */}
        <ExportButtons result={result} allShownWords={allShownWords} selectedIds={selectedIds} />

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
