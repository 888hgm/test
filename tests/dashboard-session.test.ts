import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDashboard, type SessionAPI } from '../src/dashboard-session.ts';
import { defaultConfig } from '../src/model.ts';

function fixture(state: string) {
  const calls: string[] = [];
  const saved = defaultConfig();
  saved.sources = [{ tableId: 'tbl-real', category: 'status', series: 'status', metric: '', axisFields: [{ id: 'status', name: '进度' }] }];
  const api: SessionAPI = {
    dashboard: { state, async getConfig() {
      calls.push('getConfig');
      if (state === 'Create') throw new Error('currently in creation status, unable to invoke this API');
      return { customConfig: { chartConfig: saved } };
    } },
    base: {
      async getTableMetaList() { calls.push('getTableMetaList'); return [{ id: 'tbl-real', name: '真实项目表' }]; },
      async getTableById() { return { async getFieldMetaList() { return [{ id: 'status', name: '进度', type: 3 }]; } }; },
    },
  };
  return { api, calls, saved };
}

test('首次 Create 状态不读取尚不存在的配置，能加载真实表格供用户选择', async () => {
  const { api, calls } = fixture('Create');
  const result = await initializeDashboard(api, 2);
  assert.equal(result.viewing, false);
  assert.deepEqual(calls, ['getTableMetaList']);
  assert.equal(result.tables[0].name, '真实项目表');
  assert.equal(result.config.sources[0].tableId, 'tbl-real');
  assert.deepEqual(result.config.sources[0].axisFields, []);
});

test('Config 状态读取已保存字段配置并加载数据表', async () => {
  const { api, calls, saved } = fixture('Config');
  const result = await initializeDashboard(api, 2);
  assert.deepEqual(calls, ['getConfig', 'getTableMetaList']);
  assert.deepEqual(result.config, saved);
});

for (const state of ['View', 'FullScreen']) test(`${state} 状态恢复图表配置，不读取编辑用表格元数据`, async () => {
  const { api, calls, saved } = fixture(state);
  const result = await initializeDashboard(api, 2);
  assert.equal(result.viewing, true);
  assert.deepEqual(calls, ['getConfig']);
  assert.deepEqual(result.config, saved);
});

test('已有配置的权限错误仍然上报，不用空配置掩盖', async () => {
  const { api } = fixture('Config');
  api.dashboard.getConfig = async () => { throw new Error('权限不足'); };
  await assert.rejects(initializeDashboard(api, 2), /权限不足/);
});
