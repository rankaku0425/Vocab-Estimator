export interface Word {
  id: string;
  word: string;
  level: number;
  b_param?: number;
  isDummy?: boolean;
}

export type AgeGroup = '10代' | '20代' | '30代' | '40代' | '50代' | '60代以上';
export type Gender   = '男性' | '女性' | 'その他';
export type Purpose  = '受験・資格取得' | '仕事・ビジネス' | '海外留学・移住' | '趣味・自己啓発';

export interface Demographics {
  ageGroup: AgeGroup;
  gender:   Gender;
  purpose?: Purpose;
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
