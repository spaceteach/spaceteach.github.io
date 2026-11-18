(function () {
  'use strict';

  if (window.__VCPC_ICPC_RULES__) return;
  window.__VCPC_ICPC_RULES__ = true;

  var V = window.VCPC;
  if (!V || !V.Save || !V.UI || !V.Rating) {
    console.warn('[ICPC] VCPC modules unavailable, rules patch skipped');
    return;
  }

  var Save = V.Save;
  var Rating = V.Rating;
  var UI = V.UI;
  var App = V.App;

  var MAX_SEASONS = 5;
  var MAX_WF = 2;
  var S5_TP_COST = 3;
  var S5_TP_BONUS = 0.15;
  var S5_RATING_PENALTY = 60;

  var SEASON_TEXT = {
    1: '大一。第一次站上赛场。',
    2: '大二了，重整旗鼓。',
    3: '大三。留给你的时间不多了。',
    4: '大四。最后一舞……吗？',
    5: '第五年。规则允许，但队友还愿意吗？'
  };

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function defaults() {
    return {
      intro: 0, s5: '', retired: false, wf: [0, 0, 0],
      autoJudge: false, autoProxy: false,
      school: '北京大学', abbr: '', tier: 'S',
      regionalSeen: false, wcSeason: 0, wcApplied: 0, wcGranted: 0
    };
  }

  var TIER_LABEL = { S: '顶尖', A: '一流', B: '强势', C: '中坚', D: '新军', INTL: '境外', X: '未收录' };
  var TIER_FACTOR = { S: 0.3, A: 0.55, B: 0.85, C: 1.1, D: 1.3, INTL: 0.35, X: 1.4 };
  var TIER_QUOTA = { S: 4, A: 4, B: 3, C: 2, D: 2, INTL: 2, X: 1 };

  function ensure(profile) {
    if (!profile) return null;
    var s = profile.icpc;
    if (!s || typeof s !== 'object') s = profile.icpc = defaults();
    var d = defaults();
    Object.keys(d).forEach(function (k) {
      if (s[k] === undefined) s[k] = d[k];
    });
    s.intro = Math.max(0, Math.round(Number(s.intro) || 0));
    s.s5 = s.s5 === 'done' ? 'done' : '';
    s.retired = !!s.retired;
    s.autoJudge = !!s.autoJudge;
    s.autoProxy = !!s.autoProxy;
    s.regionalSeen = !!s.regionalSeen;
    if (!Array.isArray(s.wf)) s.wf = [0, 0, 0];
    s.wf = [0, 1, 2].map(function (i) { return clamp(Math.round(Number(s.wf[i]) || 0), 0, MAX_WF); });
    s.school = String(s.school || d.school).slice(0, 20);
    s.abbr = String(s.abbr || d.abbr).slice(0, 10).toUpperCase();
    s.tier = TIER_FACTOR[s.tier] ? s.tier : 'X';
    s.wcSeason = Math.round(Number(s.wcSeason) || 0);
    s.wcApplied = Math.round(Number(s.wcApplied) || 0);
    s.wcGranted = Math.round(Number(s.wcGranted) || 0);
    if ((profile.season || 1) > MAX_SEASONS) {
      profile.season = MAX_SEASONS;
      s.retired = true;
    }
    return s;
  }

  function persist() {
    try {
      if (App && App.state && App.state.profile) Save.write(App.state.profile);
    } catch (e) {
      console.warn('[ICPC] save failed', e);
    }
  }

  // ---- persistence -------------------------------------------------------
  if (typeof Save.normalize === 'function') {
    var origNormalize = Save.normalize;
    Save.normalize = function (raw) {
      var out = origNormalize.apply(this, arguments);
      if (out) {
        var src = raw && raw.icpc;
        out.icpc = mergeIcpc(src);
        ensure(out);
      }
      return out;
    };
  }

  function mergeIcpc(src) {
    var out = defaults();
    if (src && typeof src === 'object') {
      Object.keys(out).forEach(function (k) {
        if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
      });
      if (Array.isArray(src.wf)) out.wf = src.wf.slice(0, 3);
    }
    return out;
  }

  if (typeof Save.compactProfile === 'function') {
    var origCompact = Save.compactProfile;
    Save.compactProfile = function (profile) {
      var out = origCompact.apply(this, arguments);
      if (out && profile) {
        ensure(profile);
        out.icpc = profile.icpc;
      }
      return out;
    };
  }

  if (typeof Save.expandProfile === 'function') {
    var origExpand = Save.expandProfile;
    Save.expandProfile = function (data) {
      var out = origExpand.apply(this, arguments);
      if (out) {
        out.icpc = mergeIcpc(data && data.p && data.p.icpc);
        ensure(out);
      }
      return out;
    };
  }

  // ---- real school field -------------------------------------------------
  var CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function numLabel(n) { return CN_NUM[n] || String(n); }

  var SCHOOL_SRC = {
    S: '清华大学|THU,北京大学|PKU,浙江大学|ZJU,上海交通大学|SJTU,中国科学技术大学|USTC,南京大学|NJU,复旦大学|FDU,哈尔滨工业大学|HIT,中山大学|SYSU,北京航空航天大学|BUAA,南开大学|NKU,杭州电子科技大学|HDU,华中科技大学|HUST,西安电子科技大学|XDU,北京邮电大学|BUPT,南方科技大学|SUSTech,中国人民大学|RUC,天津大学|TJU,同济大学|TONGJI,东南大学|SEU,武汉大学|WHU,山东大学|SDU,厦门大学|XMU,四川大学|SCU,西安交通大学|XJTU',
    A: '中南大学|CSU,湖南大学|HNU,华南理工大学|SCUT,吉林大学|JLU,大连理工大学|DUT,北京师范大学|BNU,北京理工大学|BIT,华东师范大学|ECNU,上海大学|SHU,南京理工大学|NJUST,南京航空航天大学|NUAA,西北工业大学|NWPU,电子科技大学|UESTC,重庆大学|CQU,深圳大学|SZU,广东工业大学|GDUT,苏州大学|SUDA,西北大学|NWU,东北大学|NEU,华中师范大学|CCNU,中国农业大学|CAU,北京科技大学|USTB,宁波大学|NBU,华东理工大学|ECUST,东华大学|DHU,河海大学|HHU,江南大学|JIANGNAN,中国矿业大学|CUMT,合肥工业大学|HFUT,郑州大学|ZZU,西南交通大学|SWJTU,上海财经大学|SUFE,中国科学院大学|UCAS,香港大学|HKU,香港中文大学|CUHK,香港科技大学|HKUST,澳门大学|UM,首都师范大学|CNU,上海师范大学|SHNU,南京邮电大学|NJUPT',
    B: '浙江工业大学|ZJUT,南京师范大学|NJNU,齐鲁工业大学|QLUT,江西师范大学|JXNU,广西大学|GXU,云南大学|YNU,贵州大学|GZU,太原理工大学|TYUT,河北大学|HEBU,福州大学|FZU,湘潭大学|XTU,沈阳航空航天大学|SAU,杭州师范大学|HZNU,山东科技大学|SDUST,西安邮电大学|XIYOU,重庆邮电大学|CQUPT,桂林电子科技大学|GUET,辽宁大学|LNU,华北电力大学|NCEPU,华中农业大学|HZAU,南京农业大学|NAU,华南师范大学|SCNU,陕西师范大学|SNNU,西南大学|SWU,上海科技大学|SHTECH,中央财经大学|CUFE,对外经济贸易大学|UIBE,北京交通大学|BJTU,北京工业大学|BJUT,浙江理工大学|ZSTU,福建师范大学|FJNU,上海外国语大学|SISU,安徽大学|AHU,山西大学|SXU,中国石油大学|UPC,中南财经政法大学|ZUEL,西南财经大学|SWUFE,中国海洋大学|OUC,哈尔滨工程大学|HEU,中国地质大学|CUG,武汉理工大学|WUT,天津工业大学|TIP,河北工业大学|HEBUT,长春理工大学|CUST,东北师范大学|NENU,沈阳工业大学|SUT,大连海事大学|DMU,江西理工大学|JXUST,南昌航空大学|NAHU,郑州轻工业大学|ZZLI,河南科技大学|HAUST,湖北工业大学|HBUET,三峡大学|CTGU,长沙理工大学|CSUST,湖南科技大学|HNUST,南华大学|USC,桂林理工大学|GLUT,昆明理工大学|KUST,兰州交通大学|LZJTU,西北师范大学|NWNU',
    C: '扬州大学|YZU,江苏大学|UJS,南通大学|NTU,浙江农林大学|ZAFU,浙江师范大学|ZJNU,广东财经大学|GDUFE,广东外语外贸大学|GDUFS,五邑大学|WYU,佛山科学技术学院|FOSHAN,东莞理工学院|DGUT,西南科技大学|SWUST,成都信息工程大学|CUIT,重庆交通大学|CQJTU,宁夏大学|NXU,新疆大学|XJU,石河子大学|SHZ,内蒙古大学|IMU,汕头大学|MTU,广州大学|GZHU,哈尔滨理工大学|HUT,东北林业大学|NEFU,东北农业大学|NEAU,黑龙江大学|HLJU,辽宁师范大学|LNNU,大连大学|DDU,长春工业大学|CCUT,吉林财经大学|JLUFE,太原科技大学|TYUST,山西财经大学|SXUFE,山西师范大学|SXNU,河北师范大学|HEBNU,石家庄铁道大学|STZU,河北科技大学|HEBUST,华北理工大学|NCST,河南师范大学|HNNU,河南理工大学|HPU,河南农业大学|HAU,河南工业大学|HNUT,武汉科技大学|WUST,湖北大学|HBU,长江大学|YANGTZE,湖南工业大学|HUT2,湖南师范大学|HNNU2,江西财经大学|JXUFE,南昌大学|NCU,安徽工业大学|AHUT,安徽师范大学|AHNU,厦门理工学院|XIT,华侨大学|HQU,集美大学|JMU,广西师范大学|GXNU,广西民族大学|GXMU,海南大学|HAINU,重庆师范大学|CQNU,四川师范大学|SCNUC,西华大学|XHU,成都大学|CDDX,贵州师范大学|GZNU,云南师范大学|YNNU,西安理工大学|XAUT,西安科技大学|XUST,长安大学|CHD,陕西科技大学|SUSTC,西北政法大学|NWUPL,甘肃政法大学|GSUFP,青海师范大学|QHNU,内蒙古工业大学|IMUT,沈阳理工大学|SYUT,江苏科技大学|JUST,常州大学|CZU,盐城工学院|YCI,徐州工程学院|XZIT,苏州科技大学|SZUST,上海理工大学|USST,天津师范大学|TJNU,天津理工大学|TJUT,武汉工程大学|WITC,湖北汽车工业学院|HAAT,中国民航大学|CAFUC,天津科技大学|TUST,青岛科技大学|QUST,青岛大学|QDU,山东师范大学|SDNU,山东建筑大学|SDJZU,鲁东大学|LDU',
    D: '海口经济学院|HIEU,三亚学院|SYU,广州软件学院|GSW,广州工商学院|GCB,广东白云学院|BYXY,无锡学院|WXC,三江学院|SJU,武昌理工学院|WCXT,湖北文理学院|HBWL,河南科技学院|HNST,衡阳师范学院|HYNU,宜春学院|YCU,邵阳学院|SYXY,湖南文理学院|HUAS,荆楚理工学院|JCTU,亳州学院|BZU,河西学院|HXU,天水师范学院|TSNU,吕梁学院|LLU,集宁师范学院|JNSF,周口师范学院|ZKNU,新乡学院|XXU,安阳工学院|AYIT,南阳理工学院|NYIT,湖北工程学院|HBEU,湖北科技学院|HKXY,怀化学院|HHTU,湘南学院|XNU,广东石油化工学院|GDUPE,仲恺农业工程学院|ZKUI,桂林旅游学院|GLTC,玉林师范学院|YLNU,贺州学院|HZU2,百色学院|BSU,贵州民族大学|GZMU,遵义师范学院|ZYNU,昆明学院|KMXY,曲靖师范学院|QJNU,玉溪师范学院|YXNU,昌吉学院|CJU,喀什大学|KSU,塔里木大学|TARIMU,内蒙古民族大学|IMUN,赤峰学院|CFU,呼伦贝尔学院|HLBE,白城师范学院|BCHU,通化师范学院|THSF,佳木斯大学|JMSU,齐齐哈尔大学|QQHE,绥化学院|SHU2,大庆师范学院|DQSY,牡丹江师范学院|MDJN,辽宁石油化工大学|LNPU,渤海大学|BHU,大连海洋大学|DLOU,营口理工学院|YKIT,山西能源学院|SUE,河北金融学院|HBIF,河北农业大学|HEBAU,邢台学院|XTXY,沧州师范学院|CZSF,邯郸学院|HDC,安阳师范学院|AYNU,黄淮学院|HUA,平顶山学院|PDSU,商丘师范学院|SQSF,信阳农林学院|XYAF,湖北理工学院|HBP,湖南人文科技学院|HURST,广东技术师范大学|EPNU,韩山师范学院|HSSY,嘉应学院|JYU,广西科技师范学院|GXSF,海南热带海洋学院|MTOU,重庆三峡学院|CQTSC,成都工业学院|CDPU,绵阳师范学院|MYSF,内江师范学院|NJSF,西昌学院|XCU,贵州工程应用技术学院|GZEU,西藏大学|TUC,西安文理学院|XAWL,榆林学院|YLU,安康学院|AKU,商洛学院|SLU,甘肃农业大学|GSAU,兰州城市学院|LZCU,陇东学院|LDC,青海民族大学|QHMU,宁夏师范学院|NXSF,北方民族大学|NMU,深圳技术大学|SZTU,齐鲁理工学院|QLIT,山东女子学院|SDWU,山东政法学院|SDUPL,枣庄学院|ZZXY,菏泽学院|HZXY,潍坊学院|WFU,聊城大学|LCU,台州学院|TZU,衢州学院|QZU,丽水学院|LSU,嘉兴学院|JXU,绍兴文理学院|SWUC,湖州师范学院|HSNU,宁波工程学院|NBUE',
    INTL: '麻省理工|MIT,斯坦福|Stanford,卡内基梅隆|CMU,加州伯克利|Berkeley,普林斯顿|Princeton,哈佛|Harvard,剑桥|Cambridge,牛津|Oxford,苏黎世联邦理工|ETH,ITMO大学|ITMO,莫斯科工程物理学院|MIPT,新西伯利亚国立大学|NSU,华沙大学|UW,布达佩斯技术经济大学|BME,东京大学|UTokyo,京都大学|Kyoto,东京工业大学|TokyoTech,首尔国立大学|SNU,韩国科学技术院|KAIST,浦项工大|POSTECH,高丽大学|Korea,延世大学|Yonsei,新加坡国立大学|NUS,南洋理工大学|NTU,印度理工孟买|IITB,印度理工海德拉巴|IIITH,印度理工罗塔基|IITR,谢里夫理工|Sharif,圣保罗纯数应用所|IMPA,滑铁卢大学|Waterloo,多伦多大学|Toronto,不列颠哥伦比亚大学|UBC,墨尔本大学|Melbourne,悉尼大学|Sydney,伊利诺伊香槟|UIUC,密歇根大学|Michigan,佐治亚理工|Gatech,加州理工|Caltech,康奈尔大学|Cornell,华盛顿大学|UWSea,台湾大学|NTUW,成功大学|NCKU,台湾清华大学|NTHU,阳明交通大学|NYCU,早稻田大学|Waseda,庆应义塾大学|Keio,莫纳什大学|Monash,马来亚大学|UMY,朱拉隆功大学|Chula,阿里格尔穆斯林大学|AMU,以色列理工|Technion'
  };

  var SCHOOLS = {};
  Object.keys(SCHOOL_SRC).forEach(function (tier) {
    SCHOOLS[tier] = SCHOOL_SRC[tier].split(',').map(function (item) {
      var parts = item.split('|');
      return { name: parts[0], abbr: parts[1], tier: tier };
    });
  });

  // ---- 真实名单（2025/2026 赛季 ICPC 亚洲区域赛 + CCPC 公开榜单，见 roster-2026.json）----
  var ROSTER = null;
  var ROSTER_VER = '1';
  var ROSTER_POOL = {};
  var NICK_INDEX = {};

  function rosterUrl() {
    var src = '';
    try {
      if (document.currentScript && document.currentScript.src) src = document.currentScript.src;
      if (!src) {
        var s = document.querySelector('script[src*="icpc-rules"]');
        if (s && s.src) src = s.src;
      }
    } catch (e) {}
    return src ? src.replace(/[^/]*$/, '') + 'roster-2026.json?v=' + ROSTER_VER
      : 'assets/roster-2026.json?v=' + ROSTER_VER;
  }

  function schoolTier(name) {
    if (ROSTER) {
      var i = ROSTER.schools.indexOf(name);
      if (i >= 0) return ROSTER.tiers[i] || 'D';
    }
    return null;
  }

  function rosterPool(key) {
    if (!ROSTER) return null;
    if (ROSTER_POOL[key]) return ROSTER_POOL[key];
    var rows = ROSTER[key] || ROSTER.online;
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var school = ROSTER.schools[rows[i][0]];
      var nick = String(rows[i][1] || '').replace(/\s+/g, ' ').trim();
      if (!school || !nick) continue;
      out.push([school, nick]);
      if (!NICK_INDEX[school]) NICK_INDEX[school] = [];
      if (NICK_INDEX[school].indexOf(nick) < 0) NICK_INDEX[school].push(nick);
    }
    ROSTER_POOL[key] = out;
    return out;
  }

  function poolForStageKey(stageId) {
    var key = stageId === 'online' ? 'online'
      : stageId === 'regional' ? 'regional'
        : stageId === 'final' ? 'final' : 'world';
    return rosterPool(key);
  }

  function realLabel(school, nick) {
    var name = school + '-' + nick;
    return name.length > 34 ? name.slice(0, 33) + '…' : name;
  }

  function loadRoster(onDone) {
    try {
      if (!window.fetch) { if (onDone) onDone(); return; }
      fetch(rosterUrl(), { credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).then(function (d) {
        if (!d || !d.schools || !d.online || !d.online.length) throw new Error('bad roster');
        ROSTER = d;
        poolForStageKey('online');
        console.info('[ICPC] 真实名单载入：' + d.online.length + ' 支队伍 / ' + d.schools.length + ' 所高校');
        if (onDone) onDone();
      }).catch(function (e) {
        console.warn('[ICPC] roster load failed, fallback names', e);
        if (onDone) onDone();
      });
    } catch (e) {
      console.warn('[ICPC] roster unavailable', e);
      if (onDone) onDone();
    }
  }

  var STAGE_TIERS = {
    online: ['S', 'A', 'B', 'C', 'D'],
    regional: ['S', 'A', 'B', 'C', 'D'],
    final: ['INTL', 'S', 'A', 'B'],
    world: ['INTL', 'S', 'A'],
    observable: ['INTL', 'S', 'A']
  };
  // 每校正式参赛队数（真实名额，等于 TIER_QUOTA）/ 报名上限（含打星队），决定名单密度
  var TIER_FORMAL = TIER_QUOTA;
  var TIER_LIMIT = { S: 12, A: 10, B: 8, C: 7, D: 7, INTL: 3, X: 3 };
  // 名次百分位 → 档次：头部集中在强校，普通院校堆在榜尾（真实赛场分布）
  var RANK_BANDS = {
    cn: [[0.015, ['S']], [0.06, ['S', 'A']], [0.14, ['S', 'A']], [0.28, ['A', 'S']],
      [0.45, ['A', 'B']], [0.62, ['B', 'A']], [0.78, ['B', 'C']], [0.9, ['C', 'D']], [1.01, ['D', 'C']]],
    elite: [[0.3, ['INTL']], [0.55, ['INTL', 'S']], [0.8, ['S', 'INTL']], [1.01, ['A', 'S']]]
  };
  var POOL_CACHE = {};

  function poolForStage(stageId) {
    var key = STAGE_TIERS[stageId] ? stageId : 'online';
    if (POOL_CACHE[key]) return POOL_CACHE[key];
    var out = [];
    STAGE_TIERS[key].forEach(function (tier) { out = out.concat(SCHOOLS[tier] || []); });
    POOL_CACHE[key] = out;
    return out;
  }

  function stageIdFromSpec(spec) {
    var count = Number(spec && spec.teams) || 0;
    var mean = Number(spec && spec.ratingMean) || 1500;
    if (mean >= 3200 || count >= 200 && mean >= 3000) return 'observable';
    if (count >= 1500) return 'online';
    if (count >= 400) return 'regional';
    if (count >= 150) return 'final';
    return 'world';
  }

  function labelOf(school, tier, n) {
    var formal = TIER_FORMAL[tier] || 2;
    if (!school.abbr) {
      return school.name + (n <= formal ? numLabel(n) + '队' : '打星' + numLabel(n - formal) + '队');
    }
    return n <= formal
      ? school.name + '-' + school.abbr + numLabel(n) + '队'
      : school.name + '-' + school.abbr + '打星' + numLabel(n - formal) + '队';
  }

  function makeAssigner() {
    var cursor = {}, count = {};
    return function (tier, force) {
      var list = SCHOOLS[tier];
      if (!list || !list.length) return null;
      var limit = force ? Infinity : (TIER_LIMIT[tier] || 4);
      var start = cursor[tier] || 0;
      for (var tries = 0; tries < list.length; tries++) {
        var idx = (start + tries) % list.length;
        var s = list[idx];
        var n = (count[s.name] || 0) + 1;
        if (n <= limit) {
          count[s.name] = n;
          cursor[tier] = (idx + 1) % list.length;
          return { school: s, n: n, tier: tier };
        }
      }
      if (!force) return null;
      var s2 = list[start % list.length];
      var n2 = (count[s2.name] || 0) + 1;
      count[s2.name] = n2;
      cursor[tier] = (start + 1) % list.length;
      return { school: s2, n: n2, tier: tier };
    };
  }

  function bandTiers(bands, q) {
    for (var b = 0; b < bands.length; b++) {
      if (q <= bands[b][0]) return bands[b][1];
    }
    return bands[bands.length - 1][1];
  }

  function reservedName() {
    var p = App && App.state && App.state.profile;
    return p && p.team ? String(p.team.name || '') : '';
  }

  function relabelTeams(teams, stageId) {
    if (!Array.isArray(teams) || !teams.length) return;
    var keep = reservedName();
    var pool = poolForStageKey(stageId);
    var order = [];
    for (var i = 0; i < teams.length; i++) order.push(i);
    order.sort(function (a, b) { return (teams[b].rating || 0) - (teams[a].rating || 0); });

    var done = 0;
    if (pool && pool.length >= order.length) {
      var stride = pool.length / order.length;
      var next = 0;
      var used = {};
      for (var k = 0; k < order.length; k++) {
        var t = teams[order[k]];
        if (!t) continue;
        var pi = Math.min(pool.length - 1, Math.floor(k * stride));
        if (pi < next) pi = next;
        var label = '';
        while (pi < pool.length) {
          label = realLabel(pool[pi][0], pool[pi][1]);
          if (label !== keep && !used[label]) break;
          pi++;
        }
        if (pi >= pool.length) break;
        used[label] = 1;
        next = pi + 1;
        t.name = label;
        done++;
      }
      if (done >= order.length) return;
      order = order.slice(done);
    }
    fakeRosterNames(teams, order, stageId, keep);
  }

  function fakeRosterNames(teams, order, stageId, keep) {
    var key = (stageId === 'online' || stageId === 'regional') ? 'cn' : 'elite';
    var bands = RANK_BANDS[key];
    var tiers = STAGE_TIERS[stageId] || STAGE_TIERS.online;
    var take = makeAssigner();
    var spill = 0;
    for (var k = 0; k < order.length; k++) {
      var t = teams[order[k]];
      if (!t) continue;
      var band = bandTiers(bands, (k + 1) / order.length);
      for (var retry = 0; retry < 4; retry++) {
        var pick = null;
        for (var j = 0; j < band.length && !pick; j++) pick = take(band[j], false);
        if (!pick) pick = take(tiers[tiers.length - 1 - (spill++ % 2)], true);
        if (!pick) break;
        t.name = labelOf(pick.school, pick.tier, pick.n);
        if (t.name !== keep) break;
      }
    }
  }

  function currentStageKey() {
    var st = App && App.state;
    if (!st) return 'online';
    if (st.contest && st.contest.stage && st.contest.stage.id) return st.contest.stage.id;
    if (st.observableRun) return 'observable';
    if (st.screen === 'precontest' || st.screen === 'contest') {
      var prof = st.profile;
      var idx = prof ? Number(prof.stageIndex) || 0 : 0;
      var byIdx = ['online', 'regional', 'final', 'world'];
      return st.extraStage === 'regional' ? 'regional' : (byIdx[idx] || 'online');
    }
    return 'online';
  }

  function strongNameSequence(stageId, count) {
    var pool = poolForStageKey(stageId);
    if (pool && pool.length) {
      var out = [];
      for (var i = 0; i < pool.length && out.length < count; i++) {
        out.push(realLabel(pool[i][0], pool[i][1]));
      }
      return out;
    }
    var tiers = (stageId === 'online' || stageId === 'regional') ? ['S', 'A', 'B'] : ['INTL', 'S', 'A'];
    var seq = [];
    for (var round = 1; round <= 4 && seq.length < count; round++) {
      for (var ti = 0; ti < tiers.length && seq.length < count; ti++) {
        var tier = tiers[ti], list = SCHOOLS[tier] || [];
        for (var i = 0; i < list.length && seq.length < count; i++) {
          seq.push(labelOf(list[i], tier, round));
        }
      }
    }
    return seq;
  }

  function previewNames() {
    var stageId = currentStageKey();
    var out = [];
    var pool = poolForStageKey(stageId);
    if (pool && pool.length) {
      for (var i = 0; i < pool.length && out.length < 420; i++) {
        out.push(realLabel(pool[i][0], pool[i][1]));
      }
      return out;
    }
    var tiers = (stageId === 'online' || stageId === 'regional')
      ? ['S', 'A', 'B', 'C'] : ['INTL', 'S', 'A', 'B'];
    for (var round = 1; round <= 3 && out.length < 420; round++) {
      for (var ti = 0; ti < tiers.length && out.length < 420; ti++) {
        var tier = tiers[ti], list = SCHOOLS[tier] || [];
        for (var i = 0; i < list.length && out.length < 420; i++) {
          if (round <= (TIER_FORMAL[tier] || 2)) out.push(labelOf(list[i], tier, round));
        }
      }
    }
    return out;
  }

  if (V.DATA) {
    try {
      Object.defineProperty(V.DATA, 'teamNames', {
        configurable: true,
        get: function () { return previewNames(); }
      });
    } catch (e) {
      console.warn('[ICPC] teamNames pool override failed', e);
    }
  }

  function looksRealTeam(name) {
    if (!ROSTER) return false;
    var i = String(name).indexOf('-');
    if (i <= 0) return false;
    return ROSTER.schools.indexOf(String(name).slice(0, i)) >= 0;
  }

  function needsRelabel(teams) {
    var n = Math.min(24, teams.length), real = 0;
    for (var i = 0; i < n; i++) {
      if (looksRealTeam(String((teams[i] && teams[i].name) || ''))) real++;
    }
    return real < Math.max(1, Math.floor(n / 3));
  }

  if (V.Scoreboard && typeof V.Scoreboard.generate === 'function') {
    var origGenerate = V.Scoreboard.generate;
    V.Scoreboard.generate = function (spec) {
      var out = origGenerate.apply(this, arguments);
      try {
        if (out && Array.isArray(out.teams) && out.teams.length && needsRelabel(out.teams)) {
          relabelTeams(out.teams, stageIdFromSpec(spec));
        }
      } catch (e) {
        console.warn('[ICPC] relabel failed', e);
      }
      return out;
    };
  }

  // 建队初始评级按学校层次分档：越强的学校下限与上限同时更高，新军区间放得最宽
  var TIER_INITIAL = {
    S: [1150, 1600], A: [1000, 1550], B: [850, 1500],
    C: [700, 1420], D: [500, 1320], INTL: [1150, 1600]
  };

  function draftTier() {
    var st = App && App.state;
    var d = st && st.icpcSchoolDraft;
    if (d && TIER_INITIAL[d.tier]) return d.tier;
    var p = st && st.profile;
    if (p && p.icpc && TIER_INITIAL[p.icpc.tier]) return p.icpc.tier;
    return 'X';
  }

  function defaultRange() {
    var cfg = V.CONFIG && V.CONFIG.rating ? V.CONFIG.rating : {};
    var r = cfg.initialRange;
    return Array.isArray(r) && r.length === 2 ? [Number(r[0]) || 500, Number(r[1]) || 1600] : [500, 1600];
  }

  function tierRange(tier) {
    return TIER_INITIAL[tier] || defaultRange();
  }

  if (Rating && typeof Rating.initialRating === 'function') {
    var origInitialRating = Rating.initialRating;
    Rating.initialRating = function (rng) {
      var tier = draftTier();
      if (!TIER_INITIAL[tier]) return origInitialRating.apply(this, arguments);
      var cfg = V.CONFIG && V.CONFIG.rating ? V.CONFIG.rating : {};
      var step = Number(cfg.initialStep) || 25;
      var band = TIER_INITIAL[tier];
      var lo = Math.ceil(band[0] / step) * step;
      var hi = Math.floor(band[1] / step) * step;
      if (!rng || typeof rng.int !== 'function') return Math.round((lo + hi) / 2);
      var roll = rng.int(lo / step, hi / step) * step;
      return clamp(roll, Number(cfg.min) || 500, Number(cfg.max) || 4000);
    };
  }

  function findSchool(name) {
    var q = String(name || '').trim();
    if (ROSTER) {
      var i = ROSTER.schools.indexOf(q);
      if (i >= 0) return { name: q, abbr: '', tier: ROSTER.tiers[i] || 'D' };
    }
    var hit = null;
    Object.keys(SCHOOLS).forEach(function (tier) {
      if (hit) return;
      SCHOOLS[tier].forEach(function (s) {
        if (!hit && (s.name === q || s.abbr.toUpperCase() === q.toUpperCase())) hit = s;
      });
    });
    return hit;
  }

  function wildcardOdds(profile, outcome, st) {
    var rank = Math.max(1, Number(outcome && outcome.rank) || 1);
    var total = Math.max(rank, Number(outcome && outcome.total) || rank);
    var pct = rank / total;
    var base = pct <= 0.05 ? 0.9 : pct <= 0.12 ? 0.72 : pct <= 0.2 ? 0.52
      : pct <= 0.3 ? 0.34 : pct <= 0.45 ? 0.2 : pct <= 0.6 ? 0.12 : 0.06;
    var tierFactor = TIER_FACTOR[st.tier] || 1;
    var freshFactor = st.regionalSeen ? 1 : 1.7;
    return {
      rank: rank,
      total: total,
      pct: pct,
      base: base,
      tierFactor: tierFactor,
      freshFactor: freshFactor,
      p: clamp(base * tierFactor * freshFactor, 0.02, 0.92)
    };
  }

  // ---- stage outcome / season cap ---------------------------------------
  if (typeof Rating.applyStageOutcome === 'function') {
    var origApply = Rating.applyStageOutcome;
    Rating.applyStageOutcome = function (profile, stage, outcome) {
      var st = ensure(profile);
      var blocked = null;

      if (st && stage && stage.id === 'final' && outcome && outcome.advanced) {
        for (var i = 0; i < st.wf.length; i++) {
          if (st.wf[i] >= MAX_WF) {
            var m = profile.team && profile.team.members && profile.team.members[i];
            blocked = (m && m.name) || ('队员 ' + (i + 1));
            outcome.advanced = false;
            break;
          }
        }
      }

      var wc = null;
      if (st && stage && stage.id === 'online' && outcome && !outcome.advanced &&
        (profile.attempt || 0) + 1 >= (stage.attempts || 1) &&
        st.wcSeason !== profile.season) {
        st.wcSeason = profile.season;
        var odds = wildcardOdds(profile, outcome, st);
        st.wcApplied = (Number(st.wcApplied) || 0) + 1;
        if (Math.random() < odds.p) {
          outcome.advanced = true;
          st.wcGranted = (Number(st.wcGranted) || 0) + 1;
          wc = { granted: true, odds: odds };
        } else {
          wc = { granted: false, odds: odds };
        }
      }

      var res = origApply.apply(this, arguments);

      if (st && stage && stage.id === 'regional') st.regionalSeen = true;

      if (st && stage && stage.id === 'world') {
        st.wf = st.wf.map(function (n) { return Math.min(MAX_WF, n + 1); });
      }

      if (st && profile.season > MAX_SEASONS) {
        profile.season = MAX_SEASONS;
        st.retired = true;
      }

      if (res) {
        if (wc) {
          res.wildcard = wc;
          res.message = wc.granted
            ? '外卡申请通过：网络预选赛第 ' + wc.odds.rank + ' / ' + wc.odds.total +
              ' 名，剩余名额优先分配给尚未取得参赛资格的高校。本赛季直接进军区域赛。'
            : '外卡申请未通过：网络预选赛第 ' + wc.odds.rank + ' / ' + wc.odds.total +
              ' 名，名额已分配给排名更靠前的高校。本赛季从头开始。';
        } else if (blocked) {
          res.message = '世界总决赛资格被取消：' + blocked + ' 已经参加过 ' + MAX_WF +
            ' 次世界总决赛，按 ICPC 规则不再具备资格。本赛季到此为止。';
        } else if (st && st.retired) {
          res.message = '五年本科结束。你的 ICPC 生涯到此为止——该毕业了。';
        }
      }

      return res;
    };
  }

  if (typeof Rating.finishPendingSeason === 'function') {
    var origFinish = Rating.finishPendingSeason;
    Rating.finishPendingSeason = function (profile) {
      if (!profile || !profile.pendingSeasonAdvance) return false;
      var st = ensure(profile);

      if ((profile.season || 1) >= MAX_SEASONS) {
        profile.stageIndex = 0;
        profile.attempt = 0;
        profile.regionalExtraPlayed = false;
        profile.regionalExtraAvailable = false;
        profile.pendingSeasonAdvance = false;
        st.retired = true;
        return true;
      }

      var res = origFinish.apply(this, arguments);
      if (st && profile.season > MAX_SEASONS) {
        profile.season = MAX_SEASONS;
        st.retired = true;
      }
      return res;
    };
  }

  // ---- styles ------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('icpc-rules-style')) return;
    var style = document.createElement('style');
    style.id = 'icpc-rules-style';
    style.textContent = [
      '.icpc-subtitle{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .45s ease;background:radial-gradient(ellipse at center,rgba(8,10,12,.66) 0%,rgba(8,10,12,.22) 45%,rgba(8,10,12,0) 74%)}',
      '.icpc-subtitle.is-on{opacity:1}',
      '.icpc-subtitle>span{max-width:86vw;text-align:center;color:#fff;font:900 clamp(22px,4.2vw,46px)/1.5 Lato,"Noto Sans SC","PingFang SC",sans-serif;letter-spacing:.06em;text-shadow:0 4px 30px rgba(0,0,0,.6)}',
      '.icpc-subtitle small{display:block;margin-top:12px;font:500 clamp(11px,1.2vw,14px)/1.6 Lato,"Noto Sans SC",sans-serif;color:rgba(255,255,255,.72);letter-spacing:.22em}',
      '.icpc-badges{margin-top:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:11px;letter-spacing:.12em;color:#767676}',
      '.icpc-badges b{color:#3f8b84}',
      '.icpc-auto-badge{display:inline-flex;align-items:center;margin-left:10px;padding:3px 8px;border-radius:999px;background:rgba(63,139,132,.12);color:#3f8b84;font-size:10px;font-weight:700;letter-spacing:.12em}',
      '.icpc-regroup .modal__actions{display:flex;flex-direction:column;gap:10px}',
      '.icpc-regroup .btn{width:100%}',
      '.icpc-hint{margin-top:14px;font-size:12px;line-height:1.7;color:#767676}',
      '.icpc-retired-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;margin:18px 0 6px}',
      '.icpc-retired-grid div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(0,0,0,.06);padding-bottom:8px;font-size:13px}',
      '.icpc-retired-grid b{font-size:15px}',
      '.icpc-retired .modal__actions{display:flex;flex-direction:column;gap:10px}',
      '.icpc-retired .btn{width:100%}',
      '.icpc-school{margin-top:14px}',
      '.icpc-school-select{width:100%;padding:9px 10px;border-radius:8px;border:1px solid rgba(0,0,0,.16);background:#fff;color:#1b1c1d;font:inherit;font-size:13px}',
      '.icpc-school-custom{width:100%;margin-top:8px;padding:9px 10px;border-radius:8px;border:1px solid rgba(0,0,0,.16);background:#fff;color:#1b1c1d;font:inherit;font-size:13px}',
      '.icpc-school-hint{margin:8px 0 0;font-size:11px;line-height:1.7;color:#767676}',
      '.icpc-wc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;margin:6px 0 12px}',
      '.icpc-wc-grid div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(0,0,0,.06);padding-bottom:6px;font-size:13px}',
      '.icpc-wc-panel{margin-bottom:16px}'
    ].join('');
    document.head.appendChild(style);
  }

  // ---- subtitles ---------------------------------------------------------
  var introTimer = null;

  function showSubtitle(text, sub) {
    var el = document.createElement('div');
    el.className = 'icpc-subtitle';
    el.innerHTML = '<span>' + esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-on'); });
    setTimeout(function () {
      el.classList.remove('is-on');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1100);
    }, 3200);
  }

  function scheduleIntro(delay) {
    if (introTimer) clearTimeout(introTimer);
    introTimer = setTimeout(function () { introTimer = null; maybeIntro(); }, delay == null ? 700 : delay);
  }

  function maybeIntro() {
    var p = App && App.state && App.state.profile;
    if (!p || App.state.screen !== 'hub') return;
    var st = ensure(p);
    if (!st || st.retired) return;
    if (st.intro >= p.season) return;
    if (p.season === 5) return;
    if (document.body.classList.contains('is-modal-open')) { scheduleIntro(1200); return; }
    st.intro = p.season;
    persist();
    showSubtitle(SEASON_TEXT[p.season], '第 ' + p.season + ' 年 / 共 ' + MAX_SEASONS + ' 年');
  }

  // ---- year five regroup --------------------------------------------------
  var regroupShown = false;

  function s5Chance(p, bonus) {
    var medals = (p.goldMedals || 0) + (p.silverMedals || 0) + (p.bronzeMedals || 0);
    var base = 0.45 +
      ((Number(p.rating) || 1500) - 1500) / 2500 * 0.15 +
      (Number(p.titles) || 0) * 0.10 +
      medals * 0.01;
    return clamp(base + (bonus ? S5_TP_BONUS : 0), 0.15, 0.90);
  }

  function pct(n) { return Math.round(n * 100) + '%'; }

  function regroupRoster(p, st) {
    var base = Math.max(500, Math.round(Number(p.rawRating) || 1600) - S5_RATING_PENALTY);
    var rng = new V.Util.RNG('regroup-' + Date.now() + '-' + Math.random());
    var fresh = typeof Rating.makeMembers === 'function' ? Rating.makeMembers(base, rng) : [];
    if (!Array.isArray(p.team.members)) p.team.members = [];
    if (fresh[1]) p.team.members[1] = { name: fresh[1].name, role: fresh[1].role, rating: fresh[1].rating };
    if (fresh[2]) p.team.members[2] = { name: fresh[2].name, role: fresh[2].role, rating: fresh[2].rating };
    st.wf = [st.wf[0] || 0, 0, 0];
    p.rawRating = base;
    p.rating = typeof Rating.displayRating === 'function' ? Rating.displayRating(base) : base;
    p.peak = Math.max(Number(p.peak) || 0, p.rating);
  }

  function resolveRegroup(p, st, layer, useDinner, forced) {
    var ok = false;
    if (!forced) {
      if (useDinner) p.tp = Math.max(0, (Number(p.tp) || 0) - S5_TP_COST);
      ok = Math.random() < s5Chance(p, useDinner);
    }
    if (ok) {
      st.s5 = 'done';
      st.intro = 5;
      persist();
      UI.closeModal(layer);
      UI.render();
      showSubtitle('第五年。他们留下了。', '原班人马 · 再战一年');
      UI.toast('队友答应了。第五年，原班人马继续。', 'gold', 4200);
    } else {
      regroupRoster(p, st);
      st.s5 = 'done';
      st.intro = 5;
      persist();
      UI.closeModal(layer);
      UI.render();
      showSubtitle('第五年。两个人离开了。', '新阵容 · 重新出发');
      UI.toast('两名队友离队，新队员入队；队伍 Rating 下降。', 'info', 4600);
    }
  }

  function openRegroup(p, st) {
    var free = s5Chance(p, false);
    var withDinner = s5Chance(p, true);
    var canDinner = (Number(p.tp) || 0) >= S5_TP_COST;
    var names = (p.team.members || []).map(function (m) { return esc(m.name); }).join(' / ');

    var html = '<div class="modal icpc-regroup" role="dialog" aria-modal="true">' +
      '<div class="modal__head"><div><div class="eyebrow">YEAR 5 · ROSTER</div>' +
      '<h2 class="modal__title">第五年 · 队伍重组</h2></div></div>' +
      '<p class="modal__text">四年本科已经结束。ICPC 规则允许你再打一年，但队友需要愿意留下来。</p>' +
      '<p class="modal__text">当前阵容：' + names + '</p>' +
      '<div class="modal__actions">' +
      '<button class="btn btn--primary" data-icpc="talk">认真谈一次 · ' + pct(free) + '</button>' +
      '<button class="btn btn--ghost" data-icpc="dinner"' + (canDinner ? '' : ' disabled') + '>请全队吃顿饭 · ' + pct(withDinner) + '（' + S5_TP_COST + ' TP）</button>' +
      '<button class="btn btn--ghost" data-icpc="rebuild">直接重组 · 更换 2 名队员</button>' +
      '</div>' +
      '<p class="modal__text icpc-hint">说服失败会更换两名队员，队伍 Rating 小幅下降；队长会留下来。</p>' +
      '</div>';

    var layer = UI.openModal(html, { dismissible: false, closeOnEsc: false });
    layer.querySelector('[data-icpc="talk"]').addEventListener('click', function () {
      resolveRegroup(p, st, layer, false, false);
    });
    var dinner = layer.querySelector('[data-icpc="dinner"]');
    if (dinner && canDinner) dinner.addEventListener('click', function () {
      resolveRegroup(p, st, layer, true, false);
    });
    layer.querySelector('[data-icpc="rebuild"]').addEventListener('click', function () {
      resolveRegroup(p, st, layer, false, true);
    });
  }

  function maybeRegroup() {
    var p = App && App.state && App.state.profile;
    if (!p || App.state.screen !== 'hub') return;
    var st = ensure(p);
    if (!st || st.retired || st.s5 === 'done') return;
    if (p.season !== 5) return;
    if (regroupShown) return;
    if (document.body.classList.contains('is-modal-open')) {
      setTimeout(maybeRegroup, 1200);
      return;
    }
    regroupShown = true;
    openRegroup(p, st);
  }

  // ---- retirement --------------------------------------------------------
  var retiredShown = false;

  function openRetired(p, st) {
    var medals = (p.goldMedals || 0) + (p.silverMedals || 0) + (p.bronzeMedals || 0);
    var balloons = p.balloons ? Object.keys(p.balloons).length : 0;
    var best = p.stats && p.stats.bestRank != null ? '#' + p.stats.bestRank : '—';
    var rows = [
      ['赛季', MAX_SEASONS],
      ['参赛场次', (p.stats && p.stats.contests) || 0],
      ['过题数', (p.stats && p.stats.solves) || 0],
      ['最佳排名', best],
      ['世界总决赛', (p.worldFinals || 0) + ' 次'],
      ['奖牌', medals],
      ['气球收藏', balloons],
      ['峰值 Rating', p.peak || p.rating || '—']
    ];
    var grid = rows.map(function (r) {
      return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
    }).join('');

    var html = '<div class="modal icpc-retired" role="dialog" aria-modal="true">' +
      '<div class="modal__head"><div><div class="eyebrow">CAREER COMPLETE</div>' +
      '<h2 class="modal__title">毕业了</h2></div></div>' +
      '<p class="modal__text">五年本科结束。你打完了属于这支队伍的全部赛季。</p>' +
      '<div class="icpc-retired-grid">' + grid + '</div>' +
      '<div class="modal__actions">' +
      '<button class="btn btn--ghost" data-icpc="codex">查看生涯收藏</button>' +
      '<button class="btn btn--ghost" data-icpc="export">导出存档</button>' +
      '<button class="btn btn--primary" data-icpc="restart">重新开始</button>' +
      '</div></div>';

    var layer = UI.openModal(html, { dismissible: false, closeOnEsc: false });
    layer.querySelector('[data-icpc="codex"]').addEventListener('click', function () {
      UI.closeModal(layer);
      App.state.screen = 'codex';
      UI.render();
    });
    layer.querySelector('[data-icpc="export"]').addEventListener('click', function () {
      UI.closeModal(layer);
      App.exportSave();
    });
    layer.querySelector('[data-icpc="restart"]').addEventListener('click', function () {
      UI.closeModal(layer);
      App.resetSave();
    });
  }

  function maybeRetired() {
    var p = App && App.state && App.state.profile;
    if (!p || App.state.screen !== 'hub') return;
    var st = ensure(p);
    if (!st || !st.retired || retiredShown) return;
    if (document.body.classList.contains('is-modal-open')) {
      setTimeout(maybeRetired, 1200);
      return;
    }
    retiredShown = true;
    openRetired(p, st);
  }

  // ---- hub badges --------------------------------------------------------
  function addHubBadges() {
    var p = App && App.state && App.state.profile;
    if (!p || App.state.screen !== 'hub') return;
    var st = ensure(p);
    if (!st) return;
    var card = document.querySelector('.team-card');
    if (!card) return;
    var el = card.querySelector('.icpc-badges');
    if (!el) {
      el = document.createElement('div');
      el.className = 'icpc-badges';
      card.appendChild(el);
    }
    var maxWf = Math.max.apply(null, st.wf);
    el.innerHTML = '<span>' + esc(st.school) + ' · ' + (TIER_LABEL[st.tier] || '未收录') + '</span>' +
      '<span>第 <b>' + Math.min(p.season, MAX_SEASONS) + '</b> 年 / 共 ' + MAX_SEASONS + ' 年</span>' +
      '<span>WF <b>' + maxWf + '</b> / ' + MAX_WF + '</span>' +
      (st.retired ? '<span>已毕业</span>' : '');
  }

  // ---- rules copy --------------------------------------------------------
  if (typeof UI.showRules === 'function') {
    var origRules = UI.showRules;
    UI.showRules = function () {
      var res = origRules.apply(this, arguments);
      setTimeout(function () {
        var scroll = document.querySelector('.rules-scroll');
        if (!scroll || scroll.querySelector('.icpc-rule-block')) return;
        var sec = document.createElement('section');
        sec.className = 'icpc-rule-block';
        sec.innerHTML = '<h3>⑦ ICPC 生涯限制</h3>' +
          '<p>每支队伍最多 <b>5 个赛季</b>。第 5 年本科已经结束，需要说服队友留下；失败会更换 2 名队员，队伍 Rating 小幅下降。</p>' +
          '<p>每名队员最多参加 <b>2 次世界总决赛</b>。队员满 2 次后，队伍无法再次晋级 WF；更换队员后新队员重新计算。</p>' +
          '<p>第 5 赛季结束后生涯结束，进入毕业总结。</p>' +
          '<h3>⑧ 高校名额与外卡</h3>' +
          '<p>对手名单取自第 50/51 届 ICPC 亚洲区域赛与 CCPC 分站公开榜单的真实队伍，' +
          '队名格式为 <b>学校-队伍名</b>（例如 北京大学-飞带不长队），档次按该校近两个赛季的真实奖牌与名次计算。' +
          '网络赛约 3100 支、区域赛约 1500 支真实队伍随机出现在对应阶段榜单上。</p>' +
          '<p>东亚区决赛 / 世界总决赛阶段使用第 49、50 届东亚区决赛与 CCPC 总决赛的真实名单（亚洲区队伍），' +
          '欧美队伍未收录在公开抓取范围内。</p>' +
          '<p>网络预选赛未出线时，学校可申请外卡：按网络赛排名优先分配给尚未获得名额的高校。' +
          '顶尖高校名额多、外卡系数低；新军高校系数高，本校从未打进区域赛时另有 <b>×1.7</b> 优先。</p>' +
          '<p>建队时选择的学校决定层次与外卡系数；层次越高，正规渠道晋级越容易，外卡越难。</p>' +
          '<p>初始评级也随层次分档，强校下限与上限同时更高：顶尖 1150–1600、一流 1000–1550、强势 850–1500、' +
          '中坚 700–1420、新军 500–1320；自定义校沿用默认区间。新军跨度最大，但顶尖上限最高——' +
          '强校更容易正面出线，新军则更难、外卡更容易。</p>';
        scroll.appendChild(sec);
      }, 30);
      return res;
    };
  }

  // ---- school selection & wild card UI -----------------------------------
  function schoolMetaOf(input) {
    var hit = findSchool(input);
    if (hit) return { name: hit.name, abbr: hit.abbr, tier: hit.tier };
    var custom = String(input || '').trim().slice(0, 20);
    if (!custom) return null;
    return { name: custom, abbr: '', tier: 'X' };
  }

  function updateSchoolHint() {
    var hint = document.querySelector('.icpc-school-hint');
    if (!hint) return;
    var meta = App.state.icpcSchoolDraft;
    if (!meta) { hint.textContent = ''; return; }
    var band = tierRange(meta.tier);
    hint.textContent = '层次：' + (TIER_LABEL[meta.tier] || '未收录') +
      ' · 初始评级 ' + band[0] + '–' + band[1] +
      ' · 每校正式名额 ' + (TIER_QUOTA[meta.tier] || 1) + ' 支' +
      ' · 外卡系数 ×' + (TIER_FACTOR[meta.tier] || 1).toFixed(2) +
      '（本校从未打进区域赛时另有 ×1.7 优先）';
  }

  function pickerGroups() {
    var groups = [];
    if (ROSTER) {
      var byTier = {};
      ROSTER.schools.forEach(function (n, i) {
        var t = ROSTER.tiers[i] || 'D';
        if (!byTier[t]) byTier[t] = [];
        byTier[t].push(n);
      });
      ['S', 'A', 'B', 'C', 'D'].forEach(function (t) {
        if (byTier[t] && byTier[t].length) groups.push([TIER_LABEL[t] + '高校', byTier[t]]);
      });
      return groups;
    }
    ['S', 'A', 'B', 'C', 'D', 'INTL'].forEach(function (tier) {
      var list = (SCHOOLS[tier] || []).map(function (s) { return s.name; });
      if (list.length) groups.push([tier === 'INTL' ? '境外高校' : TIER_LABEL[tier] + '高校', list]);
    });
    return groups;
  }

  var PICKED_NICK = {};

  function playerTeamLabel(meta) {
    if (!meta || !meta.name) return '';
    if (ROSTER) {
      var nicks = NICK_INDEX[meta.name];
      if (nicks && nicks.length) {
        if (!PICKED_NICK[meta.name] || nicks.indexOf(PICKED_NICK[meta.name]) < 0) {
          PICKED_NICK[meta.name] = nicks[Math.floor(Math.random() * nicks.length)];
        }
        return realLabel(meta.name, PICKED_NICK[meta.name]);
      }
    }
    return labelOf(meta, meta.tier, 1);
  }

  function injectSchoolPicker() {
    if (!App || App.state.screen !== 'welcome' || App.state.profile) return;
    var reg = document.querySelector('.registration');
    if (!reg) return;
    var stamp = ROSTER ? '1' : '0';
    var old = reg.querySelector('.icpc-school');
    if (old) {
      if (old.dataset.icpcRoster === stamp || App.state.icpcSchoolTouched) return;
      old.remove();
    }
    var nameField = reg.querySelector('[data-field="team-name"]');
    var anchor = nameField ? nameField.closest('.field') : null;
    var opts = '';
    pickerGroups().forEach(function (g) {
      opts += '<optgroup label="' + esc(g[0]) + '">';
      g[1].forEach(function (n) { opts += '<option value="' + esc(n) + '">' + esc(n) + '</option>'; });
      opts += '</optgroup>';
    });
    var wrap = document.createElement('div');
    wrap.className = 'field icpc-school';
    wrap.dataset.icpcRoster = stamp;
    wrap.innerHTML = '<span>学校</span>' +
      '<div class="field__row"><select class="icpc-school-select" aria-label="选择学校">' + opts + '</select></div>' +
      '<input class="icpc-school-custom" maxlength="20" placeholder="或自定义校名（默认按新军计算）" autocomplete="off">' +
      '<p class="icpc-school-hint"></p>';
    if (anchor && anchor.nextSibling) reg.insertBefore(wrap, anchor.nextSibling);
    else reg.appendChild(wrap);

    var sel = wrap.querySelector('.icpc-school-select');
    var custom = wrap.querySelector('.icpc-school-custom');
    var prevDraft = App.state.icpcSchoolDraft;
    var prevName = prevDraft && prevDraft.name;
    var wanted = prevName && findSchool(prevName) ? prevName : null;
    sel.value = wanted || (findSchool('北京大学') ? '北京大学' : (ROSTER ? ROSTER.schools[0] : ''));
    if (!wanted && prevName && prevName !== sel.value) custom.value = prevName;
    var syncing = false;
    if (nameField) {
      nameField.addEventListener('input', function () {
        if (syncing) return;
        nameField.dataset.icpcManual = '1';
      });
    }
    function syncTeamName() {
      if (!nameField || nameField.dataset.icpcManual === '1') return;
      var label = playerTeamLabel(App.state.icpcSchoolDraft);
      if (!label) return;
      syncing = true;
      nameField.value = label;
      nameField.dispatchEvent(new Event('input', { bubbles: true }));
      syncing = false;
    }
    function setDraft() {
      var meta = schoolMetaOf(custom.value.trim() || sel.value);
      App.state.icpcSchoolDraft = meta || { name: '北京大学', abbr: '', tier: 'S' };
      App.state.icpcSchoolTouched = true;
      updateSchoolHint();
      syncTeamName();
    }
    sel.addEventListener('change', function () { custom.value = ''; setDraft(); });
    custom.addEventListener('input', setDraft);
    App.state.icpcSchoolTouched = false;
    setDraft();
    App.state.icpcSchoolTouched = false;
  }

  if (App && typeof App.createTeam === 'function') {
    var origCreateTeam = App.createTeam;
    App.createTeam = function () {
      var before = App.state.profile;
      origCreateTeam.apply(this, arguments);
      var p = App.state.profile;
      if (p && p !== before) {
        var d = App.state.icpcSchoolDraft || { name: '北京大学', abbr: '', tier: 'S' };
        var s = ensure(p);
        s.school = d.name;
        s.abbr = d.abbr;
        s.tier = d.tier;
        persist();
      }
    };
  }

  function addWildcardPanel() {
    if (!App || App.state.screen !== 'result') return;
    var dr = App.state.displayResult;
    var wc = dr && dr.outcome && dr.outcome.wildcard;
    var host = document.querySelector('.result-main');
    if (!wc || !host || host.querySelector('.icpc-wc-panel')) return;
    var o = wc.odds;
    var prof = App.state.profile;
    var st = prof ? ensure(prof) : null;
    var rows = [
      ['网络预选赛排名', o.rank + ' / ' + o.total],
      ['排名百分位', '前 ' + Math.max(1, Math.round(o.pct * 100)) + '%'],
      ['学校', st ? st.school + '（' + (TIER_LABEL[st.tier] || '未收录') + '）' : '—'],
      ['学校系数', '×' + o.tierFactor.toFixed(2)],
      ['新军优先', o.freshFactor > 1 ? '×1.70' : '无'],
      ['通过概率', Math.round(o.p * 100) + '%'],
      ['申请结果', wc.granted ? '通过' : '未通过']
    ];
    var sec = document.createElement('section');
    sec.className = 'panel icpc-wc-panel';
    sec.innerHTML = '<div class="panel__head"><div><div class="eyebrow">WILD CARD</div>' +
      '<h2>外卡申请</h2></div></div><div class="icpc-wc-grid">' +
      rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') +
      '</div><p class="muted">名额分配用剩的部分转为外卡，按网络预选赛排名顺序优先分配给尚未取得参赛资格的高校。</p>';
    host.insertBefore(sec, host.firstChild);
  }

  // ---- auto judge card proxy ---------------------------------------------
  function isAutoProxy() {
    var p = App && App.state && App.state.profile;
    return !!(p && ensure(p).autoProxy);
  }

  function isAutoGacha() {
    var p = App && App.state && App.state.profile;
    if (!p) return false;
    var s = ensure(p);
    return !!(s.autoProxy || s.autoJudge);
  }

  function handleGacha() {
    if (!isAutoGacha()) return;
    var layer = document.querySelector('.modal-layer--gacha');
    if (!layer) return;

    var draw = layer.querySelector('[data-ui="draw-gacha"]');
    var skip = layer.querySelector('[data-ui="skip-gacha"]');
    var close = layer.querySelector('[data-ui="close-gacha"]');

    if (draw && !draw.hidden && !draw.dataset.icpcAuto) {
      draw.dataset.icpcAuto = '1';
      setTimeout(function () {
        if (isAutoGacha() && document.body.contains(draw) && !draw.hidden) draw.click();
      }, 260);
    } else if (skip && !skip.hidden && !skip.dataset.icpcAuto) {
      skip.dataset.icpcAuto = '1';
      setTimeout(function () {
        if (isAutoGacha() && document.body.contains(skip) && !skip.hidden) skip.click();
      }, 160);
    }

    if (close && !close.hidden && !close.dataset.icpcAuto) {
      close.dataset.icpcAuto = '1';
      setTimeout(function () {
        if (isAutoGacha() && document.body.contains(close) && !close.hidden) close.click();
      }, 1400);
    }
  }

  function handleEvent() {
    if (!isAutoProxy()) return;
    var layer = document.querySelector('.modal-layer--event');
    if (!layer) return;

    var cont = layer.querySelector('[data-ui="event-continue"]');
    if (cont) {
      if (!cont.dataset.icpcAuto) {
        cont.dataset.icpcAuto = '1';
        setTimeout(function () {
          if (isAutoProxy() && document.body.contains(cont)) cont.click();
        }, 1000);
      }
      return;
    }

    var buttons = layer.querySelectorAll('.event-choice');
    if (!buttons.length) return;

    var p = App && App.state && App.state.contest;
    var ev = p && p.pendingEvent && p.pendingEvent.event;
    var idx = ev && ev.choices ? pickBestChoice(ev.choices) : -1;
    var target = idx >= 0 ? layer.querySelector('.event-choice[data-choice="' + idx + '"]') : null;
    if (!target) {
      var safe = layer.querySelector('.event-choice__risk--safe');
      target = safe ? safe.closest('.event-choice') : null;
    }
    if (!target || target.disabled || target.dataset.icpcAuto) return;
    target.dataset.icpcAuto = '1';
    setTimeout(function () {
      if (isAutoProxy() && document.body.contains(target) && !target.disabled) target.click();
    }, 800);
  }

  function choiceScore(c) {
    var outs = (c && c.outcomes) || [];
    var total = 0, weight = 0;
    outs.forEach(function (o) {
      var w = o.weight == null ? 1 : Number(o.weight);
      var e = o.effect || {};
      var v = (Number(e.energy) || 0) * 1 +
        (Number(e.morale) || 0) * 1.2 +
        (Number(e.insight) || 0) * 0.9 +
        (Number(e.tp) || 0) * 2.5 +
        (Number(e.rating) || 0) * 0.6 -
        (Number(e.time) || 0) * 1.6;
      total += v * w;
      weight += w;
    });
    return weight ? total / weight : 0;
  }

  function pickBestChoice(choices) {
    var rank = { safe: 0, risky: 1, wild: 2 };
    var best = -1, bestRisk = 99, bestScore = -Infinity;
    (choices || []).forEach(function (c, i) {
      var r = rank[c && c.risk] == null ? 2 : rank[c.risk];
      var s = choiceScore(c);
      if (r < bestRisk || (r === bestRisk && s > bestScore)) {
        best = i;
        bestRisk = r;
        bestScore = s;
      }
    });
    return best;
  }

  var gachaObserver = null;
  function watchGacha() {
    var root = document.getElementById('modal-root');
    if (!root || gachaObserver) return;
    gachaObserver = new MutationObserver(function () { handleGacha(); handleEvent(); });
    gachaObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'class']
    });
    handleGacha();
    handleEvent();
  }

  function makeAutoRow(ui, title, desc, on) {
    var holder = document.createElement('div');
    holder.innerHTML = '<button class="settings-row" data-ui="' + ui + '"><span><b>' + title +
      '</b><small>' + desc + '</small></span><span class="switch' + (on ? ' is-on' : '') + '"></span></button>';
    return holder.firstElementChild;
  }

  function toggleFlag(flag, row) {
    var p = App && App.state && App.state.profile;
    if (!p) return;
    var st = ensure(p);
    st[flag] = !st[flag];
    persist();
    var sw = row.querySelector('.switch');
    if (sw) sw.classList.toggle('is-on', st[flag]);
    if (flag === 'autoProxy') {
      UI.toast(st.autoProxy ? '全局代理已开启：自动处理事件与判题卡' : '全局代理已关闭', 'info', 2800);
      if (st.autoProxy) { handleGacha(); handleEvent(); }
    } else {
      UI.toast(st.autoJudge ? '自动抽卡已开启' : '自动抽卡已关闭', 'info', 2600);
      if (st.autoJudge) handleGacha();
    }
  }

  function injectAutoSetting() {
    var list = document.querySelector('.settings-list');
    if (!list) return;
    var p = App && App.state && App.state.profile;
    var st = p ? ensure(p) : null;
    var anchor = list.querySelector('[data-ui="toggle-motion"]');

    var judgeRow = list.querySelector('[data-ui="toggle-auto-gacha"]');
    if (!judgeRow) {
      judgeRow = makeAutoRow('toggle-auto-gacha', '自动抽卡', '提交后自动抽取并收下判题卡', st && st.autoJudge);
      if (anchor && anchor.nextSibling) list.insertBefore(judgeRow, anchor.nextSibling);
      else list.appendChild(judgeRow);
      judgeRow.addEventListener('click', function () { toggleFlag('autoJudge', judgeRow); });
    }

    if (!list.querySelector('[data-ui="toggle-auto-proxy"]')) {
      var proxyRow = makeAutoRow('toggle-auto-proxy', '全局代理', '自动处理事件与判题卡，事件优先稳妥选项', st && st.autoProxy);
      if (judgeRow.nextSibling) list.insertBefore(proxyRow, judgeRow.nextSibling);
      else list.appendChild(proxyRow);
      proxyRow.addEventListener('click', function () { toggleFlag('autoProxy', proxyRow); });
    }
  }

  if (typeof UI.showSettings === 'function') {
    var origSettings = UI.showSettings;
    UI.showSettings = function () {
      var res = origSettings.apply(this, arguments);
      setTimeout(injectAutoSetting, 40);
      return res;
    };
  }

  function addAutoBadge() {
    var meta = document.getElementById('topbar-meta');
    if (!meta) return;
    var p = App && App.state && App.state.profile;
    var st = p ? ensure(p) : null;
    var on = !!(st && (st.autoProxy || st.autoJudge) && App.state.screen === 'contest');
    var el = meta.querySelector('.icpc-auto-badge');
    if (on && !el) {
      el = document.createElement('span');
      el.className = 'icpc-auto-badge';
      el.textContent = st.autoProxy ? 'AUTO 代理' : 'AUTO 抽卡';
      meta.appendChild(el);
    } else if (on && el) {
      el.textContent = st.autoProxy ? 'AUTO 代理' : 'AUTO 抽卡';
    } else if (!on && el) {
      el.remove();
    }
  }

  // ---- render hook -------------------------------------------------------
  function patchPredictedField() {
    var blocks = document.querySelectorAll('.field-teams');
    for (var b = 0; b < blocks.length; b++) {
      var rows = [];
      var kids = blocks[b].children;
      for (var i = 0; i < kids.length; i++) {
        var label = kids[i].querySelector('span');
        var value = kids[i].querySelector('b');
        if (label && value) {
          rows.push({ label: label, rating: Number(String(value.textContent).replace(/[,\s]/g, '')) || 0 });
        }
      }
      if (!rows.length) continue;
      rows.sort(function (a, c) { return c.rating - a.rating; });
      var names = strongNameSequence(currentStageKey(), rows.length);
      for (var k = 0; k < rows.length; k++) {
        if (names[k]) rows[k].label.textContent = names[k];
      }
    }
  }

  function fieldTeams(contest) {
    var f = contest && contest.field;
    var teams = f && (f.teams || f.rows || f.list);
    return Array.isArray(teams) && teams.length ? teams : null;
  }

  var fixingField = false;

  function fixResumedField() {
    var st = App && App.state;
    if (!st || fixingField) return;
    var teams = st.screen === 'contest' ? fieldTeams(st.contest) : null;
    if (!teams || !needsRelabel(teams)) return;
    fixingField = true;
    try {
      relabelTeams(teams, currentStageKey());
    } finally {
      fixingField = false;
    }
    if (!needsRelabel(teams)) {
      setTimeout(function () {
        try { UI.render(); } catch (e) {}
      }, 0);
    }
  }

  if (typeof UI.render === 'function') {
    var origRender = UI.render;
    UI.render = function () {
      var res = origRender.apply(this, arguments);
      setTimeout(function () {
        try {
          addHubBadges();
          addAutoBadge();
          watchGacha();
          scheduleIntro(600);
          maybeRegroup();
          maybeRetired();
          injectSchoolPicker();
          addWildcardPanel();
          patchPredictedField();
          fixResumedField();
        } catch (e) {
          console.warn('[ICPC] render hook', e);
        }
      }, 0);
      return res;
    };
  }

  injectStyles();

  function bootCheck() {
    try {
      addHubBadges();
      addAutoBadge();
      watchGacha();
      scheduleIntro(700);
      maybeRegroup();
      maybeRetired();
      injectSchoolPicker();
      addWildcardPanel();
      patchPredictedField();
      fixResumedField();
    } catch (e) {
      console.warn('[ICPC] boot check', e);
    }
  }

  setTimeout(bootCheck, 900);
  window.addEventListener('load', function () { setTimeout(bootCheck, 400); });
  loadRoster(function () {
    setTimeout(function () {
      try { bootCheck(); } catch (e) { console.warn('[ICPC] roster boot', e); }
    }, 30);
  });

  window.__VCPC_ICPC__ = {
    ensure: ensure,
    save: persist,
    seasons: MAX_SEASONS,
    maxWf: MAX_WF,
    chance: s5Chance,
    regroupRoster: regroupRoster,
    autoGacha: handleGacha,
    autoEvent: handleEvent,
    pickBestChoice: pickBestChoice
  };

  console.info('[ICPC] rules patch loaded: ' + MAX_SEASONS + ' seasons, ' + MAX_WF + ' WF per player');
})();
