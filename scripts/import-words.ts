/**
 * scripts/import-words.ts
 *
 * 新規単語リストから Supabase 用の SQL を生成します。
 * 実行: npx tsx scripts/import-words.ts > scripts/output.sql
 * 出力した SQL を Supabase の SQL Editor で実行してください。
 */

type WordEntry = { word: string; level: number };

const NEW_WORDS: WordEntry[] = [
  // ── Level 1（基礎語：A1-A2、日常の最頻出単語）──────────────────────────
  ...[
    'house', 'school', 'door',  'room',  'night', 'city',  'food',  'body',
    'arm',   'face',   'job',   'money', 'run',   'look',  'give',  'keep',
    'live',  'hold',   'ask',   'find',  'try',   'show',  'call',  'feel',
    'hear',  'move',   'read',  'love',  'play',  'talk',  'walk',  'open',
    'close', 'buy',    'sit',   'sleep', 'eat',   'drink', 'write', 'teach',
    'think', 'want',   'big',   'small', 'happy', 'hot',   'cold',  'fast',
    'slow',  'long',
  ].map(word => ({ word, level: 1 })),

  // ── Level 2（初級語：B1相当、基本的な社会・学習語彙）──────────────────
  ...[
    'ability',     'agree',       'allow',       'appear',      'area',
    'basic',       'benefit',     'cause',       'certain',     'change',
    'claim',       'class',       'complete',    'concern',     'consider',
    'control',     'create',      'decide',      'define',      'develop',
    'discuss',     'establish',   'factor',      'feature',     'follow',
    'growth',      'include',     'increase',    'involve',     'issue',
    'major',       'method',      'national',    'occur',       'period',
    'position',    'possible',    'practice',    'process',     'produce',
    'project',     'reduce',      'region',      'remain',      'result',
    'significant', 'specific',    'standard',    'support',     'system',
  ].map(word => ({ word, level: 2 })),

  // ── Level 3（中級語：B2相当、学術・論述で頻出）────────────────────────
  ...[
    'achieve',     'adapt',       'analyze',     'anticipate',  'assess',
    'assume',      'challenge',   'clarify',     'collaborate', 'concept',
    'confirm',     'conflict',    'construct',   'contrast',    'contribute',
    'deduce',      'demonstrate', 'detect',      'dispute',     'distribute',
    'eliminate',   'enhance',     'evaluate',    'expand',      'extract',
    'facilitate',  'flexible',    'foundation',  'framework',   'implement',
    'integrate',   'interpret',   'investigate', 'monitor',     'organize',
    'perceive',    'predict',     'promote',     'regulate',    'reinforce',
    'resolve',     'restrict',    'structure',   'summarize',   'sustain',
    'transform',   'undermine',   'unique',      'utilize',     'verify',
  ].map(word => ({ word, level: 3 })),

  // ── Level 4（上級語：C1相当、政策・ビジネス・論文で使われる語）────────
  ...[
    'ambivalent',  'arbitrary',   'articulate',  'augment',     'catalyst',
    'circumvent',  'coherent',    'compromise',  'contemplate', 'contradict',
    'culminate',   'dedicate',    'deliberate',  'dilemma',     'discern',
    'disrupt',     'doctrine',    'empower',     'enforce',     'equitable',
    'exacerbate',  'feasible',    'formulate',   'implicit',    'inference',
    'inhibit',     'innovate',    'leverage',    'mediate',     'mitigate',
    'navigate',    'negotiate',   'nullify',     'optimize',    'perpetuate',
    'precedent',   'prioritize',  'prohibit',    'rationale',   'reconcile',
    'reluctant',   'resilient',   'revoke',      'rigorous',    'scrutinize',
    'skeptical',   'stabilize',   'subordinate', 'synthesize',  'vulnerable',
  ].map(word => ({ word, level: 4 })),

  // ── Level 5（上級学術語：C1-C2相当、英字新聞・論文に頻出）────────────
  ...[
    'abstain',     'admonish',    'affinity',    'alleviate',   'ameliorate',
    'appease',     'ardent',      'ascertain',   'aspire',      'assimilate',
    'beguile',     'bolster',     'brevity',     'candor',      'capricious',
    'censure',     'circumspect', 'clandestine', 'coerce',      'cogent',
    'condone',     'contentious', 'copious',     'covert',      'credulous',
    'daunting',    'debilitate',  'defer',       'deplete',     'disparate',
    'dissent',     'elusive',     'eminent',     'empirical',   'enumerate',
    'erratic',     'fallacy',     'frugal',      'futile',      'harbinger',
    'impede',      'intrinsic',   'lament',      'latent',      'meticulous',
    'negate',      'pervasive',   'pragmatic',   'reciprocal',  'refute',
  ].map(word => ({ word, level: 5 })),

  // ── Level 6（高度学術語：C2相当、批評・哲学・修辞学の語彙）────────────
  ...[
    'abstruse',    'acumen',      'antagonism',  'antithesis',  'apocryphal',
    'approbation', 'arduous',     'ascetic',     'assuage',     'atavistic',
    'audacious',   'auspicious',  'avarice',     'baroque',     'bemoan',
    'blatant',     'bombast',     'byzantine',   'caprice',     'castigate',
    'coalesce',    'compunction', 'confound',    'culpable',    'cynicism',
    'dearth',      'decorum',     'denigrate',   'despondent',  'dialectic',
    'duplicity',   'effrontery',  'esoteric',    'excoriate',   'exigent',
    'extol',       'fabricate',   'feckless',    'fervor',      'flounder',
    'fortuitous',  'grandiose',   'hackneyed',   'heresy',      'hyperbole',
    'illusory',    'impunity',    'incisive',    'incongruity', 'indolent',
  ].map(word => ({ word, level: 6 })),

  // ── Level 7（教養語：高等教育レベル、英検1級・GRE準拠）───────────────
  ...[
    'abject',      'abjure',      'abstemious',  'adjudicate',  'adroit',
    'affectation', 'aloof',       'amorphous',   'animosity',   'apotheosis',
    'apposite',    'ardor',       'astute',      'audacity',    'avid',
    'beatitude',   'belie',       'beneficent',  'brazen',      'capitulate',
    'carping',     'cognizant',   'complacent',  'cupidity',    'curmudgeon',
    'dauntless',   'decadent',    'deference',   'deign',       'deleterious',
    'deprecate',   'discordant',  'dissolution', 'elucidate',   'emulate',
    'encomium',    'erudite',     'exhort',      'exorbitant',  'exquisite',
    'feign',       'flaunt',      'foment',      'frivolous',   'glib',
    'haughty',     'hubris',      'immutable',   'implacable',  'impugn',
  ].map(word => ({ word, level: 7 })),

  // ── Level 8（難語：ネイティブ教養層、GRE・文芸批評で使われる語）───────
  ...[
    'abeyance',    'abnegate',    'adjure',      'anodyne',     'antithetical',
    'aphorism',    'aplomb',      'aspersion',   'assiduous',   'attrition',
    'avocation',   'belligerent', 'bilious',     'boorish',     'burgeon',
    'callous',     'clairvoyant', 'covet',       'craven',      'cynosure',
    'decry',       'demur',       'depravity',   'dilettante',  'disparity',
    'dubious',     'effete',      'elegy',       'elocution',   'ennui',
    'equivocate',  'evanescent',  'expiate',     'exponent',    'exult',
    'fulminate',   'guileless',   'impetuous',   'inane',       'intrepid',
    'invective',   'laconic',     'loquacious',  'malediction', 'mollify',
    'morbid',      'nascent',     'nebulous',    'perfidy',     'pernicious',
  ].map(word => ({ word, level: 8 })),

  // ── Level 9（稀少語：文学・学術専門、辞書を引かないとわからない語）────
  ...[
    'abscond',        'afflatus',     'agrestic',      'allay',        'amanuensis',
    'ambuscade',      'anchorite',    'apostate',      'argot',        'ascendancy',
    'asperity',       'baleful',      'bilk',          'captious',     'chasten',
    'chimerical',     'circumlocutory','cogitate',     'conflagration','contrite',
    'decrepitude',    'demagogue',    'derision',      'desultory',    'diffident',
    'disconsolate',   'dissemble',    'dormant',       'dubiety',      'effulgence',
    'elliptical',     'emollient',    'enervation',    'fugacity',     'equivocal',
    'erudition',      'espouse',      'etiolated',     'evince',       'execration',
    'exordium',       'extirpate',    'fallow',        'fecund',       'ferocity',
    'flaccid',        'fuliginous',   'gravitas',      'gelid',        'hebetude',
  ].map(word => ({ word, level: 9 })),

  // ── Level 10（極稀語：文語・古語・修辞学術語、専門家でも辞書を引く語）─
  ...[
    'absquatulate', 'acatalepsy',  'acedia',       'adytum',       'agelast',
    'aleatoric',    'algid',       'allodial',     'ambage',       'amerce',
    'amphibology',  'anacoluthon', 'anfractuous',  'animadversion','apocopate',
    'apodeictic',   'apologue',    'aporia',       'apothegm',     'apotropaic',
    'archaism',     'argute',      'ataraxia',     'aubade',       'autochthonous',
    'bacchanal',    'balderdash',  'bellwether',   'bifid',        'blatherskite',
    'bloviate',     'bombinate',   'borborygmus',  'boondoggle',   'braggadocio',
    'brumous',      'cachinnate',  'caducity',     'catachresis',  'chrestomathy',
    'cloacal',      'coenobite',   'confabulate',  'contumely',    'coruscate',
    'crapulous',    'crepuscular', 'defervescence','ebullition',   'eleemosynary',
  ].map(word => ({ word, level: 10 })),
];

