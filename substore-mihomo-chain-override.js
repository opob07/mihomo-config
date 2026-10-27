// Sub-Store Mihomo 覆写脚本：链式代理版（前置 → 落地）
// 改造自 opob07/singbox-anltls 的 mihomo-overwrite-no-fallback.yaml
//
// 为什么不用 YAML + proxy-providers：
//   Sub-Store 的覆写里节点是由它自己注入到 proxies 的，如果再挂一个 proxy-providers 去直拉机场原始订阅，
//   就会出现两套节点（Sub-Store 管理的 + provider 直拉的），改名/去重/过滤全部不同步。
//   所以这里改成：给 Sub-Store 注入的节点复制一份副本，直接打上 dialer-proxy，与节点列表完全同步。
//
// 使用位置：Sub-Store → 订阅 / 组合订阅 → 「脚本操作」（与 powerfullz 的 JS 覆写同一个位置）
// 注意：这是 JS 脚本，不要放进「覆写」（那里只吃 YAML），也不要建成 YAML 类型的文件。
// 脚本协议：globalThis.main = (config) => newConfig
//
// 可选参数（脚本链接后面加 #a=b&c=d）：
//   front=🔗 前置代理   前置组名
//   prefix=链-          副本节点名前缀
//   skipudp=0           设为 0 时不再自动剔除 hy2/tuic/wg 等 UDP 类节点（默认剔除）

const ARGS = (() => {
  try {
    return $arguments || {};
  } catch (e) {
    return {};
  }
})();

const FRONT = ARGS.front || '🔗 前置代理';
const CHAIN = ARGS['chain'] || '🔗 链式代理';
const PREFIX = ARGS.prefix || '链-';
const SKIP_UDP = ARGS.skipudp === undefined ? true : !/^(0|false)$/i.test(String(ARGS.skipudp));

// 这些协议靠 UDP 传输，无法被前置代理的 TCP 隧道转发，选它做落地一定连不上
const UDP_TYPES = ['hysteria', 'hysteria2', 'tuic', 'wireguard'];

// 名称前缀可能含正则特殊字符，转义后再用于 exclude-filter
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PREFIX_RE = '^' + esc(PREFIX);

const TOP_GROUPS = ['🚀 默认代理', '🤖 AI', '🍎 Apple', '🎬 Emby'];

const RULES = [
  'AND,((RULE-SET,cn!_domain),(DST-PORT,443),(NETWORK,UDP)),REJECT',
  'RULE-SET,private_ip,DIRECT,no-resolve',
  'RULE-SET,private_domain,DIRECT',
  'RULE-SET,ai_domain,🤖 AI',
  'RULE-SET,microsoftcn_domain,DIRECT',
  'RULE-SET,applecn_domain,DIRECT',
  'RULE-SET,apple_domain,🍎 Apple',
  'RULE-SET,emby_domain,🎬 Emby',
  'RULE-SET,steamcn_domain,DIRECT',
  'RULE-SET,cn!_domain,🚀 默认代理',
  'RULE-SET,apple_ip,🍎 Apple',
  'RULE-SET,cn_ip,DIRECT',
  'MATCH,🐟 漏网之鱼',
];

const MRS = { type: 'http', interval: 86400, format: 'mrs' };
const RULE_PROVIDERS = {
  private_domain: Object.assign({}, MRS, { behavior: 'domain', url: 'https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/private.mrs' }),
  ai_domain: { type: 'http', interval: 86400, behavior: 'domain', format: 'yaml', url: 'https://ddgksf2013.top/filter/Ai.yaml' },
  microsoftcn_domain: Object.assign({}, MRS, { behavior: 'domain', url: 'https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/microsoft@cn.mrs' }),
  applecn_domain: Object.assign({}, MRS, { behavior: 'domain', url: 'https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/apple@cn.mrs' }),
  apple_domain: Object.assign({}, MRS, { behavior: 'domain', url: 'https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/apple.mrs' }),
  emby_domain: { type: 'http', interval: 86400, behavior: 'classical', format: 'text', url: 'https://raw.githubusercontent.com/opob07/singbox-anltls/main/Emby.list' },
  steamcn_domain: Object.assign({}, MRS, { behavior: 'domain', url: 'https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/steam@cn.mrs' }),
  'cn!_domain': Object.assign({}, MRS, { behavior: 'domain', url: 'https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/geolocation-!cn.mrs' }),
  apple_ip: Object.assign({}, MRS, { behavior: 'ipcidr', url: 'https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo-lite/geoip/apple.mrs' }),
  cn_ip: Object.assign({}, MRS, { behavior: 'ipcidr', url: 'https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geoip/cn.mrs' }),
  private_ip: Object.assign({}, MRS, { behavior: 'ipcidr', url: 'https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geoip/private.mrs' }),
};

