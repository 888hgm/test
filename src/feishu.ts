import type { IData, IDataCondition } from '@lark-base-open/js-sdk';
import { hydrateConfig, type Config, type Datum, type Table } from './model';
import { unpivotFieldCounts } from './field-data';
import { initializeDashboard } from './dashboard-session';
type SDK = typeof import('@lark-base-open/js-sdk');
let sdk: SDK;
export const isFeishu = window.parent !== window || new URLSearchParams(location.search).get('mode') === 'feishu';
export async function connect(): Promise<{ tables: Table[]; config: Config; viewing: boolean; creating: boolean }> {
  sdk = await import('@lark-base-open/js-sdk');
  return initializeDashboard(sdk.bitable, sdk.FieldType.Number);
}
export function conditions(config: Config): IDataCondition[] {
  const { Rollup, SourceType, DATA_SOURCE_SORT_TYPE, GroupMode } = sdk;
  if (config.axisMode === 'fields') return (config.multi ? config.sources : config.sources.slice(0, 1)).map(source => ({
    tableId: source.tableId,
    dataRange: { type: SourceType.ALL },
    groups: (source.axisFields ?? []).map(field => ({ fieldId: field.id, mode: GroupMode.INTEGRATED,
      sort: { sortType: DATA_SOURCE_SORT_TYPE.VIEW } })),
    series: 'COUNTA',
  }));
  return (config.multi ? config.sources : config.sources.slice(0, 1)).map(source => ({
    tableId: source.tableId,
    dataRange: { type: SourceType.ALL },
    groups: [source.category, ...(config.grouped ? [source.series] : [])].map(fieldId => ({
      fieldId, sort: { sortType: DATA_SOURCE_SORT_TYPE.VIEW },
    })),
    series: config.aggregate === 'count' ? 'COUNTA' : [{ fieldId: source.metric,
      rollup: ({ sum: Rollup.SUM, avg: Rollup.AVERAGE, max: Rollup.MAX, min: Rollup.MIN } as const)[config.aggregate] }],
  }));
}
export function decodeData(data: IData, config: Config): Datum[] {
  if (config.axisMode === 'fields') return unpivotFieldCounts(data, config.sources[0]?.axisFields ?? []);
  const dimensions = config.grouped ? 2 : 1;
  return data.map(row => {
    if (row.length !== dimensions + 1) throw new Error('飞书返回的数据列数与配置不一致，请重新选择字段并保存');
    const measure = row[dimensions].value;
    if (measure !== null && (typeof measure !== 'number' || !Number.isFinite(measure))) {
      throw new Error('飞书返回了非数值统计结果，请检查数值字段');
    }
    const label = (i: number) => String(row[i].text ?? row[i].value ?? '未填写');
    return { category: label(0), series: config.grouped ? label(1) : '全部记录', value: measure ?? 0 };
  });
}
export async function loadLiveData(config: Config, viewing: boolean): Promise<Datum[]> {
  const raw = viewing ? await sdk.bitable.dashboard.getData() : await sdk.bitable.dashboard.getPreviewData(conditions(config));
  return decodeData(raw, config);
}
export async function saveLive(config: Config): Promise<void> {
  const success = await sdk.bitable.dashboard.saveConfig({ dataConditions: conditions(config), customConfig: { chartConfig: { ...config } } });
  if (!success) throw new Error('飞书未确认保存成功，请稍后重试');
}
export function subscribe(onData: () => void, onConfig: (config: Config) => void): () => void {
  const dashboard = sdk.bitable.dashboard;
  const stops = [dashboard.onDataChange(onData), dashboard.onConfigChange(event => {
    onConfig(hydrateConfig(event.data.customConfig?.chartConfig));
  })];
  return () => stops.forEach(stop => stop());
}
export async function syncTheme(render: () => void): Promise<() => void> {
  const apply = (theme: Awaited<ReturnType<typeof sdk.bitable.dashboard.getTheme>>) => {
    document.documentElement.style.setProperty('--paper', theme.chartBgColor);
    document.documentElement.style.setProperty('--ink', theme.labelColorTokenList[0] ?? '#1f2329');
    render();
  };
  apply(await sdk.bitable.dashboard.getTheme());
  return sdk.bitable.dashboard.onThemeChange(event => apply(event.data));
}
export async function rendered(): Promise<void> { await sdk.bitable.dashboard.setRendered(); }