function levelToDifficulty(level: number): number {
  return Math.round(((level - 5.5) * 0.8) * 10) / 10;
}

const rows = NEW_WORDS.map(({ word, level }) => {
  const b = levelToDifficulty(level);
  const id = `new_${level}_${word}`;
  return `('${id}','${word}',${level},${b},false)`;
});

const byLevel = NEW_WORDS.reduce<Record<number, number>>((acc, { level }) => {
  acc[level] = (acc[level] ?? 0) + 1;
  return acc;
}, {});

process.stdout.write(`-- ============================================================\n`);
process.stdout.write(`-- 新規単語 SQL（import-words.ts により生成）\n`);
process.stdout.write(`-- 合計: ${rows.length}語\n`);
for (let lv = 1; lv <= 10; lv++) {
  process.stdout.write(`--   Level ${lv}: ${byLevel[lv] ?? 0}語\n`);
}
process.stdout.write(`-- ============================================================\n\n`);

// word カラムに一意インデックスを追加（既にあればスキップ）
process.stdout.write(`CREATE UNIQUE INDEX IF NOT EXISTS words_word_idx ON words(word);\n\n`);

// 単語を挿入（同じ単語が既にあればスキップ）
process.stdout.write(`INSERT INTO words (id, word, level, b_param, is_dummy)\nVALUES\n`);
rows.forEach((row, i) => {
  process.stdout.write(row + (i < rows.length - 1 ? ',\n' : '\n'));
});
process.stdout.write(`ON CONFLICT (word) DO NOTHING;\n`);
