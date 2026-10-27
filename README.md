# mihomo 链式代理覆写配置

基于 [opob07/singbox-anltls](https://github.com/opob07/singbox-anltls) 的 `mihomo-overwrite-no-fallback.yaml` 改造，加入链式代理（前置 → 落地）。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `mihomo-overwrite-no-fallback-chain.yaml` | 客户端覆写用（Clash Verge Rev / Mihomo Party / FlClash 的「覆写」） |
| `substore-mihomo-chain-override.js` | Sub-Store 覆写脚本（JS），节点与 Sub-Store 同步 |

## 客户端用法（Clash Verge Rev / Mihomo Party / FlClash）

1. 把 `mihomo-overwrite-no-fallback-chain.yaml` 作为覆写规则导入，或粘贴到覆写规则里。
2. 修改 `proxy-providers.chain_sub.url`，填入你自己的机场订阅链接（与主订阅同一个即可）。
3. 在「🔗 前置代理」里选一个中转节点，再把需要的分组切到「🔗 链式代理」，在其中选落地节点。

原理：mihomo 的 `proxy-groups` 不支持 `dialer-proxy`，`relay` 类型已废弃，所以用 `proxy-providers` + `override.dialer-proxy` 给副本节点打上链式。

## Sub-Store 用法

在订阅 / 组合订阅的「脚本操作」里填入本仓库脚本链接（与 powerfullz 的 JS 覆写同一位置）：

```
https://cdn.jsdelivr.net/gh/<用户名>/<仓库名>@main/substore-mihomo-chain-override.js
```

可选参数（链接后加 `#`）：`front=🔗 前置代理`、`prefix=链-`、`skipudp=0`。

Sub-Store 的覆写里节点由它自己注入，不能写 `proxies:`，也不该再用 `proxy-providers` 二次拉订阅，所以脚本改为给节点复制副本并直接打 `dialer-proxy`。

## 注意

- 落地节点不要用 hy2 / tuic / wg 等 UDP 协议，前置无法用 TCP 隧道转发，一定连不上；reality / shadowtls 也可能失败。脚本默认自动剔除 UDP 类节点。
- 链式流量在机场侧算双份，速度也会多一跳损耗。
- 分组用 `exclude-filter: ^链-` 排除副本节点，避免它们混进国家分组造成意外两跳。
