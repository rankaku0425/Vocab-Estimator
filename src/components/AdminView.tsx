import { useState, useEffect } from 'react';
import { fetchWordStats, runCalibration, WordStat } from '../supabase';

type LevelFilter = 'all' | number;

export function AdminView() {
  const [stats, setStats]       = useState<WordStat[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [calibrating, setCalibrating] = useState(false);
  const [calibResult, setCalibResult] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchWordStats()
      .then(setStats)
      .catch(() => setError('統計データの取得に失敗しました。word_stats ビューが存在するか確認してください。'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCalibrate = async () => {
    if (!window.confirm('キャリブレーションを実行しますか？\n30件以上の回答がある単語の b_param が更新されます。')) return;
    setCalibrating(true);
    setCalibResult(null);
    try {
      const updated = await runCalibration();
      setCalibResult(updated);
      load(); // 更新後に再取得
    } catch {
      setError('キャリブレーションに失敗しました。run_calibration() RPC が存在するか確認してください。');
    } finally {
      setCalibrating(false);
    }
  };

  const filtered = levelFilter === 'all'
    ? stats
    : stats.filter(s => s.level === levelFilter);

  const readyCount   = stats.filter(s => s.calibration_ready).length;
  const anomalyCount = stats.filter(s =>
    s.response_count > 0 && (
      s.correct_rate < 0.05 ||
      s.correct_rate > 0.95 ||
      (s.calibration_ready && Math.abs(s.proposed_b - s.b_param) > 1.5)
    )
  ).length;

  return (
    <div className="min-h-screen bg-[#fcfcfc] p-6">
      <div className="max-w-6xl mx-auto">

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-serif font-bold text-stone-900">管理画面</h1>
            <p className="text-stone-500 text-sm mt-1">単語統計・難易度キャリブレーション</p>
          </div>
          <div className="flex items-center gap-3">
            {anomalyCount > 0 && (
              <span className="text-sm text-amber-600">
                異常値: <strong>{anomalyCount}</strong> 語
              </span>
            )}
            <span className="text-sm text-stone-500">
              キャリブレーション可能: <strong className="text-stone-900">{readyCount}</strong> 語
            </span>
            <button
              onClick={handleCalibrate}
              disabled={calibrating || readyCount === 0}
              className="bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-sm font-medium py-2 px-5 transition-colors"
            >
              {calibrating ? '実行中...' : 'キャリブレーション実行'}
            </button>
            <button
              onClick={load}
              className="border border-stone-300 hover:bg-stone-100 text-stone-700 text-sm font-medium py-2 px-4 transition-colors"
            >
              再読み込み
            </button>
          </div>
        </div>

        {/* キャリブレーション結果 */}
        {calibResult !== null && (
          <div className="mb-6 p-4 bg-stone-900 text-white text-sm">
            キャリブレーション完了：<strong>{calibResult}</strong> 語の b_param を更新しました。
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 border border-red-200 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* レベルフィルター */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['all', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as (LevelFilter)[]).map(lv => (
            <button
              key={lv}
              onClick={() => setLevelFilter(lv)}
              className={`text-xs font-medium py-1.5 px-3 border transition-colors ${
                levelFilter === lv
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
              }`}
            >
              {lv === 'all' ? '全レベル' : `Lv ${lv}`}
            </button>
          ))}
        </div>

        {/* 統計テーブル */}
        {loading ? (
          <p className="text-stone-400 text-sm py-12 text-center">読み込み中...</p>
        ) : (
          <div className="border border-stone-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">単語</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 uppercase tracking-wider">Lv</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">現在 b</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">回答数</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">正答率</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">平均θ</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">提案 b</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 uppercase tracking-wider">状態</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-stone-500 uppercase tracking-wider">異常値</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const bDiff = s.proposed_b - s.b_param;
                  const isTooHard  = s.response_count > 0 && s.correct_rate < 0.05;
                  const isTooEasy  = s.response_count > 0 && s.correct_rate > 0.95;
                  const isDrifted  = s.calibration_ready && Math.abs(bDiff) > 1.5;
                  return (
                    <tr
                      key={s.id}
                      className={`border-t border-stone-100 ${i % 2 === 0 ? '' : 'bg-stone-50/50'}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-stone-900">{s.word}</td>
                      <td className="px-4 py-2.5 text-center text-stone-500">{s.level}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-stone-600">
                        {s.b_param.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-stone-600">{s.response_count}</td>
                      <td className="px-4 py-2.5 text-right text-stone-600">
                        {(s.correct_rate * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-stone-600">
                        {s.mean_theta.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {s.calibration_ready ? (
                          <span className={bDiff > 0.05 ? 'text-red-600' : bDiff < -0.05 ? 'text-blue-600' : 'text-stone-600'}>
                            {s.proposed_b.toFixed(2)}
                            {Math.abs(bDiff) > 0.05 && (
                              <span className="ml-1 text-xs">
                                ({bDiff > 0 ? '+' : ''}{bDiff.toFixed(2)})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {s.calibration_ready ? (
                          <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
                            準備完了
                          </span>
                        ) : (
                          <span className="inline-block bg-stone-100 text-stone-400 text-xs px-2 py-0.5 rounded-full">
                            {s.response_count}/30
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {isTooHard && (
                            <span className="inline-block bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                              難すぎ
                            </span>
                          )}
                          {isTooEasy && (
                            <span className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                              易すぎ
                            </span>
                          )}
                          {isDrifted && (
                            <span className="inline-block bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                              乖離大
                            </span>
                          )}
                          {!isTooHard && !isTooEasy && !isDrifted && (
                            <span className="text-stone-300">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-stone-400 text-sm py-8 text-center">データがありません</p>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-stone-400">
          管理画面へのアクセス: URL の末尾に <code className="bg-stone-100 px-1">#admin</code> を追加。
          本番環境では Supabase の RLS ポリシーで保護してください。
        </p>
      </div>
    </div>
  );
}
