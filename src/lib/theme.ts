export const colors = {
  bg: '#07070B',
  bgRaised: '#0D0D13',
  surface: '#15151D',
  surfaceHigh: '#20202A',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.18)',
  text: '#F7F7FA',
  textMuted: '#A6A6B4',
  textDim: '#6F6F7D',
  /** Brand crimson. */
  accent: '#FF2447',
  accentBright: '#FF3D6E',
  /** Brand saffron, the warm end of the brand gradient. */
  ember: '#FF8A1F',
  accentText: '#FFFFFF',
  danger: '#FF5C63',
  star: '#FFC53D',
  live: '#FF2447',
  success: '#2BD576',
  overlay: 'rgba(0,0,0,0.55)',
  glass: 'rgba(22,22,30,0.72)',
  glassLight: 'rgba(255,255,255,0.12)',
  focus: '#FFFFFF',
};

export const gradients = {
  brand: ['#FF3D6E', '#FF2447', '#FF8A1F'] as const,
  brandButton: ['#FF3358', '#FF2447', '#FF5A2A'] as const,
  /** Fades imagery into the page background. */
  fadeBottom: ['rgba(7,7,11,0)', 'rgba(7,7,11,0.55)', '#07070B'] as const,
  fadeLeft: ['#07070B', 'rgba(7,7,11,0.7)', 'rgba(7,7,11,0)'] as const,
  scrimTop: ['rgba(0,0,0,0.78)', 'rgba(0,0,0,0)'] as const,
  scrimBottom: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'] as const,
};

/** Outfit, loaded in the root layout. Each weight is its own family. */
export const fonts = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
  extrabold: 'Outfit_800ExtraBold',
  black: 'Outfit_900Black',
};

/**
 * Deep, cinematic two-tone backdrops for channels without artwork. Picked by a
 * hash of the name, so a channel always gets the same one.
 */
const TILE_GRADIENTS: readonly (readonly [string, string])[] = [
  ['#5B1026', '#16070D'],
  ['#3A1A6B', '#0E0818'],
  ['#0F3D5E', '#050E17'],
  ['#0E4D45', '#04130F'],
  ['#6B2E0E', '#190A04'],
  ['#5A0F4F', '#150413'],
  ['#1D2F6F', '#070B1B'],
  ['#4F3A0B', '#140E03'],
  ['#12455E', '#051118'],
  ['#5E1A1A', '#170606'],
  ['#2E1F5E', '#0A0717'],
  ['#0F4A2E', '#04120B'],
];

export function tileGradient(seed: string): readonly [string, string] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return TILE_GRADIENTS[Math.abs(h) % TILE_GRADIENTS.length];
}
