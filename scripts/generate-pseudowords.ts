/**
 * scripts/generate-pseudowords.ts
 *
 * 英語音韻規則（Phonotactics）に基づいた疑似語（Pseudoword）を生成します。
 * 「発音できるが実在しない英単語」を3段階の複雑さで生成し、SQL を出力します。
 *
 * 実行:
 *   npx tsx scripts/generate-pseudowords.ts > scripts/pseudowords.sql
 *
 * 注意:
 *   実行前に scripts/pseudowords.sql の内容を確認し、
 *   意図せず実在語が含まれていないかチェックしてください。
 *
 * DB上の level の意味（疑似語の場合）:
 *   2 = シンプル（θ < -1.5 のユーザー向け）
 *   5 = ミディアム（-1.5 <= θ <= 1.5 のユーザー向け）
 *   8 = コンプレックス（θ > 1.5 のユーザー向け）
 */

// ── 音韻コンポーネント ─────────────────────────────────────────────────────

// 語頭子音（単独）：英語として自然なもの
const ONSET_SINGLE  = ['b','d','f','g','h','j','k','l','m','n','p','r','s','t','v','w','z'];
// 語頭子音クラスター：英語音韻規則上許容されるもの
const ONSET_CLUSTER = ['bl','br','cl','cr','dr','fl','fr','gl','gr','pl','pr','sc','sk','sl','sm','sn','sp','st','sw','tr','tw'];
// 短母音
const NUCLEUS_SHORT = ['a','e','i','o','u'];
// 長母音・二重母音
const NUCLEUS_LONG  = ['ai','ea','ou','ee','oo','au','oi'];
// 語末子音（単独）
const CODA_SINGLE   = ['b','d','f','k','l','m','n','p','r','s','t'];
// 語末子音クラスター
const CODA_CLUSTER  = ['nd','nt','st','sk','lk','mp','nk','lt','ft','ld','rd','rn'];

// 接尾辞（複雑さ別）
// ※実在の接尾辞をそのまま使うと本物の語になりやすいため、
//   語幹との組み合わせが不自然になるものを選んでいる
const SUFFIX_SIMPLE  = ['','er','le','y'] as const;
const SUFFIX_MID     = ['ous','ive','al','ic','ent','ant'] as const;
const SUFFIX_COMPLEX = ['itude','ulous','ative','escent','inate','ulous','ulent','itory'] as const;

