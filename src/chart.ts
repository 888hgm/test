import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { graphic } from 'echarts/core';
import { matrixFromData, palettes, percentMatrix, type Config, type Datum } from './model';
echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, AriaComponent, CanvasRenderer]);
export function createChart(element: HTMLElement) {
  const chart = echarts.init(element);
  let latest: { data: Datum[]; config: Config } | null = null;
  let redraw = () => {};
  const observer = new ResizeObserver(() => { chart.resize(); redraw(); });
  observer.observe(element);
  const api = {
    draw(data: Datum[], config: Config) {
      latest = { data, config };
      const matrix = matrixFromData(data, config);
      const percent = config.chartType === 'percent';
      if (percent && matrix.values.some(row => row.some(n => n < 0))) throw new Error('百分比堆积图暂不支持负数，请改用分组柱状图');
      const values = percent ? percentMatrix(matrix) : matrix.values;
      const colors = palettes[config.palette].colors;
      const narrow = element.clientWidth < 480;
      const crowded = !config.transpose && (element.clientWidth - 100) / Math.max(matrix.categories.length, 1) < 60;
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1f2329';
      const text = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: config.decimals });
      const categoryAxis = { type: 'category' as const, data: matrix.categories,
        axisTick: { show: false }, axisLine: { show: config.axes, lineStyle: { color: '#dee3eb' } },
        axisLabel: { show: config.axes, color: ink, margin: 16, interval: 0, width: crowded ? 65 : 90, rotate: crowded ? 35 : 0, overflow: 'truncate' as const } };
      const valueAxis = { type: 'value' as const, max: percent ? 100 : undefined,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { show: config.axes, color: ink, formatter: (v: number) => text(v) + (percent ? '%' : '') },
        splitLine: { show: config.grid, lineStyle: { color: '#edf0f5', type: 'dashed' as const } } };
      chart.setOption({
        animationDuration: 350, color: colors, textStyle: { fontFamily: 'Inter, Microsoft YaHei, sans-serif' },
        aria: { enabled: true, description: `${config.title}，${matrix.categories.length} 个类别，${matrix.series.length} 个系列` },
        grid: { left: config.axes ? (narrow ? 48 : 68) : 28, right: narrow ? 18 : 30, top: config.legend ? 66 : 32, bottom: matrix.categories.length > 12 ? 85 : crowded ? 70 : 45, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
        legend: { show: config.legend, top: 4, right: 24, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 22, textStyle: { color: ink, fontSize: 12 } },
        tooltip: { trigger: 'axis', renderMode: 'richText', axisPointer: { type: 'shadow' },
          valueFormatter: (value: unknown) => typeof value === 'number' ? text(value) + (percent ? '%' : '') : String(value) },
        xAxis: config.transpose ? valueAxis : categoryAxis,
        yAxis: config.transpose ? categoryAxis : valueAxis,
        dataZoom: matrix.categories.length > 12 ? [{ type: 'slider', [config.transpose ? 'yAxisIndex' : 'xAxisIndex']: 0, start: 0, end: 100 * 12 / matrix.categories.length, height: 18 }] : [],
        series: matrix.series.map((name, s) => ({
          name, type: 'bar', stack: config.chartType === 'grouped' ? undefined : 'total',
          barMaxWidth: config.barWidth, barGap: '20%', emphasis: { focus: 'series' },
          itemStyle: { borderRadius: config.rounded ? (config.transpose ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0,
            color: config.gradient ? new graphic.LinearGradient(0, 0, config.transpose ? 1 : 0, config.transpose ? 0 : 1,
              [{ offset: 0, color: colors[s % colors.length] }, { offset: 1, color: colors[s % colors.length] + '80' }]) : colors[s % colors.length] },
          label: { show: config.labels, position: config.chartType === 'grouped' ? (config.transpose ? 'right' : 'top') : 'inside',
            color: config.chartType === 'grouped' ? ink : '#fff', fontWeight: 500,
            formatter: (params: { value: unknown }) => {
              const n = Number(params.value);
              return n === 0 ? (config.empty === 'zero' ? '0' : config.empty === 'dash' ? '—' : '') : text(n) + (percent ? '%' : '');
            } },
          data: values[s],
        })),
      }, { notMerge: true });
      chart.resize();
      return matrix;
    },
    exportPNG() { return chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#fff' }); },
    dispose() { observer.disconnect(); chart.dispose(); },
  };
  redraw = () => { if (latest) api.draw(latest.data, latest.config); };
  return api;
}
