export const LIGHTROOM_DEVELOP_VERT = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const LIGHTROOM_DEVELOP_FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform sampler2D uCurveLut;
uniform sampler2D uBaseCurveLut;
uniform sampler2D uRegionMask;
uniform sampler3D uCreativeLut;
uniform float uBasic[13];
uniform float uHslHue[8];
uniform float uHslSat[8];
uniform float uHslLum[8];
uniform float uDetail[8];
uniform float uColorMatrix[9];
uniform float uRegion;
uniform float uUseRegionMask;
uniform float uPassThrough;
uniform float uProfileBaseEnabled;
uniform float uUseColorMatrix;
uniform float uDisplayTransform;
uniform float uLinearMax;
uniform float uCreativeLutEnabled;
uniform float uCreativeLutIntensity;

#define TEMP uBasic[0]
#define TINT uBasic[1]
#define EXPOSURE uBasic[2]
#define CONTRAST uBasic[3]
#define HIGHLIGHTS uBasic[4]
#define SHADOWS uBasic[5]
#define WHITES uBasic[6]
#define BLACKS uBasic[7]
#define TEXTURE uBasic[8]
#define CLARITY uBasic[9]
#define DEHAZE uBasic[10]
#define VIBRANCE uBasic[11]
#define SATURATION uBasic[12]

const float HSL_CENTERS[8] = float[8](0.0, 0.083, 0.153, 0.25, 0.458, 0.583, 0.764, 0.889);
const float HSL_WIDTH = 0.09;
const float LINEAR_PIVOT = 0.18;

vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float l = (maxC + minC) * 0.5;
  if (maxC == minC) return vec3(0.0, 0.0, l);
  float d = maxC - minC;
  float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
  float h;
  if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return vec3(h / 6.0, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y <= 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0/3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0/3.0)
  );
}

vec3 linearToSrgb(vec3 c) {
  vec3 outC;
  for (int i = 0; i < 3; i++) {
    float v = max(c[i], 0.0);
    if (v <= 0.0031308) outC[i] = v * 12.92;
    else outC[i] = 1.055 * pow(v, 1.0 / 2.4) - 0.055;
  }
  return outC;
}

vec3 applyColorMatrix(vec3 c) {
  if (uUseColorMatrix < 0.5) return c;
  return vec3(
    dot(c, vec3(uColorMatrix[0], uColorMatrix[1], uColorMatrix[2])),
    dot(c, vec3(uColorMatrix[3], uColorMatrix[4], uColorMatrix[5])),
    dot(c, vec3(uColorMatrix[6], uColorMatrix[7], uColorMatrix[8]))
  );
}

float sampleBaseCurve1d(float linearIn) {
  float x = max(linearIn, 0.0);
  float t = clamp(x / uLinearMax, 0.0, 1.0);
  float curved = texture(uBaseCurveLut, vec2(t, 0.5)).r;
  if (x > uLinearMax) {
    float atMax = texture(uBaseCurveLut, vec2(1.0, 0.5)).r;
    return atMax + (x - uLinearMax) * 0.35;
  }
  return curved;
}

vec3 applyBaseProfile(vec3 c) {
  if (uProfileBaseEnabled < 0.5) return c;
  return vec3(
    sampleBaseCurve1d(max(c.r, 0.0)),
    sampleBaseCurve1d(max(c.g, 0.0)),
    sampleBaseCurve1d(max(c.b, 0.0))
  );
}

vec3 applyWhiteBalance(vec3 c) {
  float t = TEMP * 0.35;
  float g = TINT * 0.25;
  c.r *= 1.0 + t;
  c.b *= 1.0 - t;
  c.g *= 1.0 + g;
  c.r *= 1.0 - g * 0.35;
  c.b *= 1.0 + g * 0.35;
  return c;
}

vec3 applyExposure(vec3 c) {
  return c * exp2(EXPOSURE * 1.4);
}

vec3 applyContrast(vec3 c) {
  float factor = 1.0 + CONTRAST * 0.75;
  float pivot = LINEAR_PIVOT * uLinearMax;
  return (c - pivot) * factor + pivot;
}

