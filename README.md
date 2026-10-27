# mihomo 链式代理覆写配置

基于 [opob07/singbox-anltls](https://github.com/opob07/singbox-anltls) 的 `mihomo-overwrite-no-fallback.yaml` 改造，加入链式代理（前置 → 落地）。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `mihomo-overwrite-no-fallback-chain.yaml` | 客户端覆写（Clash Verge Rev / Mihomo Party / FlClash）；也可作为 Sub-Store「脚本操作」的 YAML 覆写 |
| `substore-mihomo-chain-override.js` | Sub-Store「脚本操作」的 JS 脚本，链式与 Sub-Store 节点同步 |

## 一、客户端用法（Clash Verge Rev / Mihomo Party / FlClash）

1. 把 `mihomo-overwrite-no-fallback-chain.yaml` 作为覆写规则导入，或粘贴到覆写规则里。
2. 修改 `proxy-providers.chain_sub.url`，填入你自己的机场订阅链接（与主订阅同一个即可）。
3. 在「🔗 前置代理」里选一个中转节点，再把需要的分组切到「🔗 链式代理」，在其中选落地节点。

原理：mihomo 的 `proxy-groups` 不支持 `dialer-proxy`，`relay` 类型已废弃，所以用 `proxy-providers` + `override.dialer-proxy` 给副本节点打上链式。

## 二、Sub-Store 用法

### 关键机制（容易踩坑）

「文件管理 → 新建/导入 → **mihomo 配置**」这个类型里：

- **文件内容不是模板**。当「来源」选订阅 / 组合订阅时，Sub-Store 只生成 `proxies:`，其余配置全部来自「**脚本操作**」。
- 「脚本操作」里的 Script Operator **两种模式都支持**（按内容自动判断）：
  - 内容能按 YAML 解析 → 当作 **YAML 补丁**，`deepMerge` 进配置
  - 否则 → 当作 **JS 执行**，`main(config)` 收到解析后的配置对象，返回值会被 dump 回 YAML
- 因此：把 JS 放进「文件内容」或「覆写」框会报 YAML 解析错误。

### 推荐做法（脚本，随订阅自动更新）

你原来的 YAML **一个字都不用改**，只要在「操作」里加一个脚本：

1. 文件 → 「操作」→ 添加 → 脚本 → 填：

```
https://raw.githubusercontent.com/opob07/mihomo-config/main/substore-mihomo-chain-override.js
```

2. **顺序必须放在「从订阅添加节点」之后**（脚本要先拿到节点）

脚本只做四件事：复制节点副本并打上 `dialer-proxy`、建「🔗 前置代理 / 🔗 链式代理」两个组、把链式组加进各选择组、让普通分组排除 `链-` 副本。

换订阅、换节点、改名都不用再管，副本自动跟着变。

可选参数（链接后加 `#`）：`front=🔗 前置代理`、`prefix=链-`、`skipudp=0`

### 备选做法（纯 YAML）

「脚本操作」里改用 YAML 补丁（把 `mihomo-overwrite-no-fallback-chain.yaml` 的内容粘进去，或填它的 raw 链接），
但必须把 `chain_sub.url` 改成**机场原始订阅**——这条路的链式节点由内核直连 provider 拉取，不经过 Sub-Store 管理。

## 注意

- 落地节点不要用 hy2 / tuic / wg 等 UDP 协议，前置无法用 TCP 隧道转发，一定连不上；reality / shadowtls 也可能失败。JS 版默认自动剔除 UDP 类节点。
- 链式流量在机场侧算双份，速度也会多一跳损耗。
- 分组用 `exclude-filter: ^链-` 排除副本节点，避免它们混进国家分组造成意外两跳。
- 给 Sub-Store 的 JS 脚本不要用 `/* */` 或 JSDoc 注释（`*` 会被 YAML 解析器当成 alias 报错），只用 `//`。
