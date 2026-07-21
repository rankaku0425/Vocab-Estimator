import { Word, VocabResult } from './types';

// 単語のレベル(1〜10)をIRTの難易度パラメータ(b)に変換
// 平均的なレベル5.5を0とし、標準偏差的なスケールに調整
export function levelToDifficulty(level: number): number {
  return (level - 5.5) * 0.8;
}

// 単語の難易度パラメータを取得（DBのb_paramを優先、なければlevelから計算）
function getDifficulty(w: { level: number; b_param?: number }): number {
  return w.b_param ?? levelToDifficulty(w.level);
}

// 1パラメータロジスティックモデル（ラッシュモデル）
// 能力θの人が、難易度bの単語を知っている確率を計算
function probKnowWord(theta: number, b: number): number {
  return 1 / (1 + Math.exp(-(theta - b)));
}

// グリッドサーチによるMAP推定（最大事後確率推定）
// ユーザーの回答パターンから最も尤もらしい能力値(θ)を推定
export function estimateTheta(shownReals: Word[], selectedIds: Set<string>): number {
  if (shownReals.length === 0) return 0;

  let bestTheta = 0;
  let maxLogLikelihood = -Infinity;

  // -5.0 から 5.0 まで 0.1 刻みでθを探索
  for (let theta = -5; theta <= 5; theta += 0.1) {
    let logLikelihood = 0;
    
    // 事前分布（標準正規分布）を加味して、全問正解・全問不正解時にθが無限大に発散するのを防ぐ
    const prior = -0.5 * theta * theta; 
    logLikelihood += prior;

    for (const w of shownReals) {
      const b = getDifficulty(w);
      const p = probKnowWord(theta, b);
      const pSafe = Math.max(1e-10, Math.min(1 - 1e-10, p));
      
      if (selectedIds.has(w.id)) {
        logLikelihood += Math.log(pSafe);
      } else {
        logLikelihood += Math.log(1 - pSafe);
      }
    }

    if (logLikelihood > maxLogLikelihood) {
      maxLogLikelihood = logLikelihood;
      bestTheta = theta;
    }
  }

  return bestTheta;
}

// Fisher情報量に基づくθの標準誤差
// SE(θ) = 1 / sqrt( Σ P_i(1-P_i) + 1 )  ※ +1 は正規事前分布の寄与
function standardErrorOfTheta(theta: number, shownReals: Word[]): number {
  let information = 1; // 正規事前分布 N(0,1) による安定化項
  for (const w of shownReals) {
    const b = getDifficulty(w);
    const p = probKnowWord(theta, b);
    information += p * (1 - p);
  }
  return 1 / Math.sqrt(information);
}

// 各レベルの既知確率を返す（棒グラフ用）
export function getLevelBreakdown(theta: number): { level: number; probability: number }[] {
  return Array.from({ length: 10 }, (_, i) => {
    const level = i + 1;
    return { level, probability: probKnowWord(theta, levelToDifficulty(level)) };
  });
}

// 点推定 + 95%信頼区間 + レベル内訳を一括返却
export function estimateWithCI(shownWords: Word[], selectedIds: Set<string>): VocabResult {
  const shownReals = shownWords.filter(w => !w.isDummy);
  const theta = estimateTheta(shownReals, selectedIds);
  const se    = standardErrorOfTheta(theta, shownReals);

  // ダミーペナルティ係数（点推定・CI 上下限で共通）
  const dummyShown = shownWords.filter(w => w.isDummy);
  const dummyRatio = dummyShown.length > 0
    ? dummyShown.filter(w => selectedIds.has(w.id)).length / dummyShown.length
    : 0;
  const penaltyFactor = Math.max(0, 1 - dummyRatio * 1.5);

  const vocabFromTheta = (t: number): number => {
    let total = 0;
    for (let level = 1; level <= 10; level++) {
      total += probKnowWord(t, levelToDifficulty(level)) * 1000;
    }
    return Math.round(total * penaltyFactor);
  };

  return {
    estimate:       vocabFromTheta(theta),
    lower:          vocabFromTheta(theta - 1.96 * se),
    upper:          vocabFromTheta(theta + 1.96 * se),
    theta,
    levelBreakdown: getLevelBreakdown(theta),
  };
}

