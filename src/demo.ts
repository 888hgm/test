import type { Config, Datum, Table } from './model';
export const demoTables: Table[] = [
  { id: 'demo-company', name: '个人型中性笔公司', fields: [
    { id: 'company', name: '产品公司', numeric: false },
    { id: 'status', name: '项目策划', numeric: false },
    { id: 'design', name: '设计评审', numeric: false },
    { id: 'development', name: '开发实施', numeric: false },
    { id: 'testing', name: '测试验收', numeric: false },
    { id: 'owner', name: '负责人', numeric: false },
    { id: 'amount', name: '项目金额', numeric: true },
  ] },
  { id: 'demo-team', name: '团队项目台账', fields: [
    { id: 'company', name: '产品公司', numeric: false },
    { id: 'status', name: '项目策划', numeric: false },
    { id: 'design', name: '设计评审', numeric: false },
    { id: 'development', name: '开发实施', numeric: false },
    { id: 'testing', name: '测试验收', numeric: false },
    { id: 'owner', name: '负责人', numeric: false },
    { id: 'amount', name: '项目金额', numeric: true },
  ] },
];
const companies = ['晨光文具', '得力集团', '百乐文具', '三菱铅笔', '斑马文具', '白雪文具'];
const statuses = ['已完成', '进行中', '未开始'];
const counts = [[28, 13, 5], [34, 9, 7], [18, 16, 8], [25, 11, 4], [22, 14, 6], [16, 12, 10]];
interface Row { company: string; status: string; design: string; development: string; testing: string; owner: string; amount: number }
const rows: Row[][] = [0, 1].map(table => companies.flatMap((company, c) => statuses.flatMap((status, s) =>
  Array.from({ length: Math.max(1, counts[c][s] - table * 6) }, (_, i) => ({
    company, status,
    design: statuses[(i + c) % 10 < 6 ? 0 : (i + c) % 10 < 9 ? 1 : 2],
    development: statuses[(i + c) % 10 < 4 ? 0 : (i + c) % 10 < 8 ? 1 : 2],
    testing: statuses[(i + c) % 10 < 2 ? 0 : (i + c) % 10 < 6 ? 1 : 2],
    owner: ['林悦', '周宁', '陈默'][(c + i) % 3], amount: (c + 1) * 1800 + s * 350 + i * 100,
  })))));
export function demoData(config: Config): Datum[] {
  return (config.multi ? config.sources : config.sources.slice(0, 1)).flatMap(source => {
    const data = rows[source.tableId === 'demo-team' ? 1 : 0];
    if (config.axisMode === 'fields') {
      return (source.axisFields ?? []).flatMap(field => {
        const counts = new Map<string, number>();
        for (const row of data) {
          const value = String(row[field.id as keyof Row] ?? '未填写') || '未填写';
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return [...counts].map(([series, value]) => ({ category: field.name, series, value }));
      });
    }
    const groups = new Map<string, { category: string; series: string; numbers: number[] }>();
    for (const row of data) {
      const category = String(row[source.category as keyof Row] ?? '未填写');
      const series = config.grouped ? String(row[source.series as keyof Row] ?? '未填写') : '全部记录';
      const key = JSON.stringify([category, series]);
      const group = groups.get(key) ?? { category, series, numbers: [] };
      group.numbers.push(Number(row[source.metric as keyof Row]) || 0);
      groups.set(key, group);
    }
    return [...groups.values()].map(({ category, series, numbers }) => {
      const sum = numbers.reduce((a, b) => a + b, 0);
      const value = config.aggregate === 'count' ? numbers.length : config.aggregate === 'avg' ? sum / numbers.length
        : config.aggregate === 'max' ? Math.max(...numbers) : config.aggregate === 'min' ? Math.min(...numbers) : sum;
      return { category, series, value };
    });
  });
}
