const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const APP_URL      = Deno.env.get('APP_URL') ?? '/';

// OGPをクロールするボットのUser-Agent判定
const BOT_PATTERN = /twitterbot|facebookexternalhit|linkedinbot|whatsapp|slackbot|discordbot|telegrambot|applebot|line-poster/i;

Deno.serve((req) => {
  const ua = req.headers.get('user-agent') ?? '';

  // 一般ブラウザ → アプリへ即時 302 リダイレクト（HTMLは見せない）
  if (!BOT_PATTERN.test(ua)) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': APP_URL },
    });
  }

  // OGPボット → メタタグ付きHTMLを返す
  const { searchParams } = new URL(req.url);
  const score = searchParams.get('score') ?? '0';
  const cefr  = searchParams.get('cefr')  ?? 'A1';
  const toeic = searchParams.get('toeic') ?? '';
  const eiken = searchParams.get('eiken') ?? '';

  const scoreNum = Number(score).toLocaleString('en-US');
  const title    = `\u82f1\u8a9e\u8a9e\u5f59\u529b\u30c6\u30b9\u30c8 \u2014 \u63a8\u5b9a ${scoreNum} \u8a9e\uff08CEFR ${cefr}\uff09`;
  const desc     = [
    toeic && `TOEIC ${toeic}`,
    eiken && `\u82f1\u691c ${eiken}`,
  ].filter(Boolean).join(' / ') || '\u3042\u306a\u305f\u306e\u82f1\u8a9e\u8a9e\u5f59\u529b\u3092\u6e2c\u5b9a\u3057\u307e\u3057\u3087\u3046\uff01';

  const imageParams = new URLSearchParams({ score, cefr, toeic, eiken });
  const imageUrl = `${SUPABASE_URL}/functions/v1/og-image?${imageParams}`;

  // XSS対策: HTML属性内の特殊文字をエスケープ（非ASCII は Unicode エスケープ済み）
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
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
