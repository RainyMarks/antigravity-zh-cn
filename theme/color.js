// 颜色工具：解析、混合、合成与 WCAG 对比度。纯函数，打补丁时（Node）和测试共用。
//
// 颜色对象统一为 { r, g, b, a }：r/g/b 为 0–255 的实数（中间结果不取整），a 为 0–1。
// 各函数既接受颜色对象，也接受 CSS 颜色字符串（#rgb、#rrggbb、#rrggbbaa、rgb()/rgba()、transparent）。
'use strict';

const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 解析 CSS 颜色字符串。无法解析时抛出异常（配色数据有误应尽早暴露）。 */
function parse(input) {
  const s = String(input).trim();
  if (s.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = HEX_RE.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = RGB_RE.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const c = { r: +m[1], g: +m[2], b: +m[3], a };
    if ([c.r, c.g, c.b].every((v) => v <= 255) && a <= 1) return c;
  }
  throw new Error('无法解析颜色：' + input);
}

const rgba = (c) => (typeof c === 'string' ? parse(c) : c);

/** 是否为合法的 CSS 颜色（本模块支持的写法）。 */
function isColor(input) {
  try {
    parse(input);
    return true;
  } catch (e) {
    return false;
  }
}

/** 输出 CSS 颜色：不透明时为 #RRGGBB，否则为 rgb(R G B / A)。 */
function format(c) {
  const { r, g, b, a } = rgba(c);
  const ch = [r, g, b].map((v) => Math.round(clamp(v, 0, 255)));
  if (a >= 0.9995) return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `rgb(${ch.join(' ')} / ${+clamp(a, 0, 1).toFixed(3)})`;
}

/** 与 CSS `color-mix(in srgb, a p, b)` 相同：p 为 a 所占比例（0–1），按预乘 alpha 插值。 */
function mix(a, b, p) {
  const A = rgba(a);
  const B = rgba(b);
  const alpha = A.a * p + B.a * (1 - p);
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const ch = (x, y) => (x * A.a * p + y * B.a * (1 - p)) / alpha;
  return { r: ch(A.r, B.r), g: ch(A.g, B.g), b: ch(A.b, B.b), a: alpha };
}

/** 设置透明度。 */
function withAlpha(c, a) {
  return { ...rgba(c), a };
}

/** 把 top 按 alpha 合成到 bottom 上（source-over）。 */
function over(top, bottom) {
  const T = rgba(top);
  const B = rgba(bottom);
  const a = T.a + B.a * (1 - T.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const ch = (x, y) => (x * T.a + y * B.a * (1 - T.a)) / a;
  return { r: ch(T.r, B.r), g: ch(T.g, B.g), b: ch(T.b, B.b), a };
}

const toLinear = (v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** WCAG 2 相对亮度（忽略 alpha）。 */
function luminance(c) {
  const { r, g, b } = rgba(c);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2 对比度。半透明的前景先合成到背景上；背景应为不透明色。 */
function contrast(fg, bg) {
  const B = rgba(bg);
  const l1 = luminance(over(fg, B));
  const l2 = luminance(B);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// sRGB <-> OKLab（Björn Ottosson 的公式），用于和 CSS `color-mix(in oklab, …)` 一致的混合。
function toOklab(c) {
  const { r, g, b, a } = rgba(c);
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    A: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    B: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: a,
  };
}

function fromOklab({ L, A, B, alpha = 1 }) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: clamp(fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), 0, 255),
    g: clamp(fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), 0, 255),
    b: clamp(fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), 0, 255),
    a: alpha,
  };
}

/** 与 CSS `color-mix(in oklab, a p, b)` 相同（不透明颜色）。 */
function mixOklab(a, b, p) {
  const A = toOklab(a);
  const B = toOklab(b);
  const t = (x, y) => x * p + y * (1 - p);
  return fromOklab({ L: t(A.L, B.L), A: t(A.A, B.A), B: t(A.B, B.B), alpha: t(A.alpha, B.alpha) });
}

module.exports = { parse, isColor, format, mix, withAlpha, over, luminance, contrast, toOklab, fromOklab, mixOklab };
