import satori from 'npm:satori@0.10.13';
import { Resvg, initWasm } from 'npm:@resvg/resvg-wasm@2.6.0';

const W   = 1200;
const H   = 630;
const PAD = 64;

// ── WASM 初期化 ───────────────────────────────────────────────────────────────
// ArrayBuffer で渡すのが最も確実（Response/Promise<Response> より互換性が高い）
let resvgReady = false;

async function ensureResvg(): Promise<void> {
  if (resvgReady) return;
  const buf = await fetch(
    'https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.0/index_bg.wasm'
  ).then((r) => r.arrayBuffer());
  await initWasm(buf);
  resvgReady = true;
}

// ── フォント取得（必要な文字のみサブセット） ─────────────────────────────────
// OGP 画像内で使う文字を列挙 → Google Fonts がその字種のみのサブセット woff2 を返す
const GLYPH_SET = '語推定英検準級テスト0123456789〜,. ()ABCEFR12345上位';
let fontCache: ArrayBuffer[] | null = null;

async function getFonts(): Promise<ArrayBuffer[]> {
  if (fontCache) return fontCache;

  // Firefox 27 (WOFF2未対応) の UA → Google Fonts が WOFF 形式を返す
  // satori の内部 opentype.js は WOFF2 未対応のため WOFF を使う必要がある
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(GLYPH_SET)}&display=swap`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:27.0) Gecko/20100101 Firefox/27.0',
      },
    }
  ).then((r) => r.text());

  // WOFF 形式のURLを抽出（WOFF2 は satori 非対応）
  const urls = [...css.matchAll(/url\(([^)]+)\)\s+format\('woff'\)/g)].map((m) => m[1]);
  if (urls.length === 0) {
    throw new Error(`Font URL not found in CSS response:\n${css.slice(0, 500)}`);
  }

  // 並行フェッチ
  fontCache = await Promise.all(urls.map((u) => fetch(u).then((r) => r.arrayBuffer())));
  return fontCache;
}

// ── VNode ヘルパー ────────────────────────────────────────────────────────────
interface VNode {
  type: string;
  props: Record<string, unknown>;
}
type Child = VNode | string;

function el(
  tag: string,
  style: Record<string, unknown>,
  children?: Child | Child[]
): VNode {
  const props: Record<string, unknown> = { style: { display: 'flex', ...style } };
  if (children !== undefined) props.children = children;
  return { type: tag, props };
}

function t(content: string, style: Record<string, unknown>): VNode {
  return { type: 'span', props: { style, children: content } };
}

function badge(label: string, value: string): VNode {
  return el(
    'div',
    { flexDirection: 'column', border: '1px solid #e7e5e4', padding: '10px 20px', gap: 6 },
    [
      t(label, { fontSize: 13, color: '#a8a29e' }),
      t(value,  { fontSize: 22, fontWeight: 700, color: '#1c1917' }),
    ]
  );
}

// ── メインハンドラ ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const score = parseInt(searchParams.get('score') ?? '0', 10);
    const cefr  = searchParams.get('cefr')  ?? 'A1';
    const toeic = searchParams.get('toeic') ?? '';
    const eiken = searchParams.get('eiken') ?? '';

    // WASM とフォントを並行取得
    const [fonts] = await Promise.all([getFonts(), ensureResvg()]);

    const badgeNodes: VNode[] = [
      badge('CEFR', cefr),
      ...(toeic ? [badge('TOEIC', toeic)] : []),
      ...(eiken ? [badge('英検',  eiken)] : []),
    ];

    const root = el(
      'div',
      {
        width: W, height: H, background: '#ffffff',
        flexDirection: 'column', justifyContent: 'space-between',
        padding: PAD, fontFamily: 'NotoJP',
      },
      [
        // 上部グループ（ヘッダー・スコア・バッジ）
        el('div', { flexDirection: 'column' }, [
          t('VOCABULARY ESTIMATOR  —  RESULT', {
            fontSize: 15, color: '#a8a29e', letterSpacing: '0.12em',
          }),
          // 区切り線（高さ1px、デフォルトの alignItems: stretch で親幅いっぱいに広がる）
          el('div', { height: 1, background: '#e7e5e4', margin: '20px 0' }),
          // スコア行
          el('div', { alignItems: 'baseline', gap: 14 }, [
            t(score.toLocaleString('en-US'), {
              fontSize: 108, fontWeight: 700, color: '#1c1917', lineHeight: 1,
            }),
            t('語', { fontSize: 38, color: '#78716c' }),
          ]),
          // バッジ行
          el('div', { gap: 14, marginTop: 28, flexWrap: 'wrap' }, badgeNodes),
        ]),
        // フッター（hashタグ）
        t('#英語語彙力テスト  #英語学習', { fontSize: 15, color: '#c4c4c4' }),
      ]
    );

    const svg = await satori(root, {
      width: W,
      height: H,
      fonts: fonts.map((data) => ({
        name: 'NotoJP',
        data,
        weight: 700 as const,
        style:  'normal' as const,
      })),
    });

    const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } })
      .render()
      .asPng();

    return new Response(png, {
      headers: {
        'Content-Type':  'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    // エラー詳細をレスポンスに含める（デバッグ用）
    const msg = err instanceof Error
      ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}`
      : String(err);
    console.error('[og-image]', msg);
    return new Response(`Image generation failed:\n\n${msg}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
});
