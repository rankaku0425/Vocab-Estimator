import { useState, useEffect, useRef } from 'react';
import {
  fetchWordStats, runCalibration, updateWordBParam, addWord, deleteWord, WordStat,
} from '../supabase';

type LevelFilter = 'all' | number;
type SortKey = keyof WordStat;
type SortDir = 'asc' | 'desc';

// ── 統計カード ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-serif font-bold text-stone-900">{value}</p>
      {sub && <p className="text-xs text-stone-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── インライン b_param 編集セル ───────────────────────────────────────────────
function EditableB({ stat, onSaved }: { stat: WordStat; onSaved: (id: string, val: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(stat.b_param.toFixed(2));
  const [saving, setSaving]   = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);

  const commit = async () => {
    const num = parseFloat(val);
    if (isNaN(num) || num === stat.b_param) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateWordBParam(stat.id, num);
      onSaved(stat.id, num);
    } catch { setVal(stat.b_param.toFixed(2)); }
    setSaving(false);
    setEditing(false);
  };

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        disabled={saving}
        className="w-16 text-right font-mono text-sm border border-stone-400 px-1 py-0.5 focus:outline-none"
      />
    );
  }
  return (
    <span
      className="font-mono text-stone-600 cursor-pointer hover:underline"
      title="クリックして編集"
      onClick={() => setEditing(true)}
    >
      {stat.b_param.toFixed(2)}
    </span>
  );
}

// ── 単語追加フォーム ──────────────────────────────────────────────────────────
function AddWordForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen]   = useState(false);
  const [word, setWord]   = useState('');
  const [level, setLevel] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const submit = async () => {
    const trimmed = word.trim().toLowerCase();
    if (!trimmed) { setError('単語を入力してください'); return; }
    setSaving(true);
    setError(null);
    try {
      await addWord(trimmed, level);
      setWord(''); setLevel(5);
      setOpen(false);
      onAdded();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '追加に失敗しました');
    }
    setSaving(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="border border-stone-300 hover:bg-stone-100 text-stone-700 text-sm font-medium py-2 px-4 transition-colors"
      >
        + 単語を追加
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        value={word}
        onChange={e => setWord(e.target.value)}
        placeholder="単語 (英語)"
        className="border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-600 w-36"
        onKeyDown={e => e.key === 'Enter' && submit()}
        autoFocus
      />
      <select
        value={level}
        onChange={e => setLevel(Number(e.target.value))}
        className="border border-stone-300 px-2 py-2 text-sm focus:outline-none"
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map(lv => (
          <option key={lv} value={lv}>Lv {lv}</option>
        ))}
      </select>
      <button
        onClick={submit}
        disabled={saving}
        className="bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-sm font-medium py-2 px-4 transition-colors"
      >
        {saving ? '保存中...' : '追加'}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-stone-400 hover:text-stone-700 text-sm py-2 px-2"
      >
        キャンセル
      </button>
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </div>
  );
}