// ── 実在語ブロックリスト ───────────────────────────────────────────────────
// アルゴリズムが偶然生成しうる実在英単語。短い語ほどリスクが高い。
// 5文字以上の語はアルゴリズム設計上ほぼ生成されないため対象外。
const REAL_WORD_BLOCKLIST = new Set<string>([
  // 3文字語（CVC など）
  'bad','bag','ban','bar','bat','bed','big','bin','bit','bog','bot','bow',
  'box','boy','bud','bug','bun','but','buy','cab','can','cap','car','cat',
  'cod','cog','cop','cot','cow','cub','cup','cut','dab','dad','did','dig',
  'dim','dip','dog','dot','dub','dug','ear','egg','end','fan','far','fat',
  'fed','fig','fit','fix','fly','fog','fox','fun','fur','gab','gap','gas',
  'gay','gel','gem','get','gig','god','got','gum','gun','gut','guy','had',
  'ham','has','hat','hay','hen','her','him','hip','his','hit','hog','hop',
  'hot','hub','hug','hum','hut','ill','imp','jab','jag','jam','jar','jet',
  'jig','job','jog','joy','jug','keg','key','kid','kin','kit','lab','lag',
  'lap','law','lay','led','leg','let','lid','lip','lit','log','lot','low',
  'lug','mad','man','map','mat','mob','mop','mud','mug','nag','nap','nod',
  'not','nun','nut','pad','pal','pan','pat','pay','peg','pen','per','pet',
  'pig','pit','pod','pop','pot','pub','pun','pup','put','rag','ran','rap',
  'rat','raw','ray','red','ref','rep','rid','rig','rim','rip','rob','rod',
  'rot','row','rub','rug','rum','run','rut','sag','sap','sat','saw','say',
  'set','sin','sip','sir','sit','sob','son','sow','soy','sub','sum','sun',
  'tab','tan','tap','tar','tax','ten','tic','tie','tin','tip','toe','ton',
  'top','tot','tow','toy','tub','tug','van','vat','vow','wag','war','wax',
  'web','wed','wet','wig','win','wit','woe','won','yam','yap','zap','zip',
  // 4文字語（アルゴリズムが生成しやすいもの）
  'back','bail','bait','bake','bald','bale','ball','band','bane','bang',
  'bank','bare','barn','bash','bass','bath','bead','beak','beam','bean',
  'beat','beck','beef','been','beer','bell','belt','bend','best','bill',
  'bind','bird','bite','blob','blot','blow','blue','blur','boat','bold',
  'bolt','bomb','bond','bone','book','boom','boot','bore','born','bowl',
  'brad','bran','brat','bred','brew','brim','brow','bulk','bull','bump',
  'bunk','burn','bust','cake','calf','call','calm','came','cane','cape',
  'card','care','cart','case','cash','cast','cave','cell','cent','chap',
  'chat','chin','chip','chop','clad','clam','clap','claw','clay','clip',
  'clog','club','clue','coal','coat','code','coil','cold','come','cook',
  'cool','cope','cord','core','corn','cost','cram','crop','crow','cure',
  'curl','dale','dame','dare','dark','dash','dawn','dead','deal','dear',
  'deck','deed','deep','dell','dent','desk','dime','dine','disc','dish',
  'dome','done','dove','down','drag','draw','drip','drop','drum','dual',
  'duel','duke','dull','dump','dusk','dust','earl','ease','east','fade',
  'fail','fair','fake','fall','fame','fang','fare','farm','fast','fate',
  'fawn','feed','feel','feet','fell','felt','file','fill','film','find',
  'fine','fire','firm','fish','fist','flag','flat','flaw','flee','flew',
  'flit','foam','foil','fold','fond','fore','form','fort','foul','fuel',
  'full','fuzz','gain','gale','game','gang','gape','gash','gate','gave',
  'gaze','gear','gild','gilt','give','glad','glee','glib','glow','glue',
  'glum','golf','gone','gore','gout','grab','grim','grip','grit','gust',
  'hack','hail','half','hall','halt','harm','harp','hate','haul','have',
  'haze','heal','heap','heat','heed','heel','hell','help','hemp','herb',
  'herd','hero','hill','hilt','hint','hire','hive','hole','hone','hood',
  'hook','hoop','horn','host','howl','hull','hulk','hump','hung','hunt',
  'hurl','hurt','husk','jade','jail','jibe','jilt','jive','jolt','junk',
  'just','keen','keep','kill','king','knob','knot','lack','laid','lake',
  'lame','land','lark','laud','lawn','lead','leaf','leak','lean','leap',
  'lend','lens','life','lift','like','lime','limp','line','link','list',
  'load','loam','loft','loop','lore','lose','lost','lull','lure','lush',
  'mace','made','male','mall','malt','mane','mark','mash','mass','mast',
  'mate','maze','meal','melt','mere','mild','mill','mint','miss','mist',
  'mock','mode','mold','mole','monk','moon','moth','much','mule','myth',
  'nail','nape','nick','norm','nose','nude','numb','pack','pair','pale',
  'pall','palm','pane','pang','pave','peak','peel','pelt','perk','pile',
  'pill','pine','pink','pipe','pity','plan','plug','poem','pole','poll',
  'pond','pool','pore','pour','pray','prey','prod','prop','pull','pump',
  'pure','push','quit','rack','rage','raid','rail','rain','rake','rang',
  'rank','rave','read','reed','reel','rent','rice','ride','rife','rift',
  'riot','rise','risk','rock','rode','roll','roof','rope','rose','rout',
  'rule','ruin','rush','sage','sail','sake','salt','sang','sane','save',
  'seal','seam','seed','seek','sell','shin','shoe','shut','sick','silk',
  'sill','slim','slip','slot','slow','slug','soil','soot','sour','span',
  'spit','spot','stab','star','stew','stub','stun','suit','sung','sunk',
  'surf','tale','tall','tame','tang','tart','task','taut','teak','teal',
  'tent','tick','tide','till','tilt','tire','toad','toil','toll','tomb',
  'tone','tool','torn','toss','tout','trap','tray','trim','trio','trod',
  'tuck','tune','twin','vain','vale','vamp','vane','vast','veil','vein',
  'vent','vine','void','vote','wade','wage','wake','wane','ward','warn',
  'warp','wasp','wave','weld','west','wham','whim','whip','wilt','wine',
  'wink','wipe','wire','woke','writ','yell','zeal','zero','zone',
  // ゲームに既に存在する単語（重複防止）
  'apple','water','book','time','person','year','way','day','thing','man',
  'world','life','hand','part','child',
]);

