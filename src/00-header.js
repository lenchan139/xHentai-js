// ==UserScript==
// @name         E-Hentai App — JHenTai-style mobile UX
// @namespace    ehentai-app-userscript
// @version      1.2.0
// @description  Turns e-hentai.org / exhentai.org into a fast, native-feeling mobile app: gallery grid, detail page, reader, search, favorites, history and settings.
// @author       E-Hentai App contributors
// @license      MIT
// @homepageURL  https://github.com/lenchan139/xHentai-js
// @supportURL   https://github.com/lenchan139/xHentai-js/issues
// @downloadURL  https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js
// @updateURL    https://raw.githubusercontent.com/lenchan139/xHentai-js/main/ehentai-app.user.js
// @match        https://e-hentai.org/*
// @match        https://www.e-hentai.org/*
// @match        https://exhentai.org/*
// @match        https://www.exhentai.org/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

/*
 * Works in Userscripts (Safari iOS/macOS), Tampermonkey, Violentmonkey and
 * other userscript managers. No external dependencies, no GM_* APIs.
 *
 * The script only takes over the pages it knows how to render:
 *   /, category pages, /tag/*, /uploader/*, /popular, /watched,
 *   /favorites.php, /toplist.php, /g/<gid>/<token>/, /s/<key>/<gid>-<n>
 * Every other page is left untouched.
 */
(() => {
  'use strict';

  // Never run inside iframes (ad frames, popups, etc.).
  if (window.top !== window.self) return;
