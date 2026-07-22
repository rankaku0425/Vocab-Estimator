const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const APP_URL      = Deno.env.get('APP_URL') ?? '';

Deno.serve((req) => {
  const { searchParams } = new URL(req.url);
  const score = searchParams.get('score') ?? '0';
  const cefr  = searchParams.get('cefr')  ?? 'A1';
  const toeic = searchParams.get('toeic') ?? '';
  const eiken = searchParams.get('eiken') ?? '';

  const scoreNum = Number(score).toLocaleString('ja-JP');
  const title    = `英語語彙力テスト — 推定 ${scoreNum} 語（CEFR ${cefr}）`;
  const desc     = [
    toeic && `TOEIC ${toeic}`,
    eiken && `英検 ${eiken}`,
  ].filter(Boolean).join(' / ') || 'あなたの英語語彙力を測定しましょう！';

  const imageParams = new URLSearchParams({ score, cefr, toeic, eiken });
  const imageUrl = `${SUPABASE_URL}/functions/v1/og-image?${imageParams}`;

  // XSS対策: 文字列をHTMLエスケープ
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type"         content="website">
  <meta property="og:url"          content="${esc(APP_URL)}">
  <meta property="og:title"        content="${esc(title)}">
  <meta property="og:description"  content="${esc(desc)}">
  <meta property="og:image"        content="${esc(imageUrl)}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image"       content="${esc(imageUrl)}">
  <meta http-equiv="refresh" content="0; url=${esc(APP_URL)}">
</head>
<body>
  <p><a href="${esc(APP_URL)}">アプリへ移動する</a></p>
  <script>window.location.href = ${JSON.stringify(APP_URL)};</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
