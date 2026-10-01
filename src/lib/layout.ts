import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

export type Breakpoint = 'phone' | 'tablet' | 'desktop' | 'wide' | 'ultra';
export type CardVariant = 'landscape' | 'poster';

export interface Layout {
  width: number;
  height: number;
  bp: Breakpoint;
  isTV: boolean;
  /** Tablet or larger: side-by-side layouts and inline navigation. */
  wide: boolean;
  /** Scales a size designed for a phone to this screen. */
  s(n: number): number;
  /** Horizontal page padding. */
  gutter: number;
  /** Space between cards. */
  gap: number;
  cardWidth: Record<CardVariant, number>;
  /** Columns for full-page grids. */
  columns: Record<CardVariant, number>;
  /** Billboard height on tablets and larger; phones size the billboard to its content. */
  heroHeight: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// How many cards a rail shows at once. The fraction lets the next card peek in,
// which signals that the row scrolls.
const VISIBLE: Record<Breakpoint, Record<CardVariant, number>> = {
  phone: { landscape: 2.3, poster: 3.25 },
  tablet: { landscape: 3.3, poster: 4.3 },
  desktop: { landscape: 4.3, poster: 6.2 },
  wide: { landscape: 5.3, poster: 7.2 },
  ultra: { landscape: 6.3, poster: 8.2 },
};

/**
 * One source of truth for sizing, from phones through desktop browsers to TVs.
 * Everything is derived from the window size, so layouts stay proportional on
 * any screen and adapt live to rotation, split screen and window resizing.
 */
export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const isTV = Platform.isTV;

  return useMemo(() => {
    const bp: Breakpoint =
      width >= 2400 ? 'ultra' : width >= 1440 ? 'wide' : width >= 1024 ? 'desktop' : width >= 640 ? 'tablet' : 'phone';

    // Type and spacing grow with the screen; large monitors and TVs are viewed from further away.
    let f = bp === 'phone' ? 1 : bp === 'tablet' ? 1.06 : bp === 'desktop' ? 1.1 : clamp(width / 1300, 1.12, 2.4);
    if (isTV) f = Math.max(f, 1.2);
    const s = (n: number) => Math.round(n * f);

    const gutter = Math.round(clamp(width * 0.04, 16, 120));
    const gap = s(bp === 'phone' ? 8 : 10);

    const railWidth = (v: CardVariant) => {
      const visible = VISIBLE[bp][v];
      return Math.floor((width - gutter - gap * Math.floor(visible)) / visible);
    };

    const heroHeight = Math.round(clamp(Math.min(height * 0.8, width * 0.52), 300, 1600));

    return {
      width,
      height,
      bp,
      isTV,
      wide: bp !== 'phone',
      s,
      gutter,
      gap,
      cardWidth: { landscape: railWidth('landscape'), poster: railWidth('poster') },
      columns: {
        landscape: Math.max(2, Math.round(VISIBLE[bp].landscape - 0.3)),
        poster: Math.max(3, Math.round(VISIBLE[bp].poster - 0.2)),
      },
      heroHeight,
    };
  }, [width, height, isTV]);
}

/** Height of a card of the given variant and width, including its caption. */
export function cardAspect(variant: CardVariant): number {
  return variant === 'poster' ? 1.5 : 9 / 16;
}
