# Batch Concurrency — 全量并行 + 客户分层

## 核心原则

上游 Seedance 根 API **无限并发**。这是我们最大的竞争优势。

并发控制的唯一目的是**客户分层**（销售工具），不是技术瓶颈保护。
批量提交必须全量并行推上游，不排队。

## 现状问题

`batch.Create` 逐个调 `jobSvc.Create`，每个都走 `throughput.Acquire`。
burst_concurrency 默认 8，200 条 shot 的批次前 8 条成功，剩下 192 条立即 429。

## 修复方案

### 1. throughput 服务加 `unlimited` 模式

`throughput_config` 表加 `unlimited BOOLEAN NOT NULL DEFAULT false`。

- `unlimited=true` 时 `Acquire` / `AcquireBatch` 永远成功（只记录在飞数，不拒绝）
- 给内部账号和大客户开

### 2. 默认值大幅调高

| 客户类型 | burst_concurrency | unlimited |
|---------|-------------------|-----------|
| 试用用户 | 5                 | false     |
| 小客户   | 50                | false     |
| 短剧客户 | 200               | false     |
| 企业客户 | 500               | false     |
| 内部/VIP | -                 | true      |

代码里的 lazy-default 从 `burst=8` 改为 `burst=200`。

### 3. 新增 `AcquireBatch` 方法

```go
func (s *Service) AcquireBatch(ctx context.Context, orgID string, count int, jobIDs []string) (accepted int, err error)
```

- unlimited org：全部通过，返回 count
- 有限 org：返回 `min(count, burst - inFlight)`
- 调用方根据返回值决定实际提交多少条

### 4. batch.Create 改为全量并行

1. 调 `AcquireBatch(orgID, len(shots), jobIDs)` — 一次性预留槽位
2. 一个事务里 INSERT 所有 job（status=queued）+ batch_run 行
3. 循环 enqueue 所有 `video:generate` Asynq 任务
4. 超出 burst 的部分：返回 partial success（accepted N of M）

### 5. batch_runs 加 max_parallel

用户可以主动设置 max_parallel（"我只想同时跑 10 条"），
实际并行度 = `min(max_parallel, burst - inFlight)`。
max_parallel 为 NULL 时表示不限（用满 burst）。

## Migration 00013

```sql
ALTER TABLE throughput_config ADD COLUMN unlimited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE batch_runs ADD COLUMN max_parallel INT;
```

## API 变更

### POST /v1/batch/runs

请求体新增可选字段：
```json
{ "max_parallel": 10 }
```

### GET /v1/batch/runs/:id

响应新增：
```json
{
  "concurrency": {
    "max_parallel": null,
    "org_burst_limit": 200,
    "org_unlimited": false,
    "current_in_flight": 47
  }
}
```

## 测试计划

1. unlimited org 提交 200 条 → 200 个 job 全部 queued + 入队
2. burst=50 org 提交 200 条 → accepted=50, rejected=150, 返回 partial
3. max_parallel=10 + burst=200 → 只推 10 条（后续由 processor 完成后自动补位——这是 Phase 1.5 的事）
4. 单条 API 请求仍走原有 Acquire 路径，不受影响

## 风险

- max_parallel 的"完成后自动补位"需要 processor 回调 batch dispatcher。
  Phase 1 先不做自动补位，max_parallel 仅在首次提交时生效。
  Phase 1.5 再加 processor 完成回调。
