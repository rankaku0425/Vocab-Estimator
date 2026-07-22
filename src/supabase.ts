import { createClient } from '@supabase/supabase-js';
import { Word, VocabResult, Demographics } from './types';

export type SelfEvaluation = '高すぎる' | 'だいたい正確' | '低すぎる';

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL    as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── 単語取得 ──────────────────────────────────────────────────────────────────
export async function fetchWords(): Promise<{ wordList: Word[]; dummyWords: Word[] }> {
  const { data, error } = await supabase
    .from('words')
    .select('id, word, level, b_param, is_dummy');

  if (error) throw error;

  const wordList: Word[]   = [];
  const dummyWords: Word[] = [];

  for (const row of data) {
    const word: Word = {
      id:      row.id,
      word:    row.word,
      level:   row.level,
      b_param: row.b_param,
      isDummy: row.is_dummy,
    };
    if (row.is_dummy) dummyWords.push(word);
    else              wordList.push(word);
  }

  return { wordList, dummyWords };
}

// ── 回答ログ記録 ──────────────────────────────────────────────────────────────
export async function logResponses(
  words: Word[],
  selectedIds: Set<string>,
  userTheta: number
): Promise<void> {
  const logs = words.map(w => ({
    word_id:    w.id,
    selected:   selectedIds.has(w.id),
    user_theta: userTheta,
  }));
  const { error } = await supabase.from('response_logs').insert(logs);
  if (error) console.error('回答ログの書き込みに失敗しました:', error);
}

// ── ランキング：スコア送信 ────────────────────────────────────────────────────
export async function submitScore(result: VocabResult, demographics?: Demographics): Promise<void> {
  const { error } = await supabase.from('scores').insert({
    estimate:  result.estimate,
    lower:     result.lower,
    upper:     result.upper,
    age_group: demographics?.ageGroup ?? null,
    gender:    demographics?.gender   ?? null,
    purpose:   demographics?.purpose  ?? null,
  });
  if (error) console.error('スコア送信に失敗しました:', error);
}

// ── ランキング：統計取得 ──────────────────────────────────────────────────────
export interface RankingStats {
  total:      number;
  percentile: number;  // 0〜100 (下位何%か)
  median:     number;
}

export async function fetchRankingStats(estimate: number): Promise<RankingStats> {
  const { data, error } = await supabase
    .rpc('get_ranking_stats', { p_estimate: estimate });
  if (error) throw error;
  return data as RankingStats;
}

// ── ランキング：同年代・同性別統計 ───────────────────────────────────────────
export interface DemoRankingStats {
  total:      number;
  percentile: number;
  median:     number;
}

export async function fetchDemoRankingStats(
  estimate:  number,
  ageGroup:  string,
  gender:    string,
): Promise<DemoRankingStats> {
  const { data, error } = await supabase
    .rpc('get_demo_ranking_stats', {
      p_estimate:  estimate,
      p_age_group: ageGroup,
      p_gender:    gender,
    });
  if (error) throw error;
  return data as DemoRankingStats;
}

// ── 実スコア送信（アイデア23） ────────────────────────────────────────────────
export async function submitRealScore(
  vocabEstimate: number,
  toeicScore:    number | null,
  eikenLevel:    string | null,
  demographics?: Demographics,
): Promise<void> {
  const { error } = await supabase.from('real_scores').insert({
    vocab_estimate: vocabEstimate,
    toeic_score:    toeicScore,
    eiken_level:    eikenLevel,
    age_group:      demographics?.ageGroup ?? null,
    gender:         demographics?.gender   ?? null,
    purpose:        demographics?.purpose  ?? null,
  });
  if (error) console.error('実スコア送信失敗:', error);
}

// ── 自己評価送信（アイデア24） ────────────────────────────────────────────────
export async function submitSelfEvaluation(
  estimate:      number,
  evaluation:    SelfEvaluation,
  demographics?: Demographics,
): Promise<void> {
  const { error } = await supabase.from('self_evaluations').insert({
    estimate,
    evaluation,
    age_group: demographics?.ageGroup ?? null,
    gender:    demographics?.gender   ?? null,
    purpose:   demographics?.purpose  ?? null,
  });
  if (error) console.error('自己評価送信失敗:', error);
}

// ── 管理：年代・性別別統計 ────────────────────────────────────────────────────
export interface DemographicStat {
  age_group:       string;
  gender:          string;
  count:           number;
  avg_estimate:    number;
  median_estimate: number;
  min_estimate:    number;
  max_estimate:    number;
}

export async function fetchDemographicStats(): Promise<DemographicStat[]> {
  const { data, error } = await supabase.rpc('get_demographic_stats');
  if (error) throw error;
  return (data as DemographicStat[]) ?? [];
}

// ── 管理：単語統計取得（word_stats ビュー） ───────────────────────────────────
export interface WordStat {
  id:                string;
  word:              string;
  level:             number;
  b_param:           number;
  response_count:    number;
  mean_theta:        number;
  correct_rate:      number;
  proposed_b:        number;
  calibration_ready: boolean;
}

export async function fetchWordStats(): Promise<WordStat[]> {
  const { data, error } = await supabase
    .from('word_stats')
    .select('*')
    .order('level')
    .order('word');
  if (error) throw error;
  return data as WordStat[];
}

// ── 管理：キャリブレーション実行 ─────────────────────────────────────────────
export async function runCalibration(): Promise<number> {
  const { data, error } = await supabase.rpc('run_calibration');
  if (error) throw error;
  return data as number;
}

// ── 管理：b_param 更新 ────────────────────────────────────────────────────────
export async function updateWordBParam(id: string, b_param: number): Promise<void> {
  const { error } = await supabase.from('words').update({ b_param }).eq('id', id);
  if (error) throw error;
}

// ── 管理：単語追加 ────────────────────────────────────────────────────────────
export async function addWord(word: string, level: number): Promise<void> {
  const b_param = (level - 5.5) * 0.8;
  const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await supabase.from('words').insert({ id, word, level, b_param, is_dummy: false });
  if (error) throw error;
}

// ── 管理：単語削除 ────────────────────────────────────────────────────────────
export async function deleteWord(id: string): Promise<void> {
  const { error } = await supabase.from('words').delete().eq('id', id);
  if (error) throw error;
}