export function estimateVocabulary(shownWords: Word[], selectedIds: Set<string>): number {
  const shownReals = shownWords.filter(w => !w.isDummy);
  const theta = estimateTheta(shownReals, selectedIds);

  let totalEstimate = 0;
  // 各レベル1000語として、推定されたθをもとに各レベルの知っている割合（期待値）を計算
  for (let level = 1; level <= 10; level++) {
    const b = levelToDifficulty(level);
    const p = probKnowWord(theta, b);
    totalEstimate += p * 1000;
  }

  // ダミー単語によるペナルティ計算
  const dummyShown = shownWords.filter(w => w.isDummy);
  if (dummyShown.length > 0) {
    const dummySelectedCount = dummyShown.filter(w => selectedIds.has(w.id)).length;
    const dummyRatio = dummySelectedCount / dummyShown.length;
    // ダミーを選んでしまった場合、ペナルティを強めにかける
    totalEstimate = totalEstimate * Math.max(0, 1 - dummyRatio * 1.5);
  }

  return Math.round(totalEstimate);
}

export function selectNextWords(
  allWords: Word[],
  dummyWords: Word[],
  shownWords: Word[],
  selectedIds: Set<string>
): Word[] {
  const NUM_TOTAL = 20;
  const NUM_DUMMIES = 2;
  const NUM_REALS = NUM_TOTAL - NUM_DUMMIES;

  // 実在単語の選定
  const shownReals = shownWords.filter(w => !w.isDummy);
  const shownRealIds = new Set(shownReals.map(w => w.id));
  const availableReals = allWords.filter(w => !shownRealIds.has(w.id));
  
  let pickedReals: Word[] = [];

  if (shownReals.length === 0) {
    // 最初のステップ: 様々な難易度を幅広く出題して初期θの推定精度を上げる
    const targets = [1, 1, 3, 3, 5, 5, 7, 7, 9, 9, 2, 4, 6, 8, 10, 1, 5, 9];
    const shuffledUnshown = [...availableReals].sort(() => Math.random() - 0.5);
    
    for (const level of targets) {
      if (pickedReals.length >= NUM_REALS) break;
      const index = shuffledUnshown.findIndex(w => w.level === level);
      if (index !== -1) {
        pickedReals.push(shuffledUnshown.splice(index, 1)[0]);
      }
    }
    while (pickedReals.length < NUM_REALS && shuffledUnshown.length > 0) {
      pickedReals.push(shuffledUnshown.pop()!);
    }
  } else {
    // コンピュータ適応型テスト（CAT）のアプローチ
    const theta = estimateTheta(shownReals, selectedIds);
    
    // 項目情報量が最大になる単語（難易度bが現在の能力θに最も近い単語）を優先的に出題する
    const scoredReals = availableReals.map(w => {
      const b = getDifficulty(w);
      const distance = Math.abs(theta - b);
      // 同じレベルばかりにならないように少量のランダムノイズを加える
      const randomizedDistance = distance + (Math.random() * 0.4); 
      return { word: w, score: randomizedDistance };
    });

    scoredReals.sort((a, b) => a.score - b.score);
    pickedReals = scoredReals.slice(0, NUM_REALS).map(x => x.word);
  }

  // ── ダミー単語の選定（θに応じた複雑さの疑似語を選ぶ）──────────────────
  // DB上の疑似語 level: 2=シンプル / 5=ミディアム / 8=コンプレックス / 0=旧形式
  // θ < -1.5 → シンプル疑似語, -1.5〜1.5 → ミディアム, θ > 1.5 → コンプレックス
  const theta = shownReals.length > 0 ? estimateTheta(shownReals, selectedIds) : 0;
  const preferredDummyLevel = theta < -1.5 ? 2 : theta > 1.5 ? 8 : 5;

  const shownDummyIds = new Set(shownWords.filter(w => w.isDummy).map(w => w.id));
  const availableDummies = dummyWords.filter(w => !shownDummyIds.has(w.id));

  // 好ましい複雑さのダミーを優先し、足りなければ全体から補充
  const preferredPool = availableDummies.filter(
    w => w.level === preferredDummyLevel || w.level === 0
  );
  const dummyPool = preferredPool.length >= NUM_DUMMIES ? preferredPool : availableDummies;
  const pickedDummies = [...dummyPool].sort(() => Math.random() - 0.5).slice(0, NUM_DUMMIES);

  // シャッフルして返す
  const combined = [...pickedReals, ...pickedDummies];
  return combined.sort(() => Math.random() - 0.5);
}