// ── ユーティリティ ─────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── 音節ビルダー ───────────────────────────────────────────────────────────

function buildSyllable(opts: {
  allowOnsetCluster: boolean;
  allowLongVowel: boolean;
  allowCodaCluster: boolean;
}): string {
  const useCluster = opts.allowOnsetCluster && Math.random() < 0.45;
  const hasOnset   = Math.random() < 0.85;
  const onset = hasOnset ? (useCluster ? pick(ONSET_CLUSTER) : pick(ONSET_SINGLE)) : '';

  const nucleus = (opts.allowLongVowel && Math.random() < 0.3)
    ? pick(NUCLEUS_LONG)
    : pick(NUCLEUS_SHORT);

  const hasCoda      = Math.random() < 0.65;
  const useClusterCoda = hasCoda && opts.allowCodaCluster && Math.random() < 0.35;
  const coda = hasCoda
    ? (useClusterCoda ? pick(CODA_CLUSTER) : pick(CODA_SINGLE))
    : '';

  return onset + nucleus + coda;
}

// ── 疑似語ジェネレーター ───────────────────────────────────────────────────

type Tier = 'simple' | 'medium' | 'complex';

function generateCandidate(tier: Tier): string {
  switch (tier) {
    case 'simple': {
      // 1音節：語頭クラスター + 短母音 + 語末クラスター → "bromp", "snark", "glint"
      const onset  = pick(Math.random() < 0.6 ? ONSET_CLUSTER : ONSET_SINGLE);
      const nucleus = pick(NUCLEUS_SHORT);
      const coda   = Math.random() < 0.75
        ? (Math.random() < 0.45 ? pick(CODA_CLUSTER) : pick(CODA_SINGLE))
        : '';
      const suffix = Math.random() < 0.2 ? pick(SUFFIX_SIMPLE) : '';
      return onset + nucleus + coda + suffix;
    }

    case 'medium': {
      // 2音節 + 中程度接尾辞 → "trompous", "grulbic", "snambent"
      const s1 = buildSyllable({ allowOnsetCluster: true,  allowLongVowel: false, allowCodaCluster: true  });
      const s2 = buildSyllable({ allowOnsetCluster: false, allowLongVowel: true,  allowCodaCluster: false });
      const suffix = Math.random() < 0.6 ? pick(SUFFIX_MID) : pick(SUFFIX_SIMPLE);
      return s1 + s2 + suffix;
    }

    case 'complex': {
      // 2〜3音節 + 学術的接尾辞 → "perspiculous", "frentibulate", "oblastitive"
      const s1 = buildSyllable({ allowOnsetCluster: true,  allowLongVowel: false, allowCodaCluster: false });
      const s2 = buildSyllable({ allowOnsetCluster: false, allowLongVowel: true,  allowCodaCluster: false });
      const s3 = Math.random() < 0.55
        ? buildSyllable({ allowOnsetCluster: false, allowLongVowel: false, allowCodaCluster: false })
        : '';
      const suffix = pick(SUFFIX_COMPLEX);
      return s1 + s2 + s3 + suffix;
    }
  }
}

