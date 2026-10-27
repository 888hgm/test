import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, hydrateConfig, matrixFromData, percentMatrix, validateConfig, type Table } from '../src/model.ts';
import { unpivotFieldCounts } from '../src/field-data.ts';
import { demoData } from '../src/demo.ts';

const legacyConfig = () => ({ ...defaultConfig(), axisMode: 'values' as const });

test('合并多个来源的相同分类和分组，百分比以每个分类的合计为分母', () => {
  const config = legacyConfig();
  const matrix = matrixFromData([
    { category: '公司 A', series: '完成', value: 30 },
    { category: '公司 A', series: '完成', value: 10 },
    { category: '公司 A', series: '未完成', value: 60 },
    { category: '公司 B', series: '完成', value: 20 },
  ], config);
  const percent = percentMatrix(matrix);
  const a = matrix.categories.indexOf('公司 A');
  const b = matrix.categories.indexOf('公司 B');
  const done = matrix.series.indexOf('完成');
  assert.equal(percent[done][a], 40);
  assert.equal(percent[done][b], 100);
  for (let c = 0; c < matrix.categories.length; c++) assert.equal(percent.reduce((sum, s) => sum + s[c], 0), 100);
});
test('零值分类不会除零，也不会产生 NaN', () => {
  const matrix = matrixFromData([{ category: '空公司', series: '完成', value: 0 }], legacyConfig());
  assert.deepEqual(percentMatrix(matrix), [[0]]);
});
test('关键词筛选和按统计合计排序同时生效', () => {
  const config = { ...legacyConfig(), filter: '公司', categoryOrder: 'total' as const, categorySort: 'desc' as const };
  const matrix = matrixFromData([
    { category: '公司 A', series: '完成', value: 5 },
    { category: '公司 B', series: '完成', value: 10 },
    { category: '其他', series: '完成', value: 50 },
  ], config);
  assert.deepEqual(matrix.categories, ['公司 B', '公司 A']);
  assert.deepEqual(matrix.values, [[10, 5]]);
});
const tables: Table[] = ['a', 'b'].map(id => ({ id, name: id, fields: [
  { id: 'category', name: '分类', numeric: false }, { id: 'series', name: '分组', numeric: false }, { id: 'metric', name: '数值', numeric: true },
] }));
test('禁止平均值跨表直接相加，避免给出错误统计结果', () => {
  const config = { ...legacyConfig(), multi: true, aggregate: 'avg' as const, sources: tables.map(t => ({ tableId: t.id, category: 'category', series: 'series', metric: 'metric' })) };
  assert.match(validateConfig(config, tables)!, /计数和求和/);
  assert.equal(validateConfig({ ...config, aggregate: 'sum' }, tables), null);
});
test('字段删除和重复数据源会阻止保存', () => {
  const source = { tableId: 'a', category: 'category', series: 'series', metric: 'metric' };
  const config = { ...legacyConfig(), sources: [source] };
  assert.match(validateConfig({ ...config, sources: [{ ...source, category: 'deleted' }] }, tables)!, /分类字段/);
  assert.match(validateConfig({ ...config, multi: true, sources: [source, source] }, tables)!, /重复/);
});

test('多个字段展开为独立柱，每个字段按自身选项计数而非组合分类', () => {
  const fields = [{ id: 'a', name: '策划' }, { id: 'b', name: '设计' }];
  const data = unpivotFieldCounts([
    [{ value: 'done', text: '完成' }, { value: 'doing', text: '进行中' }, { value: 3, text: '3' }],
    [{ value: 'done', text: '完成' }, { value: 'done', text: '完成' }, { value: 2, text: '2' }],
    [{ value: 'doing', text: '进行中' }, { value: 'done', text: '完成' }, { value: 5, text: '5' }],
  ], fields);
  const config = defaultConfig(); config.sources[0].axisFields = fields;
  const matrix = matrixFromData(data, config);
  assert.deepEqual(matrix.categories, ['策划', '设计']);
  const done = matrix.series.indexOf('完成');
  assert.deepEqual(matrix.values[done], [5, 7]);
  assert.deepEqual(percentMatrix(matrix)[done], [50, 70]);
});
test('字段顺序遵循用户选择，空字段值计入未填写，空表仍保留横轴字段', () => {
  const config = defaultConfig();
  config.sources[0].axisFields = [{ id: 'b', name: '设计' }, { id: 'a', name: '策划' }];
  const data = unpivotFieldCounts([[{ value: null, text: null }, { value: '', text: '' }, { value: 4, text: '4' }]], config.sources[0].axisFields);
  assert.ok(data.every(d => d.series === '未填写'));
  assert.deepEqual(matrixFromData(data, config).categories, ['设计', '策划']);
  assert.deepEqual(matrixFromData([], config).categories, ['设计', '策划']);
});
test('缺失横轴字段、重复字段及多表字段顺序不一致会阻止保存', () => {
  const config = defaultConfig();
  config.sources = [{ tableId: 'a', category: '', series: '', metric: '', axisFields: [] }];
  assert.match(validateConfig(config, tables)!, /至少选择/);
  config.sources[0].axisFields = [{ id: 'category', name: '分类' }, { id: 'category', name: '分类' }];
  assert.match(validateConfig(config, tables)!, /不能重复/);
  config.sources[0].axisFields = [{ id: 'category', name: '分类' }, { id: 'series', name: '分组' }];
  assert.equal(validateConfig(config, tables), null);
  config.multi = true;
  config.sources.push({ ...config.sources[0], tableId: 'b', axisFields: [...config.sources[0].axisFields].reverse() });
  assert.match(validateConfig(config, tables)!, /名称和顺序一致/);
});
test('旧配置保持单字段分类，新字段模式保存后保留选择和顺序', () => {
  const current = defaultConfig();
  assert.deepEqual(hydrateConfig(JSON.parse(JSON.stringify(current))), current);
  const { axisMode, ...old } = legacyConfig();
  assert.equal(hydrateConfig(old).axisMode, 'values');
});
test('示例图四个字段各统计 258 次，百分比分别归一到 100%', () => {
  const config = defaultConfig();
  const matrix = matrixFromData(demoData(config), config);
  assert.equal(matrix.categories.length, 4);
  for (let column = 0; column < 4; column++) {
    assert.equal(matrix.values.reduce((sum, row) => sum + row[column], 0), 258);
    assert.ok(Math.abs(percentMatrix(matrix).reduce((sum, row) => sum + row[column], 0) - 100) < 0.00001);
  }
});
test('无效 SDK 列数或统计值会明确报错', () => {
  const fields = [{ id: 'a', name: '策划' }];
  assert.throws(() => unpivotFieldCounts([[{ value: 1, text: '1' }]], fields), /列数/);
  assert.throws(() => unpivotFieldCounts([[{ value: '完成', text: '完成' }, { value: -1, text: '-1' }]], fields), /无效/);
});
