'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Coins } from '@phosphor-icons/react';
import { animated, easings, useSpring } from '@react-spring/web';
import styles from './TreasureChestModal.module.css';

export interface WalletRewardEvent {
  amount: number;
  id: number;
}

export interface WalletCounterProps {
  /** Current wallet balance in BCN Coins (defaults to 495) */
  balance?: number;
  /** Latest reward event to trigger bounce, gold glow, and floating +X Coin badge */
  lastReward?: WalletRewardEvent | null;
  /** Optional ref to the coin medallion for magnetic coin targeting */
  medallionRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export function WalletCounter({
  balance = 495,
  lastReward = null,
  medallionRef,
  className = '',
}: WalletCounterProps) {
  const [isCelebrating, setIsCelebrating] = useState(false);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth incremental count-up over 1000ms
  const numberSpring = useSpring({
    val: balance,
    config: {
      duration: 1000,
      easing: easings.easeOutCubic,
    },
  });

  // Gentle badge bounce & gold aura border when receiving reward
  const badgeSpring = useSpring({
    scale: isCelebrating ? 1.07 : 1,
    glow: isCelebrating ? 1 : 0,
    config: {
      tension: 340,
      friction: 14,
    },
  });

  useEffect(() => {
    if (!lastReward) return;

    setIsCelebrating(true);
    if (celebrateTimerRef.current) {
      clearTimeout(celebrateTimerRef.current);
    }
    celebrateTimerRef.current = setTimeout(() => {
      setIsCelebrating(false);
    }, 1050);

    return () => {
      if (celebrateTimerRef.current) {
        clearTimeout(celebrateTimerRef.current);
      }
    };
  }, [lastReward]);

  return (
    <div className={[styles.walletWrapper, className].filter(Boolean).join(' ')}>
      {/* Floating +X Coin badge */}
      {lastReward ? (
        <div
          key={lastReward.id}
          aria-live="polite"
          className={styles.walletFloatingBadge}
        >
          +{lastReward.amount} Coin
        </div>
      ) : null}

      {/* Main Dark-mode BCN Arena Wallet Badge */}
      <animated.div
        className={styles.walletBadge}
        style={{
          transform: badgeSpring.scale.to((s) => `scale(${s})`),
          boxShadow: badgeSpring.glow.to(
            (g) =>
              `0 12px 32px rgba(0, 0, 0, 0.55), 0 0 ${Math.round(g * 28)}px rgba(250, 204, 21, ${0.15 + g * 0.55}), inset 0 1px 0 rgba(255, 255, 255, 0.08)`
          ),
        }}
      >
        {/* Gold Coin Icon Medallion */}
        <div ref={medallionRef} className={styles.walletMedallion}>
          <Coins size={24} weight="fill" />
        </div>

        {/* Balance Info */}
        <div className={styles.walletInfo}>
          <span className={styles.walletLabel}>VÍ BCN COIN</span>
          <div className={styles.walletValueRow}>
            <animated.span className={styles.walletAmount}>
              {numberSpring.val.to((n) => Math.round(n).toLocaleString('vi-VN'))}
            </animated.span>
            <span className={styles.walletCurrency}>Coin</span>
          </div>
        </div>
      </animated.div>
    </div>
  );
}

export default WalletCounter;
