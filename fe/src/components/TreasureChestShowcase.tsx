'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { animated, easings, to, useSprings } from '@react-spring/web';
import {
  ArrowCounterClockwise,
  Crown,
  Fire,
  HandCoins,
  SpeakerHigh,
  SpeakerSlash,
  Skull,
  Sparkle,
  X,
} from '@phosphor-icons/react';
import { Character3DStage } from '@/components/Character3DStage';
import { TreasureChest, type TreasureChestHandle } from '@/components/TreasureChest';
import { WalletCounter, type WalletRewardEvent } from '@/components/WalletCounter';
import styles from './TreasureChestModal.module.css';

const REWARD_OPTIONS = [9, 50, 200] as const;
type RewardAmount = (typeof REWARD_OPTIONS)[number];

const RARITY_CLASS_MAP: Record<RewardAmount, string> = {
  9: styles.rarityRare,
  50: styles.rarityEpic,
  200: styles.rarityMythic,
};

const CHARGE_TIER_CLASSES: Record<number, string> = {
  1: styles.chargeTier1,
  2: styles.chargeTier2,
  3: styles.chargeTier3,
};

/**
 * Push-your-luck gacha. Every opening (stage 1..3) rolls one of three outcomes:
 *  - lose:     the whole pot is gone and the chest opens empty
 *  - multiply: the pot is multiplied by a random factor (exponential growth)
 *  - small:    a small add-on, always below the base reward
 * After each non-losing roll the player chooses to keep going or cash out. Continuing after
 * stage 3 is the all-in roll: high chance to lose everything, bigger multipliers.
 */
interface StageOdds {
  lose: number;
  multiply: number;
  factors: readonly number[];
}

const STAGE_ODDS: Record<number, StageOdds> = {
  1: { lose: 0.15, multiply: 0.3, factors: [2, 3, 4] },
  2: { lose: 0.25, multiply: 0.35, factors: [2, 3, 4] },
  3: { lose: 0.35, multiply: 0.4, factors: [2, 3, 4] },
  4: { lose: 0.45, multiply: 0.55, factors: [3, 4, 5, 6] },
};

type Phase = 'idle' | 'rolling' | 'deciding' | 'cashed' | 'lost';

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function describeOdds(nextStage: number): string {
  const odds = STAGE_ODDS[nextStage];
  const factorText = `x${odds.factors[0]}–x${odds.factors[odds.factors.length - 1]}`;
  if (nextStage === 4) {
    return `Liều tất cả: mất hết ${formatPercent(odds.lose)} · nhân ${factorText} ${formatPercent(odds.multiply)}`;
  }
  const small = 1 - odds.lose - odds.multiply;
  return `Lượt ${nextStage}/3: mất hết ${formatPercent(odds.lose)} · nhân ${factorText} ${formatPercent(odds.multiply)} · thêm ít ${formatPercent(small)}`;
}

const INITIAL_WALLET_BALANCE = 495;
const REWARD_DELAY_MS = 600;
const MAGNETIC_COIN_COUNT = 8;
const SHAKE_MS = 350;

interface MagneticBurstState {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function MagneticCoinBurst({ burst }: { burst: MagneticBurstState }) {
  const [springs] = useSprings(
    MAGNETIC_COIN_COUNT,
    (index) => ({
      from: { t: 0, scale: 0.65 },
      to: { t: 1, scale: 1 },
      delay: index * 45,
      config: { duration: 560, easing: easings.easeInOutCubic },
      reset: true,
    }),
    [burst.id]
  );