// ── バリデーター ───────────────────────────────────────────────────────────

function isValidPseudoword(word: string): boolean {
  // 長さチェック（短すぎ・長すぎを除外）
  if (word.length < 4 || word.length > 16) return false;
  // ブロックリストチェック
  if (REAL_WORD_BLOCKLIST.has(word)) return false;
  // 母音が3連続 → 発音不自然
  if (/[aeiou]{3,}/.test(word)) return false;
  // 子音が4連続 → 発音不可能
  if (/[bcdfghjklmnpqrstvwxyz]{4,}/.test(word)) return false;
  // 一般的な接頭辞（re-, un-, in-）で始まる → 実在語に見えやすい
  if (/^(re|un|in|dis|pre|mis|non)/.test(word)) return false;
  // 完全な実在接尾辞で終わる単音節語 → 実在語候補
  if (word.length <= 6 && /(ness|less|ful|ing)$/.test(word)) return false;
  return true;
}

// ── メイン生成処理 ─────────────────────────────────────────────────────────

const TARGETS: { tier: Tier; count: number }[] = [
  { tier: 'simple',  count: 40 },
  { tier: 'medium',  count: 40 },
  { tier: 'complex', count: 40 },
];

const results: { word: string; tier: Tier }[] = [];
const seen = new Set<string>();

for (const { tier, count } of TARGETS) {
  let attempts = 0;
  let generated = 0;

  while (generated < count && attempts < 10000) {
    attempts++;
    const candidate = generateCandidate(tier).toLowerCase();

    if (isValidPseudoword(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      results.push({ word: candidate, tier });
      generated++;
    }
  }

  const actual = results.filter(r => r.tier === tier).length;
  if (actual < count) {
    process.stderr.write(`警告: ${tier} の生成数が目標に届きませんでした (${actual}/${count})\n`);
  }
}

// ── SQL 出力 ───────────────────────────────────────────────────────────────

// DB 上の level（疑似語の複雑さレベル）
// selectNextWords がθに基づいてこの level で絞り込む
const TIER_LEVEL: Record<Tier, number> = {
  simple:  2,
  medium:  5,
  complex: 8,
};

const TIER_LABEL: Record<Tier, string> = {
  simple:  'シンプル（1音節、level=2）',
  medium:  'ミディアム（2音節、level=5）',
  complex: 'コンプレックス（2-3音節、level=8）',
};

process.stdout.write(`-- ============================================================\n`);
process.stdout.write(`-- 疑似語（Pseudoword）SQL\n`);
process.stdout.write(`-- generate-pseudowords.ts により生成\n`);
for (const tier of ['simple','medium','complex'] as Tier[]) {
  const n = results.filter(r => r.tier === tier).length;
  process.stdout.write(`--   ${TIER_LABEL[tier]}: ${n}語\n`);
}
process.stdout.write(`--   合計: ${results.length}語\n`);
process.stdout.write(`-- ============================================================\n\n`);
process.stdout.write(`-- ⚠ 実行前に内容を確認し、意図せず実在語が含まれていないかチェックしてください。\n\n`);

process.stdout.write(`CREATE UNIQUE INDEX IF NOT EXISTS words_word_idx ON words(word);\n\n`);
process.stdout.write(`INSERT INTO words (id, word, level, b_param, is_dummy)\nVALUES\n`);

results.forEach(({ word, tier }, i) => {
  const level = TIER_LEVEL[tier];
  const id    = `pseudo_${tier[0]}_${word}`;
  const row   = `('${id}','${word}',${level},0.0,true)`;
  process.stdout.write(row + (i < results.length - 1 ? ',\n' : '\n'));
});

process.stdout.write(`ON CONFLICT (word) DO NOTHING;\n`);
