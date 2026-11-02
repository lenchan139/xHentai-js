  // ---------------------------------------------------------------------------
  // Stylesheet
  // ---------------------------------------------------------------------------

  const CSS = `
  :root{
    color-scheme:dark;
    --tabh:60px;
    --radius:16px;
    --radius-sm:11px;
    --bg:#0f0d13;
    --bg-soft:#151219;
    --card:#1b1721;
    --card2:#241f2c;
    --text:#eee8f4;
    --muted:#a79db3;
    --muted2:#7d7488;
    --line:rgba(255,255,255,.085);
    --accent:#d0bcff;
    --accent-ink:#241a3a;
    --accent2:#6750a4;
    --danger:#ff6f86;
    --ok:#71d69b;
    --shimmer:#2a2433;
    --tag-bg:#2b2734;
    --tag-fg:#c9c2d6;
    --tag-watched-bg:#173a5e;
    --tag-watched-fg:#8ec5ff;
    --tag-watched-line:rgba(88,166,255,.45);
    --shadow:0 8px 26px rgba(0,0,0,.35);
    --sat:env(safe-area-inset-top,0px);
    --sab:env(safe-area-inset-bottom,0px);
    --sal:env(safe-area-inset-left,0px);
    --sar:env(safe-area-inset-right,0px);
  }
  :root[data-ehx-theme="light"]{
    color-scheme:light;
    --bg:#f7f3fa;
    --bg-soft:#f1ebf7;
    --card:#ffffff;
    --card2:#f4eef9;
    --text:#1d1b20;
    --muted:#5f5967;
    --muted2:#8b8494;
    --line:rgba(20,10,40,.10);
    --accent:#6750a4;
    --accent-ink:#ffffff;
    --accent2:#d0bcff;
    --danger:#c33a52;
    --ok:#25824d;
    --shimmer:#e9e1f2;
    --tag-bg:#ece6f3;
    --tag-fg:#4a4354;
    --tag-watched-bg:#cfe3ff;
    --tag-watched-fg:#0b47a1;
    --tag-watched-line:#7db4ff;
    --shadow:0 8px 24px rgba(50,20,90,.12);
  }
  *,*::before,*::after{box-sizing:border-box}
  html,body{
    margin:0!important;padding:0!important;width:auto!important;min-width:0!important;
    background:var(--bg)!important;color:var(--text)!important;
    text-align:left!important;font-size:15px!important;
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif!important;
    -webkit-text-size-adjust:100%;text-size-adjust:100%;
    -webkit-tap-highlight-color:transparent;
  }
  /* clip crops sideways without making the element a scroll container.
     hidden computes overflow-y to auto, which broke position sticky and
     stopped iOS Safari from collapsing its toolbars on scroll. */
  html{scroll-behavior:auto;overflow-x:hidden;overflow-x:clip}
  body{overflow-x:hidden;overflow-x:clip}
  a{color:inherit;text-decoration:none}
  img{max-width:100%}
  button,input,select,textarea{font:inherit;color:inherit}
  button{border:0;background:none;padding:0;cursor:pointer}
  ::selection{background:var(--accent);color:var(--accent-ink)}
  .ehx-i{display:block;flex:0 0 auto}

  #${APP_ID}{
    overflow-x:hidden;overflow-x:clip;
    min-height:100vh;
    min-height:100dvh;
    display:flex;flex-direction:column;
    padding-bottom:calc(var(--tabh) + var(--sab) + 8px);
    background:var(--bg);
  }
  #${APP_ID}.ehx-no-tabbar{padding-bottom:0}

  /* ---------- Top bar ---------- */
  .ehx-topbar{
    position:sticky;top:0;z-index:40;
    display:flex;align-items:center;gap:10px;
    padding:calc(var(--sat) + 9px) calc(12px + var(--sar)) 9px calc(12px + var(--sal));
    background:rgba(15,13,19,.86);
    -webkit-backdrop-filter:blur(18px) saturate(160%);
    backdrop-filter:blur(18px) saturate(160%);
    border-bottom:1px solid var(--line);
  }
  :root[data-ehx-theme="light"] .ehx-topbar{background:rgba(247,243,250,.88)}
  .ehx-topbar.ehx-transparent{background:transparent;border-bottom:0;backdrop-filter:none;-webkit-backdrop-filter:none}
  .ehx-title{font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.15;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ehx-brand{display:flex;align-items:center;gap:9px;flex:1;min-width:0}
  .ehx-logo{
    width:32px;height:32px;border-radius:10px;flex:0 0 auto;
    display:grid;place-items:center;font-weight:900;font-size:15px;
    color:var(--accent-ink);background:linear-gradient(145deg,var(--accent),var(--accent2));
    box-shadow:0 4px 14px rgba(103,80,164,.35);
  }
  .ehx-brandname{font-size:17px;font-weight:800;letter-spacing:-.02em;line-height:1.05}
  .ehx-brandsub{font-size:10.5px;color:var(--muted2);font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-top:1px}
  .ehx-iconbtn{
    width:40px;height:40px;border-radius:50%;display:grid;place-items:center;
    color:var(--text);flex:0 0 auto;transition:background .15s ease,transform .12s ease;
  }
  .ehx-iconbtn:active{background:var(--card2);transform:scale(.94)}
  .ehx-iconbtn.ehx-small{width:34px;height:34px}
  .ehx-iconbtn[disabled]{opacity:.35;pointer-events:none}
  .ehx-topbar .ehx-iconbtn{margin:-5px 0}

  /* ---------- Generic ---------- */
  .ehx-main{flex:1;min-width:0}
  .ehx-pad{padding-left:calc(12px + var(--sal));padding-right:calc(12px + var(--sar))}
  .ehx-muted{color:var(--muted)}
  .ehx-dim{color:var(--muted2)}
  .ehx-row{display:flex;align-items:center;gap:8px}
  .ehx-grow{flex:1;min-width:0}
  .ehx-center{display:grid;place-items:center}
  .ehx-divider{height:1px;background:var(--line);margin:14px 0}
  .ehx-nowrap{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  .ehx-btn{
    display:inline-flex;align-items:center;justify-content:center;gap:7px;
    height:42px;padding:0 18px;border-radius:999px;font-size:14px;font-weight:650;
    background:var(--card2);color:var(--text);border:1px solid var(--line);
    transition:transform .12s ease,opacity .12s ease;
  }
  .ehx-btn:active{transform:scale(.97);opacity:.9}
  .ehx-btn-primary{background:var(--accent);color:var(--accent-ink);border-color:transparent;box-shadow:0 6px 18px rgba(103,80,164,.28)}
  .ehx-btn-danger{color:var(--danger)}
  .ehx-btn-block{display:flex;width:100%}
  .ehx-btn[disabled]{opacity:.45;pointer-events:none}

  .ehx-pill{
    display:inline-flex;align-items:center;gap:5px;
    height:27px;padding:0 10px;border-radius:999px;
    background:var(--card2);border:1px solid var(--line);
    font-size:11.5px;font-weight:650;color:var(--muted);white-space:nowrap;
  }

  /* ---------- Category chips ---------- */
  .ehx-chips{
    display:flex;gap:7px;overflow-x:auto;padding:10px calc(12px + var(--sar)) 10px calc(12px + var(--sal));
    scrollbar-width:none;-ms-overflow-style:none;
    -webkit-overflow-scrolling:touch;
  }
  .ehx-chips::-webkit-scrollbar{display:none}
  .ehx-chip{
    flex:0 0 auto;height:32px;padding:0 13px;border-radius:999px;
    display:inline-flex;align-items:center;gap:6px;
    background:var(--card);border:1px solid var(--line);
    font-size:12.5px;font-weight:650;color:var(--muted);
    transition:background .15s,color .15s,border-color .15s;
  }
  .ehx-chip:active{transform:scale(.97)}
  .ehx-chip.ehx-active{background:var(--accent);color:var(--accent-ink);border-color:transparent}
  .ehx-chip .ehx-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.9}

  /* ---------- Gallery cards ---------- */
  .ehx-grid{
    display:grid;grid-template-columns:repeat(var(--ehx-cols,2),minmax(0,1fr));
    gap:12px;padding:2px calc(12px + var(--sar)) 26px calc(12px + var(--sal));
  }
  .ehx-grid.ehx-listmode{grid-template-columns:1fr;gap:9px}
  .ehx-card{
    position:relative;background:var(--card);border-radius:var(--radius);
    overflow:hidden;border:1px solid var(--line);
    box-shadow:0 4px 16px rgba(0,0,0,.16);
    transition:transform .14s ease;
  }
  .ehx-card:active{transform:scale(.985)}
  .ehx-cover{position:relative;aspect-ratio:3/4;overflow:hidden;background:var(--card2)}
  .ehx-cover.ehx-cover-loading{
    background:linear-gradient(100deg,var(--card2) 20%,var(--shimmer) 40%,var(--card2) 60%);
    background-size:200% 100%;animation:ehx-shimmer 1.6s linear infinite}
  .ehx-cover img{width:100%;height:100%;object-fit:cover;display:block;background:var(--card2)}
  .ehx-cover-fallback{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted2);background:var(--card2)}
  .ehx-cover:after{content:"";position:absolute;inset:auto 0 0 0;height:42%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.52));pointer-events:none}
  .ehx-badge{
    position:absolute;z-index:2;display:inline-flex;align-items:center;gap:4px;
    height:21px;padding:0 7px;border-radius:6px;font-size:10px;font-weight:800;
    letter-spacing:.02em;color:#fff;background:rgba(0,0,0,.62);
    -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  }
  .ehx-badge.ehx-cat{left:7px;top:7px;text-transform:uppercase;background:var(--catcolor,#777);color:#120d18}
  .ehx-badge.ehx-pages{right:7px;bottom:7px;background:rgba(0,0,0,.7)}
  .ehx-badge.ehx-lang{right:7px;bottom:7px;background:rgba(0,0,0,.7)}
  .ehx-badge.ehx-resume{left:7px;bottom:7px;background:var(--accent);color:var(--accent-ink)}
  .ehx-cover-blur{filter:blur(14px) saturate(.8);transform:scale(1.08)}
  .ehx-card-body{padding:9px 10px 10px}
  .ehx-card-title{
    font-size:13px;font-weight:650;line-height:1.28;letter-spacing:-.005em;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
    min-height:2.56em;
  }
  .ehx-card-sub{margin-top:4px;font-size:11px;color:var(--muted);display:flex;align-items:center;gap:5px;min-width:0}
  .ehx-card-sub .ehx-nowrap{min-width:0}
  .ehx-card-tags{display:flex;flex-wrap:wrap;gap:4px;overflow:hidden;margin-top:6px;max-height:42px;align-content:flex-start}
  .ehx-tag{
    display:inline-flex;align-items:center;height:19px;padding:0 6px;border-radius:5px;
    font-size:9.5px;font-weight:700;white-space:nowrap;
    background:var(--tag-bg);color:var(--tag-fg);
  }
  .ehx-tag.ehx-tag-watched{background:var(--tag-watched-bg);color:var(--tag-watched-fg)}
  .ehx-card-foot{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:10.5px;color:var(--muted2)}
  .ehx-rating{display:inline-flex;align-items:center;gap:2px;color:#f5c451;font-weight:700;font-size:10.5px}
  .ehx-rating .ehx-i{width:11px;height:11px}
  .ehx-stars{display:none;gap:1px}
  .ehx-listmode .ehx-stars{display:inline-flex}
  .ehx-listmode .ehx-rating-compact{display:none}
  .ehx-star{display:inline-flex;opacity:.24}
  .ehx-star.ehx-star-on{opacity:1}
  .ehx-star.ehx-star-on svg{fill:currentColor}
  .ehx-progress{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.18);z-index:3}
  .ehx-progress>i{display:block;height:100%;background:var(--accent)}
  .ehx-hidden-tag{display:none}
  .ehx-reveal{
    position:absolute;inset:0;z-index:4;display:grid;place-items:center;gap:6px;
    background:rgba(10,8,14,.55);color:#fff;font-size:11px;font-weight:700;
  }
  .ehx-reveal .ehx-i{opacity:.9}

  /* list mode */
  .ehx-listmode .ehx-card{display:flex;align-items:stretch;min-height:140px}
  .ehx-listmode .ehx-cover{width:108px;aspect-ratio:3/4;flex:0 0 auto;border-radius:0}
  .ehx-listmode .ehx-cover:after{display:none}
  .ehx-listmode .ehx-card-body{flex:1;min-width:0;padding:11px 12px;display:flex;flex-direction:column;justify-content:flex-start;gap:3px}
  .ehx-listmode .ehx-card-title{min-height:0;-webkit-line-clamp:2}
  .ehx-listmode .ehx-card-tags{max-height:66px}
  .ehx-listmode .ehx-badge.ehx-cat{font-size:9px;height:18px;left:5px;top:5px}
  .ehx-listmode .ehx-badge.ehx-pages{right:5px;bottom:5px}
  .ehx-listmode .ehx-badge.ehx-lang{right:5px;bottom:5px}

  /* ---------- Skeletons / states ---------- */
  .ehx-skel{background:linear-gradient(100deg,var(--card) 20%,var(--card2) 40%,var(--card) 60%);background-size:200% 100%;animation:ehx-shimmer 1.25s infinite linear;border-radius:var(--radius)}
  @keyframes ehx-shimmer{to{background-position:-200% 0}}
  .ehx-skel-card{height:260px;border-radius:var(--radius)}
  .ehx-empty{padding:64px 26px;text-align:center;color:var(--muted)}
  .ehx-empty .ehx-i{margin:0 auto 12px;opacity:.55}
  .ehx-empty h3{margin:0 0 6px;font-size:16px;color:var(--text)}
  .ehx-empty p{margin:0 0 18px;font-size:13px;line-height:1.5}
  .ehx-error{padding:40px 22px;text-align:center}
  .ehx-error p{color:var(--muted);font-size:13px;line-height:1.5;margin:0 0 16px}
  .ehx-spinner{
    width:26px;height:26px;border-radius:50%;
    border:2.5px solid var(--line);border-top-color:var(--accent);
    animation:ehx-spin .8s linear infinite;margin:0 auto;
  }
  @keyframes ehx-spin{to{transform:rotate(360deg)}}
  .ehx-loading{padding:28px;display:grid;place-items:center}
  .ehx-loading-label{display:flex;align-items:center;justify-content:center;gap:9px;padding:14px 16px 4px;font-size:12px;font-weight:650;color:var(--muted)}
  .ehx-loading-label .ehx-spinner{width:16px;height:16px;border-width:2px;margin:0}
  .ehx-top-load{position:fixed;top:0;left:0;right:0;height:2px;z-index:200;background:transparent;overflow:hidden}
  .ehx-top-load:after{content:"";display:block;width:38%;height:100%;background:var(--accent);animation:ehx-load 1.1s ease-in-out infinite}
  @keyframes ehx-load{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}

  /* ---------- Bottom tab bar ---------- */
  .ehx-tabbar{
    position:fixed;left:0;right:0;bottom:0;z-index:50;
    display:flex;align-items:stretch;
    padding:6px calc(6px + var(--sar)) calc(6px + var(--sab)) calc(6px + var(--sal));
    background:rgba(15,13,19,.92);
    -webkit-backdrop-filter:blur(20px) saturate(170%);backdrop-filter:blur(20px) saturate(170%);
    border-top:1px solid var(--line);
  }
  :root[data-ehx-theme="light"] .ehx-tabbar{background:rgba(255,255,255,.92)}
  .ehx-tab{
    flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
    min-height:48px;border-radius:12px;color:var(--muted2);font-size:9.5px;font-weight:650;
    transition:color .15s,background .15s;
  }
  .ehx-tab .ehx-i{width:23px;height:23px}
  .ehx-tab span{white-space:nowrap}
  .ehx-tab.ehx-active{color:var(--accent)}
  .ehx-tab:active{background:var(--card2)}
  .ehx-tab.ehx-active .ehx-i{filter:drop-shadow(0 0 8px rgba(208,188,255,.45))}
  .ehx-fab{
    position:fixed;z-index:60;bottom:calc(var(--tabh) + var(--sab) + 16px);
    width:46px;height:46px;border-radius:50%;display:grid;place-items:center;
    background:var(--accent);color:var(--accent-ink);box-shadow:0 8px 24px rgba(0,0,0,.35);
    opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .2s,transform .2s;
  }
  .ehx-fab-left{left:14px}
  .ehx-fab-right{right:14px}
  .ehx-fab.ehx-show{opacity:1;transform:none;pointer-events:auto}
  .ehx-fab.ehx-hide{display:none}
  .ehx-has-update .ehx-fab{bottom:calc(var(--tabh) + var(--sab) + 86px)}

  /* ---------- Drawer ---------- */
  .ehx-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:90;opacity:0;pointer-events:none;transition:opacity .2s ease;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
  .ehx-scrim.ehx-show{opacity:1;pointer-events:auto}
  .ehx-drawer{
    position:fixed;top:0;bottom:0;left:0;z-index:100;width:min(84vw,320px);
    background:var(--bg-soft);border-right:1px solid var(--line);
    transform:translateX(-102%);pointer-events:none;transition:transform .24s cubic-bezier(.2,.8,.2,1);
    display:flex;flex-direction:column;
    padding:calc(var(--sat) + 16px) 10px calc(var(--sab) + 14px) 10px;
    box-shadow:24px 0 60px rgba(0,0,0,.4);
  }
  .ehx-drawer.ehx-open{transform:translateX(0);pointer-events:auto}
  .ehx-drawer-head{display:flex;align-items:center;gap:11px;padding:8px 12px 16px}
  .ehx-avatar{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:var(--card2);border:1px solid var(--line);color:var(--accent)}
  .ehx-drawer-name{font-size:14px;font-weight:750;line-height:1.2}
  .ehx-drawer-sub{font-size:11px;color:var(--muted2);margin-top:2px}
  .ehx-drawer-list{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .ehx-drawer-item{
    display:flex;align-items:center;gap:12px;width:100%;
    padding:12px 13px;border-radius:12px;font-size:14px;font-weight:600;color:var(--text);
    text-align:left;
  }
  .ehx-drawer-item .ehx-i{color:var(--muted)}
  .ehx-drawer-item.ehx-active{background:var(--card2);color:var(--accent)}
  .ehx-drawer-item.ehx-active .ehx-i{color:var(--accent)}
  .ehx-drawer-item:active{background:var(--card2)}
  .ehx-drawer-sep{height:1px;background:var(--line);margin:8px 10px}
  .ehx-drawer-foot{padding:8px 12px;font-size:10px;color:var(--muted2);line-height:1.5}

  /* ---------- Detail ---------- */
  .ehx-detail{min-height:60vh}
  .ehx-dhero{position:relative;overflow:hidden;padding:calc(var(--sat) + 0px) 0 0}
  .ehx-dhero-bg{position:absolute;inset:-30px;background-size:cover;background-position:center;filter:blur(30px) saturate(1.25);opacity:.55;transform:scale(1.12)}
  .ehx-dhero-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,13,19,.20) 0%,rgba(15,13,19,.55) 55%,var(--bg) 100%)}
  :root[data-ehx-theme="light"] .ehx-dhero-shade{background:linear-gradient(180deg,rgba(247,243,250,.15),rgba(247,243,250,.65) 55%,var(--bg) 100%)}
  .ehx-dhero-inner{position:relative;z-index:2;padding:42px calc(14px + var(--sar)) 6px calc(14px + var(--sal));display:flex;gap:14px;align-items:flex-end}
  .ehx-dcover{
    width:126px;flex:0 0 auto;aspect-ratio:3/4;border-radius:14px;overflow:hidden;
    background:var(--card2);box-shadow:0 14px 34px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.14);
  }
  .ehx-dcover img{width:100%;height:100%;object-fit:cover;display:block}
  .ehx-dhead{flex:1;min-width:0;padding-bottom:2px}
  .ehx-dtitle{font-size:17px;font-weight:800;line-height:1.22;letter-spacing:-.02em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 1px 14px rgba(0,0,0,.45)}
  .ehx-dsub{margin-top:6px;font-size:11.5px;color:var(--muted);line-height:1.3;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
  .ehx-dmeta{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
  .ehx-dstats{display:flex;flex-wrap:wrap;gap:10px;padding:4px calc(14px + var(--sal)) 0 calc(14px + var(--sar));position:relative;z-index:2;font-size:11.5px;color:var(--muted)}
  .ehx-dstats b{color:var(--text);font-weight:700}
  .ehx-actions{
    display:flex;gap:9px;overflow-x:auto;padding:14px calc(14px + var(--sar)) 6px calc(14px + var(--sal));
    scrollbar-width:none;-webkit-overflow-scrolling:touch;
  }
  .ehx-actions::-webkit-scrollbar{display:none}
  .ehx-action{
    flex:0 0 auto;width:66px;display:flex;flex-direction:column;align-items:center;gap:5px;
    color:var(--muted);font-size:10px;font-weight:650;
  }
  .ehx-action .ehx-abox{
    width:50px;height:44px;border-radius:13px;display:grid;place-items:center;
    background:var(--card);border:1px solid var(--line);color:var(--text);
    transition:transform .12s,background .15s;
  }
  .ehx-action:active .ehx-abox{transform:scale(.94);background:var(--card2)}
  .ehx-action.ehx-primary .ehx-abox{background:var(--accent);color:var(--accent-ink);border-color:transparent;box-shadow:0 6px 18px rgba(103,80,164,.3)}
  .ehx-action.ehx-primary{color:var(--accent)}
  .ehx-action.ehx-saved .ehx-abox{background:var(--tag-watched-bg);color:var(--tag-watched-fg);border-color:var(--tag-watched-line)}
  .ehx-action.ehx-saved{color:var(--tag-watched-fg)}
  .ehx-action[disabled]{opacity:.4;pointer-events:none}

  .ehx-section{padding:8px calc(14px + var(--sar)) 4px calc(14px + var(--sal))}
  .ehx-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 9px}
  .ehx-section-title{font-size:13px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;color:var(--muted)}
  .ehx-section-title span{color:var(--muted2);font-weight:600;text-transform:none;letter-spacing:0}

  .ehx-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .ehx-info-item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:9px 11px;min-width:0}
  .ehx-info-k{font-size:10px;color:var(--muted2);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  .ehx-info-v{font-size:12.5px;font-weight:650;margin-top:2px;line-height:1.3;word-break:break-word}

  .ehx-taggroup{margin:0 0 10px}
  .ehx-taggroup-title{font-size:10.5px;font-weight:800;color:var(--muted2);letter-spacing:.05em;text-transform:uppercase;margin:0 0 5px}
  .ehx-tagwrap{display:flex;flex-wrap:wrap;gap:5px}
  .ehx-tagpill{
    display:inline-flex;align-items:center;height:25px;padding:0 9px;border-radius:7px;
    font-size:11.5px;font-weight:700;background:var(--tag-bg);color:var(--tag-fg);
    border:1px solid transparent;
  }
  .ehx-tagpill.ehx-tag-watched{
    background:var(--tag-watched-bg);color:var(--tag-watched-fg);
    border-color:var(--tag-watched-line);
  }
  .ehx-tagpill:active{opacity:.75}
  .ehx-tagpill.ehx-hiddenop{opacity:.38}

  .ehx-desc{font-size:13px;line-height:1.6;color:var(--muted);white-space:pre-wrap;word-break:break-word}
  .ehx-desc a{color:var(--accent)}

  /* Thumbnail grid */
  .ehx-thumbs{
    display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;
    padding:0 calc(14px + var(--sar)) 18px calc(14px + var(--sal));
  }
  .ehx-thumb{
    position:relative;overflow:hidden;border-radius:9px;background:var(--card2);
    border:1px solid var(--line);aspect-ratio:3/4;cursor:pointer;
  }
  .ehx-thumb.ehx-thumb-loading{
    background:linear-gradient(100deg,var(--card2) 20%,var(--shimmer) 40%,var(--card2) 60%);
    background-size:200% 100%;animation:ehx-shimmer 1.6s linear infinite;
  }
  .ehx-thumb-inner{
    position:absolute;left:0;top:0;width:200px;background-repeat:no-repeat;
    transform-origin:top left;pointer-events:none;transform:scale(var(--thumb-scale,.5));
  }
  .ehx-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .ehx-thumb-num{
    position:absolute;right:4px;bottom:4px;z-index:2;font-size:9px;font-weight:800;
    background:rgba(0,0,0,.65);color:#fff;border-radius:4px;padding:1px 4px;
  }
  .ehx-thumb.ehx-read:after{content:"";position:absolute;inset:0;border:2px solid var(--accent);border-radius:9px;pointer-events:none}
  .ehx-thumbctl{display:flex;align-items:center;gap:8px;padding:0 calc(14px + var(--sar)) 10px calc(14px + var(--sal))}
  .ehx-thumbctl .ehx-grow{font-size:11.5px;color:var(--muted)}

  /* ---------- Reader ---------- */
  .ehx-reader{
    position:fixed;inset:0;z-index:120;background:#070608;color:#fff;
    display:flex;flex-direction:column;overscroll-behavior:none;
    touch-action:manipulation;
  }
  .ehx-reader.ehx-vertical{touch-action:pan-y pinch-zoom}
  .ehx-reader.ehx-paged{touch-action:pan-x pinch-zoom}
  .ehx-rscroll{
    position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;
    -webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;
    scrollbar-width:none;
  }
  .ehx-rscroll::-webkit-scrollbar{display:none}
  .ehx-rpage{
    position:relative;width:100%;background:#0a090c;overflow:hidden;
    display:flex;align-items:flex-start;justify-content:center;
    padding-left:var(--sal);padding-right:var(--sar);
  }
  .ehx-rpage img{display:block;width:100%;height:auto;min-height:120px;background:#0a090c;user-select:none;-webkit-user-select:none}
  .ehx-reader.ehx-fit-contain .ehx-rpage img{width:auto;max-width:100%;height:auto;max-height:100dvh;object-fit:contain}
  .ehx-rpage.ehx-failed{min-height:60vh;display:grid;place-items:center}
  .ehx-rfail{display:flex;flex-direction:column;align-items:center;gap:10px;color:#bbb;font-size:12px;padding:30px;text-align:center}
  .ehx-rfail .ehx-btn{height:36px;font-size:12px}
  .ehx-rloader{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
  .ehx-rloader .ehx-spinner{border-color:rgba(255,255,255,.18);border-top-color:#fff}

  /* paged */
  .ehx-reader.ehx-paged .ehx-rscroll{
    display:flex;overflow-x:auto;overflow-y:hidden;
    scroll-snap-type:x mandatory;scroll-behavior:auto;overscroll-behavior-x:contain;
  }
  .ehx-reader.ehx-paged .ehx-rpage{
    flex:0 0 100%;width:100%;height:100vh;height:100dvh;scroll-snap-align:center;scroll-snap-stop:always;
    align-items:center;background:#070608;
  }
  .ehx-reader.ehx-paged .ehx-rpage img{
    width:100%;height:auto;max-height:100dvh;object-fit:contain;margin:auto;
  }
  .ehx-reader.ehx-paged.ehx-fit-contain .ehx-rpage img{width:auto;height:auto;max-width:100vw;max-height:100dvh}

  .ehx-rchrome{position:absolute;inset:0;z-index:5;pointer-events:none;opacity:1;transition:opacity .22s ease}
  .ehx-rchrome.ehx-hidden{opacity:0}
  .ehx-rchrome.ehx-hidden .ehx-rtop,.ehx-rchrome.ehx-hidden .ehx-rbottom,.ehx-rchrome.ehx-hidden .ehx-rmid{pointer-events:none}
  .ehx-rtop{
    position:absolute;top:0;left:0;right:0;pointer-events:auto;
    padding:calc(var(--sat) + 6px) calc(8px + var(--sar)) 34px calc(8px + var(--sal));
    display:flex;align-items:center;gap:6px;
    background:linear-gradient(180deg,rgba(0,0,0,.82),rgba(0,0,0,0));
  }
  .ehx-rbottom{
    position:absolute;left:0;right:0;bottom:0;pointer-events:auto;
    padding:34px calc(10px + var(--sar)) calc(var(--sab) + 8px) calc(10px + var(--sal));
    background:linear-gradient(0deg,rgba(0,0,0,.86),rgba(0,0,0,0));
  }
  .ehx-rtitle{flex:1;min-width:0;font-size:12.5px;font-weight:650;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px}
  .ehx-rcount{font-size:11px;font-weight:700;color:#cfc8d8;background:rgba(255,255,255,.12);padding:4px 9px;border-radius:999px;white-space:nowrap}
  .ehx-reader .ehx-iconbtn{color:#fff}
  .ehx-reader .ehx-iconbtn:active{background:rgba(255,255,255,.14)}
  .ehx-rbar{display:flex;align-items:center;gap:10px;padding:0 2px}
  .ehx-rbar .ehx-iconbtn{width:38px;height:38px}
  .ehx-rrange{
    -webkit-appearance:none;appearance:none;flex:1;height:22px;background:transparent;margin:0;
  }
  .ehx-rrange::-webkit-slider-runnable-track{height:3px;background:rgba(255,255,255,.28);border-radius:999px}
  .ehx-rrange::-webkit-slider-thumb{-webkit-appearance:none;width:17px;height:17px;border-radius:50%;background:#fff;margin-top:-7px;box-shadow:0 1px 6px rgba(0,0,0,.5)}
  .ehx-rrange::-moz-range-track{height:3px;background:rgba(255,255,255,.28);border-radius:999px}
  .ehx-rrange::-moz-range-thumb{width:17px;height:17px;border:0;border-radius:50%;background:#fff}
  .ehx-rprogress{position:absolute;top:0;left:0;right:0;height:2px;background:rgba(255,255,255,.14);z-index:6}
  .ehx-rprogress>i{display:block;height:100%;background:#fff;transition:width .2s ease}
  .ehx-rmid{position:absolute;inset:0;z-index:1}
  .ehx-rmid .ehx-tapzone{position:absolute;top:0;bottom:0;width:32%}
  .ehx-rmid .ehx-tapzone.ehx-left{left:0}
  .ehx-rmid .ehx-tapzone.ehx-right{right:0}
  .ehx-rmid .ehx-rtapmid{position:absolute;top:0;bottom:0;left:32%;right:32%}
  .ehx-rhint{
    position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    z-index:7;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:650;
    padding:9px 14px;border-radius:999px;pointer-events:none;opacity:0;transition:opacity .2s;
  }
  .ehx-rhint.ehx-show{opacity:1}

  /* ---------- Sheet / modal ---------- */
  .ehx-sheet-scrim{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.58);opacity:0;pointer-events:none;transition:opacity .2s ease}
  .ehx-sheet-scrim.ehx-show{opacity:1;pointer-events:auto}
  .ehx-sheet{
    position:fixed;left:0;right:0;bottom:0;z-index:160;
    max-height:86dvh;display:flex;flex-direction:column;
    background:var(--bg-soft);border-radius:22px 22px 0 0;
    border-top:1px solid var(--line);box-shadow:0 -20px 60px rgba(0,0,0,.45);
    transform:translateY(102%);pointer-events:none;transition:transform .26s cubic-bezier(.2,.85,.2,1);
    padding-bottom:var(--sab);
  }
  .ehx-sheet.ehx-open{transform:translateY(0);pointer-events:auto}
  .ehx-sheet-grab{width:38px;height:4px;border-radius:99px;background:var(--line);margin:9px auto 3px;flex:0 0 auto}
  .ehx-sheet-head{display:flex;align-items:center;gap:10px;padding:8px 18px 10px}
  .ehx-sheet-title{font-size:16px;font-weight:800;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ehx-sheet-body{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:2px 18px 18px}
  .ehx-sheet-foot{padding:10px 18px 14px;border-top:1px solid var(--line);display:flex;gap:9px;flex:0 0 auto}
  .ehx-sheet-foot .ehx-btn{flex:1}

  /* toast */
  .ehx-toast{
    position:fixed;left:50%;bottom:calc(var(--tabh) + var(--sab) + 18px);transform:translate(-50%,14px);
    z-index:200;max-width:88vw;padding:10px 15px;border-radius:999px;
    background:rgba(35,30,42,.96);color:#fff;font-size:12.5px;font-weight:650;
    box-shadow:0 8px 28px rgba(0,0,0,.4);opacity:0;transition:opacity .2s,transform .2s;
    pointer-events:none;text-align:center;
  }
  :root[data-ehx-theme="light"] .ehx-toast{background:rgba(35,30,42,.94)}
  .ehx-toast.ehx-show{opacity:1;transform:translate(-50%,0)}

  /* Update banner (above the dock) */
  .ehx-update{
    position:fixed;left:10px;right:10px;bottom:calc(var(--tabh) + var(--sab) + 10px);
    z-index:80;display:flex;align-items:center;gap:10px;padding:10px 12px;
    border-radius:14px;background:var(--card);border:1px solid var(--accent);
    box-shadow:0 12px 34px rgba(0,0,0,.42);color:var(--text);
  }
  .ehx-update-msg{display:flex;align-items:center;gap:9px;flex:1;min-width:0;color:var(--accent)}
  .ehx-update-msg b{display:block;font-size:12.5px;color:var(--text)}
  .ehx-update-msg span{display:block;font-size:10.5px;color:var(--muted2);margin-top:1px}
  .ehx-update-install{
    flex:0 0 auto;padding:7px 12px;border-radius:999px;background:var(--accent);color:#241a3a;
    font-size:11.5px;font-weight:800;text-decoration:none;
  }
  .ehx-update-close{
    flex:0 0 auto;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;
    color:var(--muted2);background:var(--card2);
  }

  /* ---------- Forms ---------- */
  .ehx-input{
    width:100%;height:44px;padding:0 13px;border-radius:12px;
    background:var(--card);border:1px solid var(--line);color:var(--text);
    font-size:15px;outline:none;
  }
  .ehx-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(208,188,255,.14)}
  textarea.ehx-input{height:auto;min-height:80px;padding:11px 13px;resize:vertical}
  .ehx-field{margin-bottom:13px}
  .ehx-label{display:block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2);margin:0 0 6px}
  .ehx-searchwrap{display:flex;align-items:center;gap:8px;padding:8px calc(12px + var(--sar)) 6px calc(12px + var(--sal))}
  .ehx-searchbox{flex:1;display:flex;align-items:center;gap:8px;height:42px;padding:0 12px;background:var(--card);border:1px solid var(--line);border-radius:999px}
  .ehx-searchbox .ehx-i{color:var(--muted2)}
  .ehx-searchbox input{flex:1;min-width:0;background:none;border:0;outline:none;font-size:14px;color:var(--text)}
  .ehx-searchbox input::placeholder{color:var(--muted2)}
  .ehx-suggest{margin:6px 0 0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;max-height:260px;overflow-y:auto}
  .ehx-suggest-item{display:block;width:100%;text-align:left;padding:9px 12px;font-size:12.5px;color:var(--text);border-bottom:1px solid var(--line)}
  .ehx-suggest-item:last-child{border-bottom:0}
  .ehx-suggest-item:active{background:var(--card2)}
  .ehx-suggest-item b{color:var(--accent);font-weight:800}

  /* settings */
  .ehx-settings{padding:4px calc(12px + var(--sar)) 30px calc(12px + var(--sal))}
  .ehx-group{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:12px}
  .ehx-group-title{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted2);margin:16px 4px 7px}
  .ehx-setting{display:flex;align-items:center;gap:12px;padding:12px 13px;border-bottom:1px solid var(--line);min-height:50px}
  .ehx-setting:last-child{border-bottom:0}
  .ehx-setting-label{flex:1;min-width:0;font-size:13.5px;font-weight:600}
  .ehx-setting-sub{font-size:11px;color:var(--muted2);margin-top:2px;font-weight:400}
  .ehx-setting-value{font-size:12.5px;color:var(--muted);font-weight:650;display:flex;align-items:center;gap:5px}
  .ehx-switch{width:46px;height:27px;border-radius:99px;background:var(--card2);border:1px solid var(--line);position:relative;transition:background .18s;flex:0 0 auto}
  .ehx-switch:after{content:"";position:absolute;width:21px;height:21px;border-radius:50%;background:var(--muted);left:2px;top:2px;transition:transform .18s,background .18s}
  .ehx-switch.ehx-on{background:var(--accent);border-color:transparent}
  .ehx-switch.ehx-on:after{transform:translateX(19px);background:var(--accent-ink)}
  .ehx-seg{display:flex;background:var(--card2);border-radius:10px;padding:3px;gap:2px}
  .ehx-seg button{height:29px;padding:0 10px;border-radius:8px;font-size:11.5px;font-weight:650;color:var(--muted);display:inline-flex;align-items:center;gap:5px;justify-content:center}
  .ehx-seg button.ehx-active{background:var(--card);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.2)}

  /* login */
  .ehx-login{max-width:430px;margin:0 auto;padding:34px 20px 30px;text-align:center}
  .ehx-login .ehx-logo{width:58px;height:58px;border-radius:18px;font-size:24px;margin:0 auto 16px}
  .ehx-login h2{margin:0 0 8px;font-size:20px;letter-spacing:-.02em}
  .ehx-login p{margin:0 0 18px;font-size:13px;line-height:1.55;color:var(--muted)}
  .ehx-login form{text-align:left;margin-top:14px}
  .ehx-note{font-size:11.5px;line-height:1.5;color:var(--muted2);background:var(--card);border:1px solid var(--line);border-radius:11px;padding:10px 12px;margin-top:14px;text-align:left}

  /* toplist */
  .ehx-ranklist{padding:4px calc(12px + var(--sar)) 26px calc(12px + var(--sal))}
  .ehx-rankgroup{margin-bottom:18px}
  .ehx-rankgroup h3{font-size:14px;margin:8px 0 8px}
  .ehx-rankrow{display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--card);border:1px solid var(--line);border-radius:11px;margin-bottom:6px;font-size:13px}
  .ehx-rankno{width:26px;flex:0 0 auto;font-weight:800;color:var(--accent);font-size:12px}

  /* desktop-ish */
  @media (min-width:700px){
    .ehx-grid{grid-template-columns:repeat(var(--ehx-cols,3),minmax(0,1fr))}
    .ehx-grid.ehx-listmode{grid-template-columns:repeat(2,minmax(0,1fr))}
    .ehx-thumbs{grid-template-columns:repeat(5,minmax(0,1fr))}
    .ehx-dhero-inner{max-width:920px;margin:0 auto}
    .ehx-section,.ehx-actions,.ehx-thumbs,.ehx-thumbctl,.ehx-dstats{max-width:920px;margin-left:auto;margin-right:auto}
    .ehx-sheet{left:50%;right:auto;transform:translate(-50%,102%);width:min(560px,100vw);border-radius:22px 22px 0 0}
    .ehx-sheet.ehx-open{transform:translate(-50%,0)}
  }
  @media (prefers-reduced-motion:reduce){
    *{animation-duration:.001ms!important;transition-duration:.001ms!important}
  }
  `;

  function injectStyles() {
    let el = document.getElementById('ehx-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'ehx-style';
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = CSS;
  }