vec3 applyToneZones(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float hiW = smoothstep(0.55 * uLinearMax, 0.98 * uLinearMax, l);
  float shW = 1.0 - smoothstep(0.08 * uLinearMax, 0.42 * uLinearMax, l);
  float whW = smoothstep(0.82 * uLinearMax, uLinearMax, l);
  float blW = 1.0 - smoothstep(0.0, 0.12 * uLinearMax, l);

  float pivot = 0.72 * uLinearMax;
  if (HIGHLIGHTS < 0.0) {
    float w = hiW * abs(HIGHLIGHTS) * 0.022;
    float t = max(0.0, l - pivot);
    float newL = pivot + t / (1.0 + w * 4.0);
    float scale = l > 1e-6 ? newL / l : 1.0;
    c *= scale;
  } else if (HIGHLIGHTS > 0.0) {
    c += HIGHLIGHTS * 0.004 * hiW * uLinearMax;
  }

  if (SHADOWS > 0.0) {
    c += SHADOWS * 0.004 * shW * uLinearMax;
  } else if (SHADOWS < 0.0) {
    float crush = abs(SHADOWS) * 0.006 * shW;
    float factor = 1.0 - crush * (1.0 - min(1.0, l / max(0.42 * uLinearMax, 1e-6)));
    c *= factor;
  }

  c += WHITES * 0.0035 * whW * uLinearMax;
  c += BLACKS * 0.0035 * blW * uLinearMax * -1.0;
  return max(c, vec3(0.0));
}

vec3 applyCurve(vec3 c) {
  float peak = max(max(c.r, c.g), c.b);
  float domain = peak > 1.05 ? uLinearMax : 1.0;
  float r = texture(uCurveLut, vec2(clamp(c.r / domain, 0.0, 1.0), 0.5)).r;
  float g = texture(uCurveLut, vec2(clamp(c.g / domain, 0.0, 1.0), 0.5)).g;
  float b = texture(uCurveLut, vec2(clamp(c.b / domain, 0.0, 1.0), 0.5)).b;
  if (domain > 1.0) return vec3(r, g, b) * domain;
  return vec3(r, g, b);
}

float hueWeight(float h, float center) {
  float d = abs(h - center);
  d = min(d, 1.0 - d);
  return smoothstep(HSL_WIDTH, 0.0, d);
}

vec3 applyHsl(vec3 c) {
  vec3 norm = clamp(c / uLinearMax, 0.0, 1.0);
  vec3 hsl = rgb2hsl(norm);
  float hShift = 0.0;
  float sShift = 0.0;
  float lShift = 0.0;
  for (int i = 0; i < 8; i++) {
    float w = hueWeight(hsl.x, HSL_CENTERS[i]);
    hShift += uHslHue[i] * w * 0.12;
    sShift += uHslSat[i] * w * 0.65;
    lShift += uHslLum[i] * w * 0.35;
  }
  hsl.x = fract(hsl.x + hShift);
  hsl.y = clamp(hsl.y * (1.0 + sShift), 0.0, 1.0);
  hsl.z = clamp(hsl.z + lShift, 0.0, 1.0);
  return hsl2rgb(hsl) * uLinearMax;
}

vec3 applyVibrance(vec3 c) {
  vec3 norm = clamp(c / uLinearMax, 0.0, 1.0);
  vec3 hsl = rgb2hsl(norm);
  float satBoost = VIBRANCE * (1.0 - hsl.y) * 0.85;
  hsl.y = clamp(hsl.y + satBoost, 0.0, 1.0);
  vec3 outC = hsl2rgb(hsl) * uLinearMax;
  return mix(c, outC, abs(VIBRANCE));
}

vec3 applySaturation(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, 1.0 + SATURATION * 0.85);
}

vec3 applyClarity(vec3 c, vec2 uv) {
  if (abs(CLARITY) < 0.001) return c;
  vec2 px = uDetail[6] > 0.0 ? vec2(uDetail[6], uDetail[7]) : vec2(1.0/1024.0);
  vec3 blur = vec3(0.0);
  blur += texture(uSource, uv + vec2(px.x * 3.0, 0.0)).rgb;
  blur += texture(uSource, uv - vec2(px.x * 3.0, 0.0)).rgb;
  blur += texture(uSource, uv + vec2(0.0, px.y * 3.0)).rgb;
  blur += texture(uSource, uv - vec2(0.0, px.y * 3.0)).rgb;
  blur *= 0.25;
  float mid = smoothstep(0.15 * uLinearMax, 0.85 * uLinearMax, dot(c, vec3(0.2126, 0.7152, 0.0722)));
  return c + (c - blur) * CLARITY * 0.85 * mid;
}

vec3 applyDehaze(vec3 c) {
  if (abs(DEHAZE) < 0.001) return c;
  float dark = min(min(c.r, c.g), c.b);
  float amount = DEHAZE * 0.55;
  vec3 dehazed = (c - dark * amount) / max(1.0 - dark * amount, 0.05);
  return mix(c, dehazed, abs(DEHAZE));
}

