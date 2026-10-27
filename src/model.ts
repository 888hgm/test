export interface Field { id: string; name: string; numeric: boolean }
export interface Table { id: string; name: string; fields: Field[] }
export interface AxisField { id: string; name: string }
export interface Source { tableId: string; category: string; series: string; metric: string; axisFields?: AxisField[] }
export interface Config {
  version: 1;
  title: string;
  showTitle: boolean;
  multi: boolean;
  sources: Source[];
  axisMode: 'values' | 'fields';
  chartType: 'percent' | 'stacked' | 'grouped';
  palette: string;
  gradient: boolean;
  legend: boolean;
  labels: boolean;
  axes: boolean;
  grid: boolean;
  aggregate: 'count' | 'sum' | 'avg' | 'max' | 'min';
  grouped: boolean;
  categorySort: 'asc' | 'desc' | 'original';
  categoryOrder: 'value' | 'total';
  seriesSort: 'asc' | 'desc' | 'original';
  transpose: boolean;
  empty: 'blank' | 'zero' | 'dash';
  filter: string;
  decimals: number;
  barWidth: number;
  rounded: boolean;
  subtitle: string;
}
export interface Datum { category: string; series: string; value: number }
export interface Matrix { categories: string[]; series: string[]; values: number[][] }
export const palettes: Record<string, { name: string; colors: string[] }> = {
  default: { name: '飞书经典', colors: ['#3370ff', '#35bdba', '#ffc43b', '#fa8c16', '#c78cd8', '#25b3dc'] },
  forest: { name: '青山', colors: ['#137e66', '#39b69b', '#8bd4bd', '#b1c971', '#e6c46a', '#d8eae2'] },
  sunset: { name: '落日', colors: ['#f06f52', '#f6ab66', '#f5d29c', '#af83ad', '#706b9b', '#b8afd3'] },
  ocean: { name: '海盐', colors: ['#2165bc', '#3d94d3', '#5fc3d7', '#91d9d0', '#adc8e2', '#6d82be'] },
};
export const defaultConfig = (): Config => ({
  version: 1, title: '各环节完成情况', showTitle: true, multi: false, axisMode: 'fields',
  sources: [{ tableId: 'demo-company', category: 'company', series: 'status', metric: 'amount', axisFields: [
    { id: 'status', name: '项目策划' }, { id: 'design', name: '设计评审' },
    { id: 'development', name: '开发实施' }, { id: 'testing', name: '测试验收' },
  ] }],
  chartType: 'percent', palette: 'default', gradient: false, legend: true,
  labels: true, axes: true, grid: true, aggregate: 'count', grouped: true,
  categorySort: 'original', categoryOrder: 'value', seriesSort: 'asc', transpose: false,
  empty: 'blank', filter: '', decimals: 0, barWidth: 54, rounded: false, subtitle: '',
});
export function matrixFromData(data: Datum[], config: Config): Matrix {
  const filtered = data.filter(d => !config.filter || d.category.includes(config.filter));
  const selectedFields = (config.multi ? config.sources : config.sources.slice(0, 1)).flatMap(s => s.axisFields ?? []).map(f => f.name);
  let categories = config.axisMode === 'fields'
    ? [...new Set([...selectedFields, ...filtered.map(d => d.category)])].filter(name => !config.filter || name.includes(config.filter))
    : [...new Set(filtered.map(d => d.category))];
  const grouped = config.axisMode === 'fields' || config.grouped;
  let series = grouped ? [...new Set(filtered.map(d => d.series))] : ['全部记录'];
  const values = new Map<string, Map<string, number>>();
  for (const d of filtered) {
    const s = grouped ? d.series : '全部记录';
    const row = values.get(d.category) ?? new Map<string, number>();
    row.set(s, (row.get(s) ?? 0) + d.value);
    values.set(d.category, row);
  }
  const compare = (a: string, b: string) => a.localeCompare(b, 'zh-CN', { numeric: true });
  if (config.categorySort !== 'original') {
    categories.sort((a, b) => config.categoryOrder === 'total'
      ? [...(values.get(a)?.values() ?? [])].reduce((x, y) => x + y, 0) - [...(values.get(b)?.values() ?? [])].reduce((x, y) => x + y, 0)
      : compare(a, b));
    if (config.categorySort === 'desc') categories.reverse();
  }
  if (config.seriesSort !== 'original') {
    series.sort(compare);
    if (config.seriesSort === 'desc') series.reverse();
  }
  return { categories, series, values: series.map(s => categories.map(c => values.get(c)?.get(s) ?? 0)) };
}
export function percentMatrix(matrix: Matrix): number[][] {
  return matrix.values.map(row => row.map((n, c) => {
    const total = matrix.values.reduce((sum, r) => sum + r[c], 0);
    return total > 0 ? n / total * 100 : 0;
  }));
}
export function validateConfig(config: Config, tables: Table[]): string | null {
  const sources = config.multi ? config.sources : config.sources.slice(0, 1);
  if (!sources.length) return '请先选择数据源';
  if (new Set(sources.map(s => s.tableId)).size !== sources.length) return '请勿重复添加同一张数据表';
  if (sources.length > 1 && config.aggregate !== 'count' && config.aggregate !== 'sum') return '多数据源合并暂支持计数和求和';
  if (config.axisMode === 'fields' && sources.some(s => JSON.stringify(s.axisFields?.map(f => f.name)) !== JSON.stringify(sources[0].axisFields?.map(f => f.name)))) return '多数据源需要选择名称和顺序一致的横轴字段';
  for (const source of sources) {
    const table = tables.find(t => t.id === source.tableId);
    if (!table) return '数据表不可用，请重新选择数据源';
    if (config.axisMode === 'fields') {
      const selected = source.axisFields ?? [];
      if (!selected.length) return '请至少选择一个横轴字段';
      if (selected.some(f => !table.fields.some(meta => meta.id === f.id))) return '横轴字段不可用，请重新选择';
      if (new Set(selected.map(f => f.id)).size !== selected.length) return '横轴字段不能重复';
      if (new Set(selected.map(f => f.name)).size !== selected.length) return '同一数据源的横轴字段名称不能重复';
      if (config.aggregate !== 'count') return '按字段值分段时使用统计记录总数';
      continue;
    }
    if (!table.fields.some(f => f.id === source.category)) return '请选择横轴分类字段';
    if (config.grouped && !table.fields.some(f => f.id === source.series)) return '请选择分组字段';
    if (config.aggregate !== 'count' && !table.fields.some(f => f.id === source.metric && f.numeric)) return '请选择可统计的数字字段';
  }
  return null;
}
export function hydrateConfig(value: unknown): Config {
  if (!value || typeof value !== 'object') return defaultConfig();
  const raw = value as Partial<Config>;
  const config = { ...defaultConfig(), ...raw };
  // 旧版本没有此属性，保持旧图表的“字段值作为分类”行为。
  config.axisMode = raw.axisMode === 'fields' ? 'fields' : 'values';
  config.sources = Array.isArray(raw.sources) ? raw.sources.filter(s => s && typeof s.tableId === 'string').map(s => ({
    tableId: s.tableId, category: String(s.category ?? ''), series: String(s.series ?? ''), metric: String(s.metric ?? ''),
    axisFields: Array.isArray(s.axisFields) ? s.axisFields.filter(f => f && typeof f.id === 'string').map(f => ({ id: f.id, name: String(f.name ?? f.id) })) : [],
  })) : defaultConfig().sources;
  if (!palettes[config.palette]) config.palette = 'default';
  if (config.axisMode === 'fields') { config.aggregate = 'count'; config.grouped = true; }
  config.decimals = Math.max(0, Math.min(2, Number(config.decimals) || 0));
  config.barWidth = Math.max(16, Math.min(96, Number(config.barWidth) || 54));
  return config;
}