// 与模板一致的全局设置（external-controller / external-ui 交给客户端自己管，避免端口打架）
const BASE = {
  mode: 'rule',
  'mixed-port': 7890,
  'allow-lan': true,
  'bind-address': '*',
  ipv6: false,
  'unified-delay': true,
  'tcp-concurrent': true,
  'log-level': 'info',
  'keep-alive-idle': 600,
  'keep-alive-interval': 15,
  profile: { 'store-selected': true, 'store-fake-ip': true },
  sniffer: {
    enable: true,
    sniff: {
      HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
      TLS: { ports: [443, 8443] },
      QUIC: { ports: [443, 8443] },
    },
    'skip-domain': ['Mijia Cloud', '+.push.apple.com'],
  },
  tun: {
    enable: true,
    stack: 'mixed',
    'dns-hijack': ['any:53', 'tcp://any:53'],
    'auto-route': true,
    'auto-redirect': true,
    'auto-detect-interface': true,
  },
  dns: {
    enable: true,
    'cache-algorithm': 'arc',
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.0/16',
    'fake-ip-filter-mode': 'blacklist',
    'fake-ip-filter': ['*', '+.lan', '+.local', '+.market.xiaomi.com'],
    'default-nameserver': ['223.5.5.5'],
    nameserver: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'],
  },
};

function buildGroups(chainNames) {
  const base = ['♻️ 自动选择', CHAIN, '🇭🇰 香港节点', '🇯🇵 日本节点', '🇸🇬 狮城节点', '🇺🇲 美国节点', '🇰🇷 韩国节点', '🌐 全部节点', 'DIRECT'];

  const groups = [
    // 前置/中转：只能选真实节点，排除「链-」副本，避免自己套自己
    { name: FRONT, type: 'select', 'include-all': true, filter: '^((?!(DIRECT)).)*$', 'exclude-filter': PREFIX_RE },
    // 落地/出口：只放带 dialer-proxy 的副本节点
    { name: CHAIN, type: 'select', proxies: chainNames.length ? chainNames.slice() : ['DIRECT'] },
  ];

  TOP_GROUPS.forEach((name) => groups.push({ name, type: 'select', proxies: base.slice() }));
  groups.push({ name: '🐟 漏网之鱼', type: 'select', proxies: ['🚀 默认代理'].concat(base) });

  const country = [
    ['🇭🇰 香港节点', '(?=.*(港|HK|(?i)Hong))^((?!(台|日|韩|新|深|美)).)*$'],
    ['🇯🇵 日本节点', '(?=.*(日|JP|(?i)Japan))^((?!(港|台|韩|新|美)).)*$'],
    ['🇸🇬 狮城节点', '(?=.*(新加坡|坡|狮城|SG|Singapore))^((?!(台|日|韩|深|美)).)*$'],
    ['🇺🇲 美国节点', '(?=.*(美|US|(?i)States|America))^((?!(港|台|韩|新|日)).)*$'],
    ['🇰🇷 韩国节点', '(?=.*(韩|KR|(?i)Korea))^((?!(港|台|日|新|美)).)*$'],
  ];
  country.forEach(([name, filter]) => {
    groups.push({ name, type: 'url-test', tolerance: 20, interval: 300, 'include-all': true, 'exclude-filter': PREFIX_RE, filter });
  });

  groups.push({ name: '♻️ 自动选择', type: 'url-test', tolerance: 20, interval: 300, 'include-all': true, 'exclude-filter': PREFIX_RE, filter: '^((?!(DIRECT)).)*$' });
  groups.push({ name: '🌐 全部节点', type: 'select', 'include-all': true });

  return groups;
}

function main(config) {
  config = config || {};
  const nodes = Array.isArray(config.proxies) ? config.proxies : [];
  if (!nodes.length) throw new Error('[链式覆写] 没有拿到节点，请检查订阅是否正常');

  const chainNodes = [];
  nodes.forEach((node) => {
    if (!node || !node.name) return;
    const type = String(node.type || '').toLowerCase();
    if (SKIP_UDP && UDP_TYPES.indexOf(type) >= 0) return;
    const copy = Object.assign({}, node);
    copy.name = PREFIX + node.name;
    copy['dialer-proxy'] = FRONT;
    chainNodes.push(copy);
  });

  const out = Object.assign({}, BASE, config);
  out.proxies = nodes.concat(chainNodes);
  out['proxy-groups'] = buildGroups(chainNodes.map((n) => n.name));
  out['rule-providers'] = RULE_PROVIDERS;
  out.rules = RULES.slice();
  return out;
}

globalThis.main = main;
