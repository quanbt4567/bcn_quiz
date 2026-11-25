'use client';

import { useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';

// Custom SVG path for a classic round BCN Coin with a diamond/star center cut
const BCN_COIN_SVG_PATH =
  'M 12 0 A 12 12 0 1 0 12 24 A 12 12 0 1 0 12 0 Z M 12 5 L 15.5 12 L 12 19 L 8.5 12 Z';

const COIN_COLORS = ['#FACC15', '#F59E0B', '#FDE047'];
const FIREWORK_COLORS = ['#10B981', '#FBBF24', '#FFFBEB', '#F59E0B'];

interface CachedShapes {
  coinDisc: confetti.Shape;
  coinText: confetti.Shape;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function useChestParticles() {
  const shapesRef = useRef<CachedShapes | null>(null);

  const getCoinShapes = useCallback((): CachedShapes | null => {
    if (typeof window === 'undefined') return null;

    if (!shapesRef.current) {
      const coinDisc = confetti.shapeFromPath({
        path: BCN_COIN_SVG_PATH,
      });
      const coinText = confetti.shapeFromText({
        text: 'BCN',
        scalar: 1.3,
        color: '#FACC15',
        fontFamily: '"Be Vietnam Pro", "IBM Plex Sans", system-ui, sans-serif',
      });
      shapesRef.current = { coinDisc, coinText };
    }

    return shapesRef.current;
  }, []);

  const triggerChestExplosion = useCallback(
    (originX: number, originY: number, intensity = 1) => {
      if (typeof window === 'undefined') return;

      const origin = {
        x: clamp01(originX),
        y: clamp01(originY),
      };

      const shapes = getCoinShapes();
      const coinShapes: confetti.Shape[] = shapes
        ? [shapes.coinDisc, shapes.coinText]
        : ['circle'];

      // Wave 1: BCN Coins launching upward (60°-120° cone) in a parabolic arc
      void confetti({
        particleCount: Math.round(36 * intensity),
        angle: 90,
        spread: 75,
        startVelocity: 45,
        gravity: 1.25,
        scalar: 1.3,
        ticks: 220,
        decay: 0.92,
        origin,
        shapes: coinShapes,
        colors: COIN_COLORS,
        zIndex: 9999,
      });

      // Wave 2: Sparkling gold, amber & emerald fireworks radiating around the chest
      void confetti({
        particleCount: Math.round(55 * intensity),
        angle: 90,
        spread: 360,
        startVelocity: 30,
        gravity: 0.85,
        scalar: 0.9,
        ticks: 160,
        decay: 0.91,
        origin,
        shapes: ['circle', 'square', 'star'],
        colors: FIREWORK_COLORS,
        zIndex: 9998,
      });
    },
    [getCoinShapes]
  );

  return { triggerChestExplosion };
}

export default useChestParticles;
