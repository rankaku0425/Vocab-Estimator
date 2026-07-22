export interface Word {
  id: string;
  word: string;
  level: number;
  b_param?: number;
  isDummy?: boolean;
}

export type ViewState = 'start' | 'test' | 'stepResult' | 'finalResult' | 'historyResult';

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
