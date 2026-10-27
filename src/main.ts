import './style.css';
import { defaultConfig, hydrateConfig, palettes, validateConfig, type Config, type Datum, type Source, type Table } from './model';
import { demoData, demoTables } from './demo';
import { createChart } from './chart';
import * as live from './feishu';

const STORAGE = 'feishu-chart-plugin:config:v1';
let config = defaultConfig();
let tables: Table[] = demoTables;
let data: Datum[] = [];
let activeTab = 'basic';
let viewing = false;
let creating = false;
let dataError = '';
let closed = false;
let filterOpen = false;
let sequence = 0;
let refreshTimer: ReturnType<typeof setTimeout>;
let toastTimer: ReturnType<typeof setTimeout>;
let savedJSON = '';
let busy = false;
let ready = !live.isFeishu;
const root = document.querySelector<HTMLDivElement>('#app')!;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const icons = {
  bars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20V10h4v10m2 0V4h4v16m2 0V7h4v13M2 20h20"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 4v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="15" cy="17" r="3" fill="white"/></svg>',
};
root.innerHTML = `
  <header class="app-header"><div class="brand-icon">${icons.bars}</div><div class="brand"><strong>柱状图组件</strong><span>飞书多维表格 / 自定义仪表盘 · v0.1.2</span></div><span id="mode-badge" class="badge">${live.isFeishu ? '连接飞书中' : '示例数据'}</span><div class="header-actions"><button id="save-top" class="button primary" data-action="save" hidden>添加到仪表盘</button><button class="button" data-action="export">${icons.arrow}导出图片</button><button class="button" data-action="toggle-panel">${icons.settings}<span id="toggle-label">配置</span></button></div></header>
  <div class="workspace"><main class="preview"><div class="preview-heading"><div><div class="eyebrow">图表预览</div><h1>让数据，一目了然。</h1></div><span class="live-indicator"><i></i><span id="data-status">实时预览</span></span></div>
    <section class="chart-card"><div class="card-heading"><div><h2 id="chart-title"></h2><p id="chart-subtitle"></p></div><span class="chart-kind" id="chart-kind"></span></div><div class="chart-wrap"><div id="chart" role="img" aria-label="柱状图预览"></div><div id="chart-message" role="status" hidden></div></div><div class="card-footer"><span id="source-note"></span><span id="record-note"></span></div></section>
    <section class="insights" aria-label="图表统计"><div><span id="stat-category-label">分类数量</span><strong id="stat-categories">—</strong><small id="stat-category-note">按所选横轴字段汇总</small></div><div><span>分组数量</span><strong id="stat-series">—</strong><small>当前图表中的数据系列</small></div><div><span id="stat-total-label">记录总数</span><strong id="stat-total">—</strong><small id="stat-total-note">统计范围内的记录</small></div></section>
    <p class="preview-note" id="preview-note">当前使用示例数据，调整右侧选项即可查看效果。</p>
  </main><aside class="sidebar" aria-label="柱状图配置"><div class="sidebar-header"><strong>柱状图</strong><button class="icon-button" data-action="toggle-panel" aria-label="收起配置">×</button></div><nav class="tabs" aria-label="配置选项卡"><button data-action="tab" data-value="basic" role="tab">基础配置</button><button data-action="tab" data-value="custom" role="tab">自定义配置</button><button data-action="tab" data-value="analysis" role="tab">分析</button></nav><div id="panel" class="panel"></div><footer class="sidebar-footer"><span id="save-state">尚未保存</span><button id="save" class="button primary" data-action="save">保存配置</button></footer></aside></div><div id="toast" class="toast" role="status" hidden></div>`;
