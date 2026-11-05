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

  function defaults() { return { intro: 0, s5: '', retired: false, wf: [0, 0, 0], autoJudge: false, autoProxy: false }; }

  function ensure(profile) {
    if (!profile) return null;
    var s = profile.icpc;
    if (!s || typeof s !== 'object') s = profile.icpc = defaults();
    s.intro = Math.max(0, Math.round(Number(s.intro) || 0));
    s.s5 = s.s5 === 'done' ? 'done' : '';
    s.retired = !!s.retired;
    s.autoJudge = !!s.autoJudge;
    s.autoProxy = !!s.autoProxy;
    if (!Array.isArray(s.wf)) s.wf = [0, 0, 0];
    s.wf = [0, 1, 2].map(function (i) { return clamp(Math.round(Number(s.wf[i]) || 0), 0, MAX_WF); });
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
        out.icpc = src && typeof src === 'object'
          ? { intro: src.intro, s5: src.s5, retired: src.retired, autoJudge: src.autoJudge, autoProxy: src.autoProxy, wf: Array.isArray(src.wf) ? src.wf.slice(0, 3) : null }
          : defaults();
        ensure(out);
      }
      return out;
    };
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
        var src = data && data.p && data.p.icpc;
        out.icpc = src && typeof src === 'object'
          ? { intro: src.intro, s5: src.s5, retired: src.retired, autoJudge: src.autoJudge, autoProxy: src.autoProxy, wf: src.wf }
          : defaults();
        ensure(out);
      }
      return out;
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

      var res = origApply.apply(this, arguments);

      if (st && stage && stage.id === 'world') {
        st.wf = st.wf.map(function (n) { return Math.min(MAX_WF, n + 1); });
      }

      if (st && profile.season > MAX_SEASONS) {
        profile.season = MAX_SEASONS;
        st.retired = true;
      }

      if (res) {
        if (blocked) {
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
      '.icpc-retired .btn{width:100%}'
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
    el.innerHTML = '<span>第 <b>' + Math.min(p.season, MAX_SEASONS) + '</b> 年 / 共 ' + MAX_SEASONS + ' 年</span>' +
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
          '<p>第 5 赛季结束后生涯结束，进入毕业总结。</p>';
        scroll.appendChild(sec);
      }, 30);
      return res;
    };
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
    } catch (e) {
      console.warn('[ICPC] boot check', e);
    }
  }

  setTimeout(bootCheck, 900);
  window.addEventListener('load', function () { setTimeout(bootCheck, 400); });

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