// ── CSV エクスポート ───────────────────────────────────────────────────────────
function exportCSV(stats: WordStat[]) {
  const header = ['id', 'word', 'level', 'b_param', 'response_count', 'correct_rate', 'mean_theta', 'proposed_b', 'calibration_ready'];
  const rows = stats.map(s => [
    s.id, s.word, s.level, s.b_param.toFixed(4), s.response_count,
    (s.correct_rate * 100).toFixed(2) + '%',
    s.mean_theta.toFixed(4), s.proposed_b.toFixed(4), s.calibration_ready,
  ].join(','));
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `word_stats_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── ソートアイコン ─────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-stone-300">↕</span>;
  return <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

// ── メインコンポーネント ──────────────────────────────────────────────────────
export function AdminView() {
  const [stats, setStats]           = useState<WordStat[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [calibrating, setCalibrating] = useState(false);
  const [calibResult, setCalibResult] = useState<number | null>(null);
  const [sortKey, setSortKey]         = useState<SortKey>('level');
  const [sortDir, setSortDir]         = useState<SortDir>('asc');
  const [showAnomalyOnly, setShowAnomalyOnly] = useState(false);
  const [deleteConfirm, setDeleteConfirm]     = useState<string | null>(null);

  const load = () => {
    setLoading(true); setError(null);
    fetchWordStats()
      .then(setStats)
      .catch(() => setError('統計データの取得に失敗しました。word_stats ビューが存在するか確認してください。'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCalibrate = async () => {
    if (!window.confirm('キャリブレーションを実行しますか？\n30件以上の回答がある単語の b_param が更新されます。')) return;
    setCalibrating(true); setCalibResult(null);
    try {
      const updated = await runCalibration();
      setCalibResult(updated); load();
    } catch { setError('キャリブレーションに失敗しました。'); }
    finally { setCalibrating(false); }
  };

  const handleBParamSaved = (id: string, val: number) => {
    setStats(prev => prev.map(s => s.id === id ? { ...s, b_param: val } : s));
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWord(id);
      setStats(prev => prev.filter(s => s.id !== id));
    } catch { setError('削除に失敗しました。'); }
    setDeleteConfirm(null);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const readyCount   = stats.filter(s => s.calibration_ready).length;
  const anomalyCount = stats.filter(s =>
    s.response_count > 0 && (
      s.correct_rate < 0.05 || s.correct_rate > 0.95 ||
      (s.calibration_ready && Math.abs(s.proposed_b - s.b_param) > 1.5)
    )
  ).length;
  const avgCorrectRate = stats.length > 0 && stats.some(s => s.response_count > 0)
    ? stats.filter(s => s.response_count > 0).reduce((sum, s) => sum + s.correct_rate, 0) /
      stats.filter(s => s.response_count > 0).length
    : null;

  // フィルター＋ソート
  let filtered = stats;
  if (levelFilter !== 'all') filtered = filtered.filter(s => s.level === levelFilter);
  if (showAnomalyOnly) filtered = filtered.filter(s =>
    s.response_count > 0 && (
      s.correct_rate < 0.05 || s.correct_rate > 0.95 ||
      (s.calibration_ready && Math.abs(s.proposed_b - s.b_param) > 1.5)
    )
  );
  filtered = [...filtered].sort((a, b) => {
    const av = a[sortKey] as number | string | boolean;
    const bv = b[sortKey] as number | string | boolean;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const thClass = "px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider cursor-pointer hover:text-stone-900 select-none whitespace-nowrap";

  return (
    <div className="min-h-screen bg-[#fcfcfc] p-6">
      <div className="max-w-7xl mx-auto">

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-serif font-bold text-stone-900">管理画面</h1>
            <p className="text-stone-500 text-sm mt-1">単語統計・難易度キャリブレーション</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => exportCSV(filtered)}
              className="border border-stone-300 hover:bg-stone-100 text-stone-700 text-sm font-medium py-2 px-4 transition-colors">
              CSV 出力
            </button>
            <button onClick={load}
              className="border border-stone-300 hover:bg-stone-100 text-stone-700 text-sm font-medium py-2 px-4 transition-colors">
              再読み込み
            </button>
            <button
              onClick={handleCalibrate}
              disabled={calibrating || readyCount === 0}
              className="bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-sm font-medium py-2 px-5 transition-colors">
              {calibrating ? '実行中...' : 'キャリブレーション実行'}
            </button>
          </div>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="総単語数" value={stats.length.toLocaleString()} sub="全レベル合計" />
          <StatCard label="キャリブレーション可能" value={readyCount} sub="回答 30 件以上" />
          <StatCard
            label="平均正答率"
            value={avgCorrectRate !== null ? `${(avgCorrectRate * 100).toFixed(1)}%` : '—'}
            sub="回答済み単語のみ"
          />
          <StatCard
            label="異常値"
            value={anomalyCount}
            sub="難すぎ / 易すぎ / 乖離大"
          />
        </div>

        {calibResult !== null && (
          <div className="mb-4 p-4 bg-stone-900 text-white text-sm">
            キャリブレーション完了：<strong>{calibResult}</strong> 語の b_param を更新しました。
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        {/* 単語追加フォーム */}
        <div className="mb-4">
          <AddWordForm onAdded={load} />
        </div>

        {/* フィルターバー */}
        <div className="flex gap-2 mb-3 flex-wrap items-center">
          {(['all', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as LevelFilter[]).map(lv => (
            <button key={lv} onClick={() => setLevelFilter(lv)}
              className={`text-xs font-medium py-1.5 px-3 border transition-colors ${
                levelFilter === lv
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
              }`}>
              {lv === 'all' ? '全レベル' : `Lv ${lv}`}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showAnomalyOnly}
              onChange={e => setShowAnomalyOnly(e.target.checked)}
              className="accent-stone-900"
            />
            異常値のみ表示
          </label>
        </div>

        {/* テーブル */}
        {loading ? (
          <p className="text-stone-400 text-sm py-12 text-center">読み込み中...</p>
        ) : (
          <div className="border border-stone-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className={thClass} onClick={() => toggleSort('word')}>
                    単語 <SortIcon active={sortKey === 'word'} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => toggleSort('level')}>
                    Lv <SortIcon active={sortKey === 'level'} dir={sortDir} />
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('b_param')}>
                    現在 b <SortIcon active={sortKey === 'b_param'} dir={sortDir} />
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('response_count')}>
                    回答数 <SortIcon active={sortKey === 'response_count'} dir={sortDir} />
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('correct_rate')}>
                    正答率 <SortIcon active={sortKey === 'correct_rate'} dir={sortDir} />
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('mean_theta')}>
                    平均θ <SortIcon active={sortKey === 'mean_theta'} dir={sortDir} />
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggleSort('proposed_b')}>
                    提案 b <SortIcon active={sortKey === 'proposed_b'} dir={sortDir} />
                  </th>
                  <th className={`${thClass} text-center`}>状態</th>
                  <th className={`${thClass} text-center`}>異常値</th>
                  <th className={`${thClass} text-center`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const bDiff     = s.proposed_b - s.b_param;
                  const isTooHard = s.response_count > 0 && s.correct_rate < 0.05;
                  const isTooEasy = s.response_count > 0 && s.correct_rate > 0.95;
                  const isDrifted = s.calibration_ready && Math.abs(bDiff) > 1.5;
                  return (
                    <tr key={s.id} className={`border-t border-stone-100 ${i % 2 === 0 ? '' : 'bg-stone-50/50'}`}>
                      <td className="px-4 py-2 font-medium text-stone-900">{s.word}</td>
                      <td className="px-4 py-2 text-center text-stone-500">{s.level}</td>
                      <td className="px-4 py-2 text-right">
                        <EditableB stat={s} onSaved={handleBParamSaved} />
                      </td>
                      <td className="px-4 py-2 text-right text-stone-600">{s.response_count}</td>
                      <td className="px-4 py-2 text-right text-stone-600">
                        {(s.correct_rate * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-stone-600">
                        {s.mean_theta.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {s.calibration_ready ? (
                          <span className={bDiff > 0.05 ? 'text-red-600' : bDiff < -0.05 ? 'text-blue-600' : 'text-stone-600'}>
                            {s.proposed_b.toFixed(2)}
                            {Math.abs(bDiff) > 0.05 && (
                              <span className="ml-1 text-xs">
                                ({bDiff > 0 ? '+' : ''}{bDiff.toFixed(2)})
                              </span>
                            )}
                          </span>
                        ) : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {s.calibration_ready ? (
                          <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">準備完了</span>
                        ) : (
                          <span className="inline-block bg-stone-100 text-stone-400 text-xs px-2 py-0.5 rounded-full">{s.response_count}/30</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {isTooHard && <span className="inline-block bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">難すぎ</span>}
                          {isTooEasy && <span className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">易すぎ</span>}
                          {isDrifted && <span className="inline-block bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">乖離大</span>}
                          {!isTooHard && !isTooEasy && !isDrifted && <span className="text-stone-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {deleteConfirm === s.id ? (
                          <span className="flex items-center gap-1 justify-center">
                            <button onClick={() => handleDelete(s.id)} className="text-xs text-red-600 hover:underline">削除</button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-xs text-stone-400 hover:underline">取消</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(s.id)}
                            className="text-xs text-stone-300 hover:text-red-500 transition-colors"
                          >
                            削除
                          </button>
                        )}
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
          b_param セルをクリックで直接編集できます。
        </p>
      </div>
    </div>
  );
}
