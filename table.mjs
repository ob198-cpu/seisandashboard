export function parseTable(text, label) {
  const marker = 'google.visualization.Query.setResponse(';
  const start = text.indexOf(marker);
  if (start < 0 || !text.trim().endsWith(');')) throw Error('台帳を読み取れません。閲覧権限を確認してください。');
  const result = JSON.parse(text.slice(start + marker.length, text.lastIndexOf(');')));
  if (result.status !== 'ok' || !result.table) throw Error('台帳の読取に失敗しました。');
  if (result.table.cols.length !== 1 || result.table.cols[0].label !== label) throw Error('台帳の列構成が一致しません。');
  return result.table.rows.map(row => row.c[0]?.v).filter(v => v !== null && v !== undefined && v !== '');
}
