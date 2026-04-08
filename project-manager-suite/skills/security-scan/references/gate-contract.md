# Security Scan Gate Contract

## Purpose

`security-scan` 是生产发布前的固定安全闸门，不是开放式安全建议器。

## Mandatory Triggers

出现以下任一表达时，默认触发本 skill：

- 上线
- 发版
- 发布生产
- 生产环境放行
- go-live
- release blocking
- 最终安全检查
- 能不能上线

## Default Scan Mode

- 默认模式：`full`
- 默认覆盖：`network + code + authz + api + secrets + dependencies + config + ci/cd`

如果用户明确要求只看某一部分，可以降级为局部扫描，但必须在报告中标记为 `partial`。

## Allowed Final Decisions

最终结论只能是以下三种之一：

- `PASS`
- `BLOCK`
- `WAIVER`

## Hard Stops

- 未完成扫描前，不得给出“可上线”结论。
- 未写明输入证据缺口时，不得假装已完成全量扫描。
- 存在 `Critical` 风险、密钥泄漏、或已知在野利用风险时，默认不得放行。

