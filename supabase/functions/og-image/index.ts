import satori from 'npm:satori@0.10.13';
import { Resvg, initWasm } from 'npm:@resvg/resvg-wasm@2.6.0';

// ── 初期化（warm インスタンスではスキップ） ───────────────────────────────────
let resvgReady = false;
let fontCache: ArrayBuffer | null = null;

async function ensureResvg(): Promise<void> {
  if (resvgReady) return;
  await initWasm(
    fetch('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.0/index_bg.wasm')
  );
  resvgReady = true;
}

async function getFont(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache;
  // Google Fonts から Noto Sans JP Bold を取得
  const css = await fetch(
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap',
    { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' } }
  ).then((r) => r.text());

  // woff2 URL を最初の1件だけ抽出
  const match = css.match(/src:\s*url\(([^)]+\.woff2)\)/);
  if (!match) throw new Error('Noto Sans JP の woff2 URL が見つかりません');
  fontCache = await fetch(match[1]).then((r) => r.arrayBuffer());
  return fontCache;
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────
const W = 1200;
const H = 630;
const PAD = 64;

type VNode = { type: string; props: Record<string, unknown> };

function div(style: Record<string, unknown>, children: (VNode | string)[]): VNode {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children } };
}

function text(content: string, style: Record<string, unknown>): VNode {
  return { type: 'span', props: { style, children: content } };
}

function badge(label: string, value: string): VNode {
  return div(
    {
      flexDirection: 'column',
      border: '1px solid #e7e5e4',
      padding: '10px 20px',
      gap: 6,
      minWidth: 120,
    },
    [
      text(label, { fontSize: 13, color: '#a8a29e' }),
      text(value,  { fontSize: 22, fontWeight: 700, color: '#1c1917' }),
    ]
  );
}

// ── メインハンドラー ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const score = parseInt(searchParams.get('score') ?? '0', 10);
    const cefr  = searchParams.get('cefr')  ?? 'A1';
    const toeic = searchParams.get('toeic') ?? '';
    const eiken = searchParams.get('eiken') ?? '';

    // WASM・フォントを並行取得
    const [font] = await Promise.all([getFont(), ensureResvg()]);

    const badges: VNode[] = [
      badge('CEFR', cefr),
      ...(toeic ? [badge('TOEIC', toeic)] : []),
      ...(eiken ? [badge('英検',  eiken)] : []),
    ];

    const root = div(
      {
        width: W,
        height: H,
        background: '#ffffff',
        flexDirection: 'column',
        padding: PAD,
        fontFamily: 'Noto Sans JP',
      },
      [
        // ヘッダーラベル
        text('VOCABULARY ESTIMATOR  —  RESULT', {
          fontSize: 15,
          color: '#a8a29e',
          letterSpacing: '0.12em',
        }),
        // 区切り線
        div({ width: '100%', height: 1, background: '#e7e5e4', margin: '18px 0', flexShrink: 0 }, []),
        // スコア行
        div({ alignItems: 'baseline', gap: 14 }, [
          text(score.toLocaleString('ja-JP'), {
            fontSize: 108,
            fontWeight: 700,
            color: '#1c1917',
            lineHeight: 1,
          }),
          text('語', { fontSize: 38, color: '#78716c' }),
        ]),
        // バッジ行
        div({ gap: 14, marginTop: 28, flexWrap: 'wrap' }, badges),
        // スペーサー
        div({ flex: 1 }, []),
        // フッター
        text('#英語語彙力テスト  #英語学習', { fontSize: 15, color: '#c4c4c4' }),
      ]
    );

    const svg = await satori(root, {
      width: W,
      height: H,
      fonts: [{ name: 'Noto Sans JP', data: font, weight: 700, style: 'normal' }],
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W } });
    const png   = resvg.render().asPng();

    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('[og-image]', err);
    return new Response('Image generation failed', { status: 500 });
  }
});
