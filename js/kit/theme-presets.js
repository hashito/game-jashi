/* game-kit 6e0b6f0: js/theme-presets.js — edit in game-kit and run tools/kit-sync.js */
// Mood themes of the standard (1.9): a few colours each; js/theme-make.js makeTheme() makes every token from them (AA-checked), and
// tools/make-theme.mjs writes them to css/themes.css. A game names one in game.json "theme" (on top of a base, e.g. "dark-industrial shrine-night"),
// starts its own from one ("themeColors": { "from": "shrine-night", "accent": "#…" }), or writes its own css/theme-game.css as before.
const MINCHO = "'Zen Old Mincho', 'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif";
const GOTHIC = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif";
const MARU = "'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', 'SFMono-Regular', Consolas, 'Noto Sans Mono CJK JP', monospace";

export const THEME_PRESETS = {
  'shrine-night': { label: '社の夜', about: '黒漆と朱、金の文字。神社・祭り・お札の怪談', mode: 'dark', bg: '#0b0909', surface: '#171212', text: '#efe4d2', accent: '#d8452c', accent2: '#d9b25a', font: MINCHO, radius: 4 },
  'summer-rural': { label: '夏の田舎', about: '日に焼けた紙と空の青、稲の緑。帰省・田舎道', mode: 'light', bg: '#dfe6dc', surface: '#fbf8ee', text: '#25302a', accent: '#2f6f9a', accent2: '#c27a1a', ok: '#3f7a3a', font: MARU, radius: 12 },
  'hospital-cold': { label: '夜の病棟', about: '青白い蛍光灯と消毒の緑。病院・研究所', mode: 'light', bg: '#d5dee2', surface: '#f4f8f9', text: '#1d2a30', accent: '#2a7a80', accent2: '#8a6a1a', danger: '#b02020', font: GOTHIC, radius: 6 },
  'school-dusk': { label: '夕方の校舎', about: '夕焼けの橙と黒板の緑。学校・放課後', mode: 'dark', bg: '#140f0c', surface: '#211915', text: '#f2e6da', accent: '#e8843a', accent2: '#8fc59a', font: MARU, radius: 8 },
  'vhs-tape': { label: '古いビデオ', about: '黒にマゼンタとシアン、等幅の字と走査線。テープ・映像の怪談', mode: 'dark', bg: '#07060c', surface: '#110f1a', text: '#e8e6ff', accent: '#ff4fb4', accent2: '#4fe0ff', font: MONO, radius: 2, scanlines: 0.14 },
  'snow-silence': { label: '雪の夜', about: '青みの灰と白。山小屋・雪に閉ざされた村', mode: 'light', bg: '#d8dee6', surface: '#f7f9fb', text: '#1f2633', accent: '#3a5a8a', accent2: '#8a5a2a', font: MINCHO, radius: 10 },
  'deep-water': { label: '水底', about: '紺と青緑。海・ダム・井戸・水の怪異', mode: 'dark', bg: '#050c12', surface: '#0c1822', text: '#d6ecf2', accent: '#3ec2c8', accent2: '#e0c070', font: GOTHIC, radius: 8 },
  'blood-washi': { label: '和紙と血', about: '生成りの和紙と深い赤、墨。旧家・因習・呪い', mode: 'light', bg: '#e7dfcf', surface: '#fbf6ea', text: '#2a201a', accent: '#9a1a1a', accent2: '#6a4a1a', font: MINCHO, radius: 4 },
  'office-night': { label: '深夜のオフィス', about: '灰緑の蛍光灯と事務の青。会社・倉庫・夜勤', mode: 'light', bg: '#d9ddd6', surface: '#f6f7f2', text: '#22261f', accent: '#2a5aa0', accent2: '#8a6a00', font: GOTHIC, radius: 4 },
  'candle-room': { label: '蝋燭の間', about: '琥珀と焦げ茶。蔵・仏間・灯りのない家', mode: 'dark', bg: '#0e0a06', surface: '#1b140d', text: '#f4e2c4', accent: '#e8a040', accent2: '#c86a3a', font: MINCHO, radius: 6 },
  'fog-forest': { label: '霧の森', about: '苔の緑と霧の灰。山・森・廃村', mode: 'dark', bg: '#0b0f0c', surface: '#141b16', text: '#e0e8de', accent: '#8ac27a', accent2: '#d8c890', font: GOTHIC, radius: 10 },
  'pencil-diary': { label: '鉛筆の日記', about: '罫線の紙と鉛筆の灰、赤ペン。日記・手紙・記録', mode: 'light', bg: '#e4e2da', surface: '#fdfcf6', text: '#2b2b2b', accent: '#4a5a6a', accent2: '#b3261e', font: MARU, radius: 8 },
};
export const THEME_PRESET_NAMES = Object.keys(THEME_PRESETS);
