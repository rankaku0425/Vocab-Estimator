export interface Word {
  id: string;
  word: string;
  level: number;
  b_param?: number;
  isDummy?: boolean;
}

export type AgeGroup = '10代' | '20代' | '30代' | '40代' | '50代' | '60代以上';
export type Gender   = '男性' | '女性' | 'その他';

export interface Demographics {
  ageGroup: AgeGroup;
  gender:   Gender;
}

export type ViewState = 'start' | 'survey' | 'test' | 'stepResult' | 'finalResult' | 'historyResult';

export interface VocabResult {
  estimate: number;
  lower: number;
  upper: number;
  theta: number;
  levelBreakdown: { level: number; probability: number }[];
}

export interface TestHistoryEntry {
  estimate: number;
  date: string; // ISO string
  result?: VocabResult;
  allShownWords?: Word[];
  selectedIds?: string[];
}
