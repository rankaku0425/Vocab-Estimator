export interface Word {
  id: string;
  word: string;
  level: number;
  b_param?: number;
  isDummy?: boolean;
}

export type ViewState = 'start' | 'test' | 'stepResult' | 'finalResult';

export interface VocabResult {
  estimate: number;
  lower: number;
  upper: number;
  theta: number;
  levelBreakdown: { level: number; probability: number }[];
}