vec3 applyTexture(vec3 c, vec2 uv) {
  if (abs(TEXTURE) < 0.001) return c;
  vec2 px = vec2(uDetail[6], uDetail[7]);
  vec3 hp = c;
  hp -= texture(uSource, uv + px).rgb * 0.25;
  hp -= texture(uSource, uv - px).rgb * 0.25;
  hp += texture(uSource, uv + vec2(px.x, -px.y)).rgb * 0.25;
  hp += texture(uSource, uv + vec2(-px.x, px.y)).rgb * 0.25;
  return mix(c, c + hp * TEXTURE * 0.35, abs(TEXTURE));
}

vec3 applySharpen(vec3 c, vec2 uv) {
  float amount = uDetail[0];
  if (abs(amount) < 0.001) return c;
  float radius = max(uDetail[1] * 2.5 + 0.5, 0.5);
  vec2 px = vec2(uDetail[6], uDetail[7]) * radius;
  vec3 blur = vec3(0.0);
  blur += texture(uSource, uv + vec2(px.x, 0.0)).rgb;
  blur += texture(uSource, uv - vec2(px.x, 0.0)).rgb;
  blur += texture(uSource, uv + vec2(0.0, px.y)).rgb;
  blur += texture(uSource, uv - vec2(0.0, px.y)).rgb;
  blur *= 0.25;
  float edge = length(c - blur);
  float mask = smoothstep(uDetail[3] * 0.5, uDetail[3] * 0.5 + 0.25, edge);
  float detailMix = 0.5 + uDetail[2] * 0.5;
  return c + (c - blur) * amount * 1.2 * mask * detailMix;
}

vec3 applyNoise(vec3 c, vec2 uv) {
  float lum = uDetail[4];
  float col = uDetail[5];
  if (abs(lum) < 0.001 && abs(col) < 0.001) return c;
  vec2 px = vec2(uDetail[6], uDetail[7]);
  vec3 blur = vec3(0.0);
  blur += texture(uSource, uv + px).rgb;
  blur += texture(uSource, uv - px).rgb;
  blur += texture(uSource, uv + vec2(px.x, -px.y)).rgb;
  blur += texture(uSource, uv + vec2(-px.x, px.y)).rgb;
  blur *= 0.25;
  vec3 outC = c;
  if (abs(lum) > 0.001) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float bl = dot(blur, vec3(0.2126, 0.7152, 0.0722));
    float newL = mix(l, bl, abs(lum) * 0.65);
    outC = mix(outC, outC * (newL / max(l, 0.001)), abs(lum));
  }
  if (abs(col) > 0.001) {
    outC = mix(outC, blur, abs(col) * 0.35);
  }
  return outC;
}

vec3 applyCreativeLut(vec3 srgb) {
  if (uCreativeLutEnabled < 0.5 || uCreativeLutIntensity <= 0.001) return srgb;
  vec3 graded = texture(uCreativeLut, clamp(srgb, 0.0, 1.0)).rgb;
  return mix(srgb, graded, uCreativeLutIntensity);
}

vec3 applyAdjustmentSet(vec3 c, vec2 uv) {
  c = applyWhiteBalance(c);
  c = applyColorMatrix(c);
  c = applyExposure(c);
  c = applyContrast(c);
  c = applyToneZones(c);
  c = applyCurve(c);
  c = applyBaseProfile(c);
  c = applyHsl(c);
  c = applyVibrance(c);
  c = applySaturation(c);
  c = applyDehaze(c);
  c = applyClarity(c, uv);
  c = applyTexture(c, uv);
  c = applySharpen(c, uv);
  c = applyNoise(c, uv);
  return max(c, vec3(0.0));
}

float regionFactor() {
  if (uUseRegionMask > 0.5) return texture(uRegionMask, vUv).r;
  return uRegion;
}

void main() {
  if (uPassThrough > 0.5) {
    vec3 c = texture(uSource, vUv).rgb;
    if (uDisplayTransform > 0.5) {
      c = linearToSrgb(c);
      c = applyCreativeLut(c);
      fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    } else {
      fragColor = vec4(c, 1.0);
    }
    return;
  }
  vec4 src = texture(uSource, vUv);
  vec3 adjusted = applyAdjustmentSet(src.rgb, vUv);
  float region = regionFactor();
  vec3 outRgb = mix(src.rgb, adjusted, region);
  if (uDisplayTransform > 0.5) {
    outRgb = linearToSrgb(outRgb);
    outRgb = applyCreativeLut(outRgb);
    fragColor = vec4(clamp(outRgb, 0.0, 1.0), 1.0);
  } else {
    fragColor = vec4(outRgb, src.a);
  }
}
`;
