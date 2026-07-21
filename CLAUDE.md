# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code (claude.ai/code) へのガイダンスを提供します。

## コマンド

```bash
npm install          # 依存パッケージのインストール
npm run dev          # 開発サーバー起動（http://localhost:3000）
npm run build        # 本番ビルド（dist/ に出力）
npm run preview      # 本番ビルドのプレビュー
npm run lint         # 型チェックのみ（tsc --noEmit、テストフレームワークなし）
npm run clean        # dist/ と server.js を削除
```

## 環境設定

`.env.example` を `.env.local` にコピーし、`GEMINI_API_KEY` を設定する。現時点ではコアロジックは完全にクライアントサイドで動作しており、Gemini API は実際には使用されていない（AI Studio のスキャフォールドとして存在）。

## アーキテクチャ

React + TypeScript + Vite 製の SPA。項目反応理論（IRT）を用いて英語語彙力を測定するアプリ。

**テストフロー**（`App.tsx` で管理）:
- `ViewState`: `start` → `test` → `stepResult` → (`test` → `stepResult`) の繰り返し → `finalResult`
- `MAX_STEPS = 5` ラウンド。1ラウンドあたり20語（実在語18語 + ダミー語2語）を表示
- ユーザーが知っている単語にチェックを入れる。ダミー語（存在しない単語）を選ぶとスコアにペナルティ（不正防止）

**コアアルゴリズム（`src/vocabEngine.ts`）**:
- **ラッシュモデル**（1パラメータロジスティック IRT）を使用: `P(知っている | θ, b) = 1 / (1 + exp(-(θ - b)))`
- `θ` = ユーザーの能力値、`b` = レベル（1〜10）から変換した難易度（約 -3.6〜+3.6）
- `estimateTheta()`: 標準正規分布の事前分布を加味した MAP 推定をグリッドサーチ（θ ∈ [-5, 5]）で実施
- `estimateVocabulary()`: 10レベル×1000語（計10,000語）を母集団として、各レベルの既知語期待値を合算。ダミー語の選択率に応じてペナルティを適用
- `selectNextWords()`: 適応型出題（CAT）。初回は全レベルから層別サンプリング、2回目以降は現在の θ 推定値に最も近い難易度 `b` の単語を優先出題

**単語データ（`src/data.ts`）**:
- `WORD_LIST`: 実在する英単語。レベル1〜10、各15語（計150語）
- `DUMMY_WORDS`: 存在しない偽の単語。`isDummy: true` フラグ付き

**状態管理**: `App.tsx` にすべての状態を集約。グローバルストアやコンテキストは使用しない。各ビューコンポーネントは必要な値のみ props で受け取る。

**スタイリング**: Tailwind CSS v4（`@tailwindcss/vite` プラグイン経由）。設定ファイルは不要で、CSS インポートで構成。

**パスエイリアス**: `@` はプロジェクトルート（`.`）に解決される。