  return (
    <div aria-hidden="true" className={styles.magneticCoinLayer}>
      {springs.map((spring, index) => {
        const spreadX = (index - (MAGNETIC_COIN_COUNT - 1) / 2) * 26;
        const arcPeakY = -78 - (index % 3) * 26;
        return (
          <animated.div
            key={`${burst.id}-${index}`}
            className={styles.magneticCoin}
            style={{
              left: 0,
              top: 0,
              opacity: spring.t.to((t) => (t > 0.88 ? Math.max(0, (1 - t) / 0.12) : 1)),
              transform: to([spring.t, spring.scale], (t, s) => {
                // Smooth quadratic Bezier from chest mouth to wallet medallion
                const midX = burst.startX + spreadX;
                const midY = burst.startY + arcPeakY;
                const inv = 1 - t;
                const x = inv * inv * burst.startX + 2 * inv * t * midX + t * t * burst.endX;
                const y = inv * inv * burst.startY + 2 * inv * t * midY + t * t * burst.endY;
                const popScale = t < 0.3 ? s * (1 + t * 0.8) : s * (1.24 - (t - 0.3) * 0.55);
                return `translate3d(${x - 14}px, ${y - 14}px, 0) scale(${popScale})`;
              }),
            }}
          >
            $
          </animated.div>
        );
      })}
    </div>
  );
}


export interface TreasureChestShowcaseProps {
  /** Optional close handler when rendered inside a modal */
  onCloseModal?: () => void;
}

export function TreasureChestShowcase({ onCloseModal }: TreasureChestShowcaseProps) {
  const [balance, setBalance] = useState(INITIAL_WALLET_BALANCE);
  const [selectedReward, setSelectedReward] = useState<RewardAmount>(9);
  const [phase, setPhase] = useState<Phase>('idle');
  const [stage, setStage] = useState(0);
  const [pot, setPot] = useState(0);
  const [lastRollLabel, setLastRollLabel] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isChestOpen, setIsChestOpen] = useState(false);
  const [isChestEmpty, setIsChestEmpty] = useState(false);
  const [showImpactFlash, setShowImpactFlash] = useState(false);
  const [strikeTick, setStrikeTick] = useState(0);
  const [magneticBurst, setMagneticBurst] = useState<MagneticBurstState | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastReward, setLastReward] = useState<WalletRewardEvent | null>(null);

  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chestRef = useRef<TreasureChestHandle | null>(null);
  const walletMedallionRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
      if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close();
      }
    };
  }, []);

  const getAudioContext = useCallback((): AudioContext | null => {
    if (!soundEnabled || typeof window === 'undefined') return null;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, [soundEnabled]);

  const playTone = useCallback(
    (type: OscillatorType, from: number, to: number, duration: number, volume: number) => {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(to, now + duration * 0.9);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    },
    [getAudioContext]
  );

  const playShakeSound = useCallback(
    (tier: number) => {
      const base = tier === 1 ? 140 : tier === 2 ? 190 : 240;
      playTone('triangle', base, base * 1.65, 0.34, 0.14);
    },
    [playTone]
  );

  const playLoseSound = useCallback(() => {
    playTone('sawtooth', 320, 70, 0.7, 0.12);
  }, [playTone]);

  const playBurstSound = useCallback(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      window.setTimeout(() => playTone('sine', freq, freq * 1.01, 0.42, 0.12), idx * 55);
    });
  }, [playTone]);

  const playCoinChime = useCallback(() => {
    playTone('sine', 1174.66, 1567.98, 0.35, 0.1);
  }, [playTone]);

  const triggerImpactFlash = () => {
    setShowImpactFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setShowImpactFlash(false), 180);
  };

  /** Open the chest for real: BOOM + coins fly to the wallet + balance counts up. */
  const cashOut = (amount: number) => {
    const base = selectedReward;
    setPhase('cashed');
    setPot(amount);
    setIsChestOpen(true);
    setIsChestEmpty(false);
    playBurstSound();
    triggerImpactFlash();

    const intensity = Math.min(2.4, 0.8 + (amount / base) * 0.25);
    const mouthRect = chestRef.current?.burst(intensity);
    const walletRect = walletMedallionRef.current?.getBoundingClientRect();
    if (mouthRect && walletRect) {
      setMagneticBurst({
        id: Date.now(),
        startX: mouthRect.left + mouthRect.width / 2,
        startY: mouthRect.top + mouthRect.height / 2,
        endX: walletRect.left + walletRect.width / 2,
        endY: walletRect.top + walletRect.height / 2,
      });
    }

    if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
    rewardTimerRef.current = setTimeout(() => {
      setBalance((prev) => prev + amount);
      setLastReward({ amount, id: Date.now() });
      playCoinChime();
    }, REWARD_DELAY_MS);
  };

  const resolveRoll = (nextStage: number, currentPot: number) => {
    const base = selectedReward;
    const isAllIn = nextStage > 3;
    const odds = STAGE_ODDS[nextStage];
    const roll = Math.random();
    const lidStage = Math.min(nextStage, 3);

    setIsShaking(false);
    setStage(lidStage);

    if (roll < odds.lose) {
      setPot(0);
      setLastRollLabel('MẤT TRẮNG!');
      setIsChestOpen(true);
      setIsChestEmpty(true);
      setPhase('lost');
      playLoseSound();
      return;
    }

    if (isAllIn || roll < odds.lose + odds.multiply) {
      const factor = odds.factors[Math.floor(Math.random() * odds.factors.length)];
      const nextPot = Math.max(currentPot, base) * factor;
      setLastRollLabel(`NHÂN x${factor}!`);
      if (isAllIn) {
        cashOut(nextPot);
        return;
      }
      setPot(nextPot);
    } else {
      const gain = Math.max(1, Math.round(base * (0.2 + Math.random() * 0.3)));
      setPot(currentPot + gain);
      setLastRollLabel(`Thêm +${gain}`);
    }
    setPhase('deciding');
  };

  const startRoll = () => {
    const nextStage = stage + 1;
    const currentPot = pot;
    setStrikeTick((prev) => prev + 1);
    setPhase('rolling');
    setIsShaking(true);
    playShakeSound(Math.min(nextStage, 3));
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(() => resolveRoll(nextStage, currentPot), SHAKE_MS);
  };

  const handleResetChest = () => {
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
    rollTimerRef.current = null;
    rewardTimerRef.current = null;
    setPhase('idle');
    setStage(0);
    setPot(0);
    setLastRollLabel('');
    setIsShaking(false);
    setIsChestOpen(false);
    setIsChestEmpty(false);
    setMagneticBurst(null);
  };

  const handleChestClick = () => {
    if (phase === 'idle') startRoll();
    else if (phase === 'deciding') startRoll();
    else if (phase === 'cashed' || phase === 'lost') handleResetChest();
  };

  const rarityClass = RARITY_CLASS_MAP[selectedReward];
  const nextStage = stage + 1;
  const showOdds = phase === 'idle' || phase === 'deciding';
  const chargeClass = !isChestOpen ? CHARGE_TIER_CLASSES[stage] ?? '' : '';
  const lostClass = phase === 'lost' ? styles.lostTheme : '';
  const continueLabel = stage >= 3 ? 'Liều tất cả!' : `Tiếp tục (lượt ${nextStage}/3)`;

  return (
    <section
      aria-label="Mở rương kho báu BCN Arena"
      className={`${styles.modalContainer} ${rarityClass} ${lostClass}`}
    >
      {/* Atmospheric SVG Film-Grain Noise Overlay */}
      <div aria-hidden="true" className={styles.noiseOverlay} />

      {/* 150ms Impact Screen Flash */}
      {showImpactFlash ? <div aria-hidden="true" className={styles.impactScreenFlash} /> : null}

      {/* Magnetic Flying Coins Layer */}
      {magneticBurst ? <MagneticCoinBurst burst={magneticBurst} /> : null}

      {/* Sound Toggle Button (Top-Left) */}
      <button
        type="button"
        onClick={() => setSoundEnabled((prev) => !prev)}
        aria-label={soundEnabled ? 'Tắt âm thanh hiệu ứng' : 'Bật âm thanh hiệu ứng'}
        className={styles.soundToggleBtn}
      >
        {soundEnabled ? (
          <SpeakerHigh size={17} weight="bold" />
        ) : (
          <SpeakerSlash size={17} weight="bold" />
        )}
      </button>

      {/* Modal Close Button (Top-Right) */}
      {onCloseModal ? (
        <button
          type="button"
          onClick={onCloseModal}
          aria-label="Đóng hộp thoại rương kho báu"
          className={styles.modalCloseBtn}
        >
          <X size={18} weight="bold" />
        </button>
      ) : null}

      {/* Header & Wallet Badge */}
      <div className={styles.headerGroup}>
        <div className={styles.arenaBadge}>
          <Sparkle size={14} weight="fill" />
          BCN Arena • Rương Kho Báu
        </div>

        <WalletCounter
          balance={balance}
          lastReward={lastReward}
          medallionRef={walletMedallionRef}
        />
      </div>

      {/* 3D Character + Treasure Chest Arena */}
      <div className={styles.stageWrapper}>
        <div className={styles.duoArena}>
          <Character3DStage
            stage={stage}
            shaking={isShaking}
            isOpen={isChestOpen}
            isEmpty={isChestEmpty}
            strikeTick={strikeTick}
            onCharacterClick={handleChestClick}
          />
          {strikeTick > 0 && isShaking ? (
            <div key={strikeTick} aria-hidden="true" className={styles.energyStrikeBeam} />
          ) : null}
          <TreasureChest
            ref={chestRef}
            stage={stage}
            isOpen={isChestOpen}
            isEmpty={isChestEmpty}
            shaking={isShaking}
            onChestClick={handleChestClick}
            disabled={phase === 'rolling' || phase === 'deciding'}
            className={rarityClass}
          />
        </div>

        {phase === 'cashed' ? (
          <div className={styles.rewardBanner} role="status">
            <Crown size={15} weight="fill" />
            Nhận thành công +{pot} BCN Coin!
          </div>
        ) : phase === 'lost' ? (
          <div className={styles.loseBanner} role="status">
            <Skull size={15} weight="fill" />
            Rương trống — mất sạch phần thưởng!
          </div>
        ) : phase === 'deciding' ? (
          <div className={styles.decisionPanel} role="group" aria-label="Chọn tiếp tục hay mở luôn">
            <p className={styles.decisionTitle}>
              {lastRollLabel} • Đang giữ {pot} Coin
            </p>
            <div className={styles.decisionButtons}>
              <button type="button" onClick={startRoll} className={styles.decisionContinue}>
                <Fire size={16} weight="fill" />
                {continueLabel}
              </button>
              <button type="button" onClick={() => cashOut(pot)} className={styles.decisionCash}>
                <HandCoins size={16} weight="fill" />
                Mở luôn — nhận +{pot}
              </button>
            </div>
          </div>
        ) : (
          <div className={`${styles.tapPrompt} ${chargeClass}`}>
            {phase === 'rolling' ? 'Đang mở rương…' : 'Chạm vào rương để mở lượt 1/3'}
          </div>
        )}

        {showOdds ? <p className={styles.oddsHint}>{describeOdds(nextStage)}</p> : null}
      </div>

      {/* Compact Control Bar */}
      <div className={styles.controlBar}>
        {/* Reward Tier Selector (locked while a round is in progress) */}
        <div className={styles.tierGroup}>
          <span className={styles.tierLabel}>Mức thưởng:</span>
          <div className={styles.tierButtons}>
            {REWARD_OPTIONS.map((amount) => {
              const active = selectedReward === amount;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setSelectedReward(amount)}
                  disabled={phase !== 'idle' || stage > 0}
                  className={
                    active ? `${styles.tierBtn} ${styles.tierBtnActive}` : styles.tierBtn
                  }
                >
                  +{amount} Coin
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.actionButtons}>
          <button type="button" onClick={handleResetChest} className={styles.resetChestBtn}>
            <ArrowCounterClockwise size={15} weight="bold" />
            Đóng &amp; Thử lại rương
          </button>
        </div>
      </div>
    </section>
  );
}

export default TreasureChestShowcase;
