// Sub-Store「mihomo 配置」文件专用脚本：给节点加链式代理（前置 → 落地）
//
// 用法：文件 → 操作 → 添加 → 脚本 → 填本文件 URL
//       位置必须放在「从订阅添加节点」之后（要先有节点）
// 特点：不改动你的 YAML 模板，只做四件事
//       1. 复制一份节点副本，名字加「链-」前缀，并打上 dialer-proxy
//       2. 建「🔗 前置代理」「🔗 链式代理」两个组
//       3. 把「🔗 链式代理」加进各个选择组
//       4. 让普通分组排除「链-」副本，避免意外两跳
//       换订阅时节点变了，副本自动跟着变，不用改任何东西
//
// 可选参数（URL 后加 #a=b&c=d）：front= / chain= / prefix= / skipudp=0

const ARGS = (() => {
  try {
    return $arguments || {};
  } catch (e) {
    return {};
  }
})();

const FRONT = ARGS.front || '🔗 前置代理';
const CHAIN = ARGS.chain || '🔗 链式代理';
const PREFIX = ARGS.prefix || '链-';
const SKIP_UDP = ARGS.skipudp === undefined ? true : !/^(0|false)$/i.test(String(ARGS.skipudp));

// 这些协议走 UDP，前置无法用 TCP 隧道转发，选它做落地一定连不上
const UDP_TYPES = ['hysteria', 'hysteria2', 'tuic', 'wireguard'];

const PREFIX_RE = '^' + String(PREFIX).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 这些组不排除副本：全部节点要能手动挑落地
const KEEP_ALL = ['🌐 全部节点', 'GLOBAL', CHAIN];

function addExcludeFilter(group) {
  const cur = group['exclude-filter'];
  if (cur && String(cur).indexOf(PREFIX_RE) >= 0) return;
  group['exclude-filter'] = cur ? String(cur) + '|' + PREFIX_RE : PREFIX_RE;
}

function main(config) {
  config = config || {};

  const all = Array.isArray(config.proxies) ? config.proxies : [];
  if (!all.length) {
    throw new Error('[链式] 没有拿到节点，请把本脚本放在「从订阅添加节点」之后');
  }

  // 清掉上次运行可能残留的副本，保证重复执行结果一致
  const nodes = all.filter((n) => n && n.name && String(n.name).indexOf(PREFIX) !== 0);

  const chain = [];
  nodes.forEach((n) => {
    if (SKIP_UDP && UDP_TYPES.indexOf(String(n.type || '').toLowerCase()) >= 0) return;
    const copy = Object.assign({}, n);
    copy.name = PREFIX + n.name;
    copy['dialer-proxy'] = FRONT;
    chain.push(copy);
  });

  config.proxies = nodes.concat(chain);

  const groups = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] : [];
  const find = (name) => groups.filter((g) => g && g.name === name)[0];

  // 前置组：只能选真实节点
  let front = find(FRONT);
  if (!front) {
    front = { name: FRONT, type: 'select', 'include-all': true };
    groups.unshift(front);
  }
  if (front['include-all'] || front['include-all-proxies']) addExcludeFilter(front);

  // 链式组：只放副本
  let chainGroup = find(CHAIN);
  if (!chainGroup) {
    chainGroup = { name: CHAIN, type: 'select', proxies: [] };
    groups.push(chainGroup);
  }
  chainGroup.proxies = chain.length ? chain.map((n) => n.name) : ['DIRECT'];

  groups.forEach((g) => {
    if (!g || KEEP_ALL.indexOf(g.name) >= 0) return;

    if (g['include-all'] || g['include-all-proxies']) addExcludeFilter(g);

    // 把链式组塞进带 DIRECT 的选择组（跳过拦截组之类）
    if (g.name !== FRONT && g.type === 'select' && Array.isArray(g.proxies)) {
      if (g.proxies.indexOf(CHAIN) >= 0) return;
      if (g.proxies.indexOf('REJECT') >= 0) return;
      const directAt = g.proxies.indexOf('DIRECT');
      if (directAt >= 0) g.proxies.splice(directAt, 0, CHAIN);
      else if (g.proxies.length >= 3) g.proxies.push(CHAIN);
    }
  });

  config['proxy-groups'] = groups;
  return config;
}

globalThis.main = main;
