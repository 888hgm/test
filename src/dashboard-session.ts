import { hydrateConfig, type Config, type Table } from './model.ts';

export interface SessionAPI {
  dashboard: {
    state: string;
    getConfig(): Promise<{ customConfig?: Record<string, unknown> }>;
  };
  base: {
    getTableMetaList(): Promise<{ id: string; name: string }[]>;
    getTableById(id: string): Promise<{ getFieldMetaList(): Promise<{ id: string; name: string; type: number }[]> }>;
  };
}

export async function initializeDashboard(api: SessionAPI, numericType: number): Promise<{ tables: Table[]; config: Config; viewing: boolean; creating: boolean }> {
  const creating = api.dashboard.state === 'Create';
  const viewing = ['View', 'FullScreen'].includes(api.dashboard.state);
  // Create 阶段尚未生成组件配置，宿主明确禁止调用 getConfig。
  const saved = creating ? undefined : await api.dashboard.getConfig();
  const config = hydrateConfig(saved?.customConfig?.chartConfig);
  if (viewing) return { tables: [], config, viewing, creating };
  const metas = await api.base.getTableMetaList();
  const tables = await Promise.all(metas.map(async table => {
    const fields = await (await api.base.getTableById(table.id)).getFieldMetaList();
    return { id: table.id, name: table.name, fields: fields.map(f => ({
      id: f.id, name: f.name, numeric: f.type === numericType,
    })) };
  }));
  if (!saved?.customConfig?.chartConfig) {
    const table = tables[0];
    config.sources = table ? [{ tableId: table.id, category: table.fields[0]?.id ?? '',
      series: table.fields[1]?.id ?? table.fields[0]?.id ?? '', metric: table.fields.find(f => f.numeric)?.id ?? '', axisFields: [] }] : [];
  }
  return { tables, config, viewing, creating };
}
