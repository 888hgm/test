import type { IData } from '@lark-base-open/js-sdk';
import type { AxisField, Datum } from './model.ts';

/** 对选中字段的组合计数结果展开，每个字段独立计数，避免把组合放在横轴上。 */
export function unpivotFieldCounts(data: IData, fields: AxisField[]): Datum[] {
  return data.flatMap(row => {
    if (row.length !== fields.length + 1) throw new Error('飞书返回的字段统计列数与配置不一致，请重新选择横轴字段并保存');
    const count = row[fields.length].value;
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) throw new Error('飞书返回了无效的字段记录数');
    return fields.map((field, index) => ({
      category: field.name,
      series: row[index].text || String(row[index].value ?? '未填写') || '未填写',
      value: count,
    }));
  });
}