const chart = createChart(document.querySelector<HTMLElement>('#chart')!);
const query = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
function check(key: keyof Config, label: string): string {
  return `<label class="check"><input type="checkbox" data-key="${key}" ${config[key] ? 'checked' : ''}><span>${label}</span></label>`;
}
function select(key: string, label: string, options: [string, string][], current: unknown, extra = ''): string {
  return `<label class="field"><span>${label}</span><select ${extra} data-key="${key}">${options.map(([value, name]) => `<option value="${escape(value)}" ${value === current ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></label>`;
}
function segments(action: string, options: [string, string][], current: string): string {
  return `<div class="segments">${options.map(([value, label]) => `<button type="button" data-action="${action}" data-value="${value}" class="${current === value ? 'selected' : ''}" aria-pressed="${current === value}">${label}</button>`).join('')}</div>`;
}
function sourceFields(source: Source, index: number): string {
  const table = tables.find(t => t.id === source.tableId);
  if (config.axisMode === 'fields') {
    const selected = source.axisFields ?? [];
    return `<div class="field" id="axis-fields-${index}"><span>横轴字段（每个字段一根柱）</span><div class="field-picker">${table?.fields.map(field => `<label class="check"><input type="checkbox" data-axis-field="${escape(field.id)}" data-source="${index}" ${selected.some(f => f.id === field.id) ? 'checked' : ''}><span>${escape(field.name)}</span></label>`).join('') || '<p class="help">请先选择数据表</p>'}</div></div>
      ${selected.length ? `<div class="axis-order"><span>柱子顺序</span>${selected.map((field, position) => `<div><b>${position + 1}</b><span>${escape(field.name)}</span><button data-action="move-field" data-source="${index}" data-index="${position}" data-step="-1" aria-label="上移 ${escape(field.name)}" ${position === 0 ? 'disabled' : ''}>↑</button><button data-action="move-field" data-source="${index}" data-index="${position}" data-step="1" aria-label="下移 ${escape(field.name)}" ${position === selected.length - 1 ? 'disabled' : ''}>↓</button></div>`).join('')}</div>` : ''}<p class="help">柱内按每个字段的值统计记录数，同名选项使用同一个颜色。空值计入“未填写”。</p>`;
  }
  const fields: [string, string][] = [['', '请选择字段'], ...(table?.fields.map(f => [f.id, f.name] as [string, string]) ?? [])];
  return `${select('category', index ? '分类字段' : '横轴（类别）', fields, source.category, `data-source="${index}"`)}
    ${config.aggregate !== 'count' ? select('metric', '数值字段', [['', '请选择数字字段'], ...(table?.fields.filter(f => f.numeric).map(f => [f.id, f.name] as [string, string]) ?? [])], source.metric, `data-source="${index}"`) : ''}
    ${config.grouped ? select('series', '分组依据', fields, source.series, `data-source="${index}"`) : ''}`;
}
function renderPanel(): void {
  document.querySelectorAll<HTMLElement>('[data-action="tab"]').forEach(el => {
    el.classList.toggle('active', el.dataset.value === activeTab);
    el.setAttribute('aria-selected', String(el.dataset.value === activeTab));
  });
  const source = config.sources[0];
  const tableOptions: [string, string][] = [['', '请选择数据表'], ...tables.map(t => [t.id, t.name] as [string, string])];
  if (activeTab === 'basic') query('#panel').innerHTML = `
    ${creating && config.axisMode === 'fields' ? '<div class="creation-guide"><strong>选择字段后，添加到仪表盘</strong><p>先选择数据表，再勾选横轴字段。完成后点击上方或底部的“添加到仪表盘”。</p><button class="text-button" data-action="choose-fields">去选择横轴字段 ↓</button></div>' : ''}
    <div class="section"><label class="field"><span>标题</span><input data-key="title" value="${escape(config.title)}" maxlength="100" placeholder="请输入图表标题"></label>${check('showTitle', '显示标题')}</div>
    <div class="section">${select('axisMode', '横轴模式', [['fields', '多个字段各自作为一根柱'], ['values', '单个字段的值作为分类']], config.axisMode)}${select('tableId', '数据源', tableOptions, source?.tableId, 'data-source="0"')}${check('multi', '多数据源模式')}
      ${config.multi ? `<div class="additional-sources">${config.sources.slice(1).map((s, i) => `<div class="source-block"><div class="source-block-heading">数据源 ${i + 2}<button class="text-button" data-action="remove-source" data-index="${i + 1}">移除</button></div>${select('tableId', '', tableOptions, s.tableId, `data-source="${i + 1}"`)}${sourceFields(s, i + 1)}</div>`).join('')}<button class="add-source" data-action="add-source">＋ 添加数据源</button><p class="help">分别映射字段后合并同名类别；支持计数与求和。</p></div>` : ''}
      <label class="field range-field"><span>数据范围</span><div class="range-box"><span>▤ 全部数据</span><button class="text-button" data-action="filter">筛选${config.filter ? ' (1)' : ''}</button></div></label>
      ${filterOpen || config.filter ? `<label class="field filter-field"><span>仅显示分类名称包含</span><input data-key="filter" value="${escape(config.filter)}" placeholder="输入关键词，清空则显示全部"><small>对汇总后的分类筛选，不改变原始记录。</small></label>` : ''}</div>
    <div class="section">${select('chartType', '图表类型', [['percent', '百分比堆积柱状图'], ['stacked', '堆积柱状图'], ['grouped', '分组柱状图']], config.chartType)}
      <div class="field"><span>主题色</span><div class="palette-field"><span class="swatches">${palettes[config.palette].colors.map(c => `<i style="background:${c}"></i>`).join('')}</span><select data-key="palette" aria-label="主题色">${Object.entries(palettes).map(([key, p]) => `<option value="${key}" ${key === config.palette ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div></div>
      ${check('gradient', '渐变填充')}<div class="field options-label"><span>图表选项</span></div><div class="check-grid">${check('legend', '图例')}${check('labels', '数据标签')}${check('axes', '坐标轴')}${check('grid', '网格线')}</div></div>
    <div class="section">${source ? sourceFields(source, 0) : '<p class="help">请先选择数据源</p>'}${config.axisMode === 'values' ? '<p class="help">相同类别自动汇总。</p>' : ''}<div class="field"><span>横轴排序依据</span>${segments('category-order', [['value', config.axisMode === 'fields' ? '字段名称' : '横轴值'], ['total', '统计值'], ['original', config.axisMode === 'fields' ? '选择顺序' : '返回顺序']], config.categorySort === 'original' ? 'original' : config.categoryOrder)}</div>${config.categorySort !== 'original' ? `<div class="field"><span>排序规则</span>${segments('category-sort', [['asc', '↥ 正序'], ['desc', '↧ 倒序']], config.categorySort)}</div>` : ''}</div>
    <div class="section">${select('aggregate', '纵轴（统计方式）', config.axisMode === 'fields' ? [['count', '统计记录总数']] : [['count', '统计记录总数'], ['sum', '求和'], ...(!config.multi || config.sources.length <= 1 ? [['avg', '平均值'], ['max', '最大值'], ['min', '最小值']] as [string, string][] : [])], config.aggregate)}${config.axisMode === 'values' ? check('grouped', '分组聚合') : '<p class="help">柱内分段依据：每个横轴字段自身的值。</p>'}
      ${config.grouped ? `<div class="group-box"><div class="field"><span>分组排序依据</span>${segments('series-order', [['value', '字段值'], ['original', '返回顺序']], config.seriesSort === 'original' ? 'original' : 'value')}</div>${config.seriesSort !== 'original' ? `<div class="field"><span>排序规则</span>${segments('series-sort', [['asc', '↥ 正序'], ['desc', '↧ 倒序']], config.seriesSort)}</div>` : ''}</div>` : ''}</div>
    <div class="section last"><label class="switch-row"><span>切换行 / 列</span><input type="checkbox" role="switch" data-key="transpose" ${config.transpose ? 'checked' : ''}></label>${select('empty', '零值标签显示为', [['blank', '空'], ['zero', '0'], ['dash', '—']], config.empty)}</div>`;
  else if (activeTab === 'custom') query('#panel').innerHTML = `
    <div class="section"><div class="panel-intro"><span class="intro-icon">Aa</span><strong>调整图表细节</strong><p>让同一份数据，更适合你的展示场景。</p></div><label class="field"><span>副标题</span><input data-key="subtitle" value="${escape(config.subtitle)}" placeholder="添加说明或统计口径" maxlength="200"></label>${select('decimals', '数值小数位', [['0', '不保留小数'], ['1', '保留 1 位'], ['2', '保留 2 位']], String(config.decimals))}</div>
    <div class="section"><label class="field"><span>柱体最大宽度 <b id="width-value">${config.barWidth}px</b></span><input type="range" min="16" max="96" step="2" data-key="barWidth" value="${config.barWidth}"></label>${check('rounded', '柱体圆角')}</div><div class="section"><button class="button full-width" data-action="reset">恢复默认配置</button><p class="help">恢复后点击“保存配置”才会覆盖已保存设置。</p></div>`;
  else renderAnalysis();
  updateSaveState();
}
function renderAnalysis(): void {
  const rows = data.filter(d => !config.filter || d.category.includes(config.filter));
  query('#panel').innerHTML = `<div class="section"><div class="panel-intro"><span class="intro-icon">Σ</span><strong>当前统计结果</strong><p>${live.isFeishu ? '来自当前飞书数据源' : '当前展示的是本地示例数据'}。${config.filter ? '已应用分类关键词筛选。' : ''}</p></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>分类</th><th>分组</th><th>数值</th></tr></thead><tbody>${rows.slice(0, 100).map(row => `<tr><td>${escape(row.category)}</td><td>${escape(row.series)}</td><td>${row.value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</td></tr>`).join('') || '<tr><td colspan="3">暂无数据</td></tr>'}</tbody></table></div>${rows.length > 100 ? '<p class="help">预览前 100 行汇总结果。</p>' : ''}</div>`;
}
function updateSaveState(): void {
  const dirty = savedJSON !== JSON.stringify(config);
  query('#save-state').textContent = dirty ? '有未保存的更改' : live.isFeishu ? '配置已保存' : '已保存到此浏览器';
  query('#save-state').classList.toggle('dirty', dirty);
  const actionLabel = creating ? '添加到仪表盘' : '保存配置';
  document.querySelectorAll<HTMLButtonElement>('[data-action="save"]').forEach(button => {
    button.disabled = busy || !ready;
    button.textContent = busy ? '提交中…' : actionLabel;
  });
  query('#save-top').hidden = !creating;
}
function toast(message: string): void {
  const el = query('#toast'); el.textContent = message; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}
function chartMessage(message: string, error = false): void {
  const el = query('#chart-message'); el.textContent = message; el.hidden = !message;
  el.classList.toggle('error', error);
}
function draw(): void {
  query('#chart-title').textContent = config.title || '未命名图表';
  query('#chart-title').hidden = !config.showTitle;
  query('#chart-subtitle').textContent = config.subtitle || (config.axisMode === 'fields' ? '每个字段一根柱，按字段值统计记录数' : config.aggregate === 'count' ? '按所选分类与分组统计记录数量' : '按所选数值字段进行统计');
  query('#chart-kind').textContent = ({ percent: '百分比堆积', stacked: '堆积柱状', grouped: '分组柱状' })[config.chartType];
  query('#source-note').textContent = (config.multi ? config.sources : config.sources.slice(0, 1)).map(s => tables.find(t => t.id === s.tableId)?.name ?? (live.isFeishu ? '飞书数据表' : '请选择数据源')).join(' + ');
  const matrix = chart.draw(data, config);
  const total = matrix.values.flat().reduce((sum, n) => sum + n, 0);
  query('#stat-categories').textContent = String(matrix.categories.length);
  query('#stat-series').textContent = String(matrix.series.length);
  query('#stat-total').textContent = total.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  query('#stat-category-label').textContent = config.axisMode === 'fields' ? '横轴字段数' : '分类数量';
  query('#stat-category-note').textContent = config.axisMode === 'fields' ? '每个选中字段对应一根柱' : '按所选横轴字段汇总';
  query('#stat-total-label').textContent = config.axisMode === 'fields' ? '字段统计次数' : config.aggregate === 'count' ? '记录总数' : '统计结果合计';
  query('#stat-total-note').textContent = config.axisMode === 'fields' ? '每条记录在每个字段各统计一次' : config.aggregate === 'count' ? '当前分类范围内的记录' : '图表各统计值之和';
  query('#record-note').textContent = `${matrix.categories.length} 个分类 · ${matrix.series.length} 个分组`;
  if (dataError) {
    const selecting = dataError === '请至少选择一个横轴字段';
    chartMessage(selecting ? '请在右侧勾选横轴字段，每个字段会显示一根堆积柱。' : dataError, !selecting);
  } else chartMessage(matrix.categories.length ? '' : '暂无符合条件的数据');
  if (activeTab === 'analysis') renderAnalysis();
}
function report(error: unknown): void {
  dataError = error instanceof Error ? error.message : '数据加载失败，请重试';
  const selecting = dataError === '请至少选择一个横轴字段';
  chartMessage(selecting ? '请在右侧勾选横轴字段，每个字段会显示一根堆积柱。' : dataError, !selecting);
  query('#data-status').textContent = selecting ? '请选择横轴字段' : '需要检查配置';
}
async function refresh(): Promise<void> {
  if (!ready) return;
  const request = ++sequence;
  dataError = '';
  const snapshot = structuredClone(config);
  const validation = viewing ? null : validateConfig(snapshot, tables);
  if (validation) { data = []; try { draw(); } catch {} report(new Error(validation)); return; }
  try {
    query('#data-status').textContent = '更新中';
    if (live.isFeishu) chartMessage('正在读取飞书数据…');
    const result = live.isFeishu ? await live.loadLiveData(snapshot, viewing) : demoData(snapshot);
    if (request !== sequence) return;
    data = result; draw(); query('#data-status').textContent = '实时预览';
    if (live.isFeishu && viewing) await live.rendered();
  } catch (error) { if (request === sequence) report(error); }
}
function changed(fetch = true): void {
  updateSaveState();
  clearTimeout(refreshTimer);
  if (fetch) refreshTimer = setTimeout(() => { void refresh(); }, 180);
  else { try { draw(); } catch (error) { report(error); } }
}
function newSource(tableId: string): Source {
  const table = tables.find(t => t.id === tableId);
  const axisFields = (config.sources[0]?.axisFields ?? []).flatMap(selected => {
    const match = table?.fields.find(f => f.name === selected.name);
    return match ? [{ id: match.id, name: match.name }] : [];
  });
  return { tableId, category: table?.fields[0]?.id ?? '', series: table?.fields[1]?.id ?? table?.fields[0]?.id ?? '', metric: table?.fields.find(f => f.numeric)?.id ?? '', axisFields };
}
root.addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  if (!target.dataset.key || target.tagName !== 'INPUT' || target.type === 'checkbox') return;
  const key = target.dataset.key as 'title' | 'subtitle' | 'filter' | 'decimals' | 'barWidth';
  if (key === 'barWidth' || key === 'decimals') config[key] = Number(target.value);
  else config[key] = target.value;
  if (key === 'barWidth') query('#width-value').textContent = `${target.value}px`;
  changed(false);
});
root.addEventListener('change', event => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target instanceof HTMLInputElement && target.dataset.axisField) {
    const source = config.sources[Number(target.dataset.source)];
    const field = tables.find(t => t.id === source.tableId)?.fields.find(f => f.id === target.dataset.axisField);
    if (!field) return;
    source.axisFields = (source.axisFields ?? []).filter(f => f.id !== field.id);
    if (target.checked) source.axisFields.push({ id: field.id, name: field.name });
    renderPanel(); changed(); return;
  }
  if (!target.dataset.key) return;
  const key = target.dataset.key;
  if (target.dataset.source !== undefined) {
    const index = Number(target.dataset.source);
    if (key === 'tableId') config.sources[index] = newSource(target.value);
    else config.sources[index][key as 'category' | 'metric' | 'series'] = target.value;
  } else if (target instanceof HTMLInputElement && target.type === 'checkbox') {
    (config as unknown as Record<string, unknown>)[key] = target.checked;
    if (key === 'multi' && config.multi && !['count', 'sum'].includes(config.aggregate)) config.aggregate = 'count';
  } else if (target.tagName === 'SELECT') {
    (config as unknown as Record<string, unknown>)[key] = key === 'decimals' ? Number(target.value) : target.value;
    if (key === 'axisMode' && config.axisMode === 'fields') { config.aggregate = 'count'; config.grouped = true; config.categorySort = 'original'; }
  } else return;
  renderPanel(); changed();
});
root.addEventListener('click', async event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'tab') { activeTab = button.dataset.value!; renderPanel(); return; }
  if (action === 'choose-fields') {
    activeTab = 'basic'; renderPanel();
    document.getElementById('axis-fields-0')?.scrollIntoView({ block: 'center' });
    return;
  }
  if (action === 'toggle-panel') { closed = !closed; root.classList.toggle('panel-closed', closed); return; }
  if (action === 'filter') { filterOpen = !filterOpen; renderPanel(); return; }
  if (action === 'add-source') {
    const next = tables.find(t => !config.sources.some(s => s.tableId === t.id));
    if (!next) { toast('所有可用数据表均已添加'); return; }
    config.sources.push(newSource(next.id));
    if (!['count', 'sum'].includes(config.aggregate)) config.aggregate = 'count';
  } else if (action === 'move-field') {
    const fields = config.sources[Number(button.dataset.source)].axisFields ?? [];
    const index = Number(button.dataset.index), next = index + Number(button.dataset.step);
    if (next < 0 || next >= fields.length) return;
    [fields[index], fields[next]] = [fields[next], fields[index]];
    config.categorySort = 'original';
  } else if (action === 'remove-source') config.sources.splice(Number(button.dataset.index), 1);
  else if (action === 'category-order') {
    if (button.dataset.value === 'original') config.categorySort = 'original';
    else { config.categoryOrder = button.dataset.value as 'value' | 'total'; if (config.categorySort === 'original') config.categorySort = 'asc'; }
  } else if (action === 'category-sort') config.categorySort = button.dataset.value as 'asc' | 'desc';
  else if (action === 'series-order') config.seriesSort = button.dataset.value === 'original' ? 'original' : 'asc';
  else if (action === 'series-sort') config.seriesSort = button.dataset.value as 'asc' | 'desc';
  else if (action === 'reset') {
    const sources = structuredClone(config.sources);
    config = defaultConfig(); config.sources = sources; toast('已恢复默认设置，保存后生效');
  } else if (action === 'export') {
    if (!data.length || !query('#chart-message').hidden) { toast('请先加载有效图表'); return; }
    const link = document.createElement('a'); link.download = `${(config.title || '柱状图').replace(/[\\/:*?"<>|]/g, '_')}.png`; link.href = chart.exportPNG(); link.click(); return;
  } else if (action === 'save') {
    const validation = validateConfig(config, tables);
    if (validation) {
      toast(validation);
      if (config.axisMode === 'fields') {
        activeTab = 'basic'; renderPanel();
        document.getElementById('axis-fields-0')?.scrollIntoView({ block: 'center' });
      }
      return;
    }
    busy = true; updateSaveState();
    const snapshot = structuredClone(config);
    try {
      if (live.isFeishu) await live.saveLive(snapshot);
      else localStorage.setItem(STORAGE, JSON.stringify(snapshot));
      savedJSON = JSON.stringify(snapshot);
      const wasCreating = creating; creating = false;
      toast(live.isFeishu ? (wasCreating ? '已提交添加到飞书仪表盘' : '已保存到飞书仪表盘') : '配置已保存到此浏览器');
    } catch (error) { toast(error instanceof Error ? error.message : '保存失败'); }
    finally { busy = false; updateSaveState(); }
    return;
  } else return;
  renderPanel(); changed();
});
async function init(): Promise<void> {
  if (live.isFeishu) {
    query('#preview-note').textContent = '正在连接飞书仪表盘…';
    chartMessage('正在连接飞书…');
    renderPanel();
    try {
      const result = await Promise.race([live.connect(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('飞书连接超时，请在仪表盘插件中打开此地址')), 15000))]);
      ({ tables, config, viewing, creating } = result); ready = true;
      root.classList.toggle('embedded-view', viewing);
      query('#mode-badge').textContent = '飞书数据';
      query('#preview-note').textContent = '数据由飞书仪表盘 SDK 提供。';
      live.subscribe(() => { void refresh(); }, next => { config = next; savedJSON = JSON.stringify(next); renderPanel(); void refresh(); });
      void live.syncTheme(() => { try { draw(); } catch (error) { report(error); } }).catch(() => {});
    } catch (error) {
      query('#mode-badge').textContent = '未连接'; query('#preview-note').textContent = '飞书连接失败，未加载示例数据。'; report(error); return;
    }
  } else {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) { config = hydrateConfig(JSON.parse(saved)); savedJSON = JSON.stringify(config); }
    } catch { toast('浏览器存储不可用，仍可预览图表'); }
  }
  renderPanel(); await refresh();
}
void init();
