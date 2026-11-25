'use client';

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { animated, to, useSpring } from '@react-spring/web';
import { useChestParticles } from '@/hooks/useChestParticles';
import styles from './TreasureChestModal.module.css';

export interface TreasureChestHandle {
  /** Fire the coin fountain + fireworks from the chest mouth; returns the mouth DOMRect */
  burst: (intensity?: number) => DOMRect | undefined;
}

export interface TreasureChestProps {
  /** Lid crack level while the gacha is in progress: 0 (closed) .. 3 */
  stage: number;
  /** Lid fully open (-115deg) */
  isOpen: boolean;
  /** Opened chest is empty (lost round): no god-rays, coins or shockwave */
  isEmpty?: boolean;
  /** Plays the 350ms anticipation shake while true */
  shaking?: boolean;
  /** Fired when the chest itself is clicked */
  onChestClick?: () => void;
  /** Disable interaction */
  disabled?: boolean;
  /** Optional wrapper className (e.g., rarity theme) */
  className?: string;
}

const LID_OPEN_ANGLE_DEG = -115;
// Signed lid angle per gacha stage: 1/3, 2/3 and 3/3 of the way before the final reveal
const LID_STAGE_ANGLES: Record<number, number> = { 0: 0, 1: -24, 2: -52, 3: -80 };

// Chest 3D dimensions (px)
const CHEST_W = 220;
const CHEST_BASE_H = 112;
const CHEST_LID_H = 54;
const CHEST_D = 148;
const HALF_D = CHEST_D / 2;

const CHARGE_TIER_CLASSES: Record<number, string> = {
  1: styles.chargeTier1,
  2: styles.chargeTier2,
  3: styles.chargeTier3,
};

export const TreasureChest = forwardRef<TreasureChestHandle, TreasureChestProps>(
  function TreasureChest(
    {
      stage,
      isOpen,
      isEmpty = false,
      shaking = false,
      onChestClick,
      disabled = false,
      className = '',
    },
    ref
  ) {
    const open = isOpen;
    const chargeStep = stage;
    const isShaking = shaking;
    const chestMouthRef = useRef<HTMLDivElement | null>(null);
    const { triggerChestExplosion } = useChestParticles();

    const lidSpring = useSpring({
      rotateX: open ? LID_OPEN_ANGLE_DEG : LID_STAGE_ANGLES[stage] ?? 0,
      config: open
        ? { tension: 260, friction: 13, mass: 1.15 }
        : stage > 0
          ? { tension: 240, friction: 16, mass: 1.05 }
          : { tension: 220, friction: 24, mass: 1 },
    });

    // Light pouring out of the chest grows with every stage; none when the chest is empty
    const auraSpring = useSpring({
      opacity: open ? (isEmpty ? 0 : 1) : [0, 0.22, 0.45, 0.62][stage] ?? 0,
      scale: open ? 1 : [0.35, 0.48, 0.65, 0.8][stage] ?? 0.35,
      config: { tension: 180, friction: 18 },
    });

    const lockSpring = useSpring({
      y: open ? -8 : -2 * stage,
      rotateX: open ? -25 : -6 * stage,
      config: { tension: 280, friction: 15 },
    });

    const [tilt, setTilt] = useSpring(() => ({
      rx: -13,
      ry: -18,
      config: { tension: 260, friction: 24 },
    }));

    const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType !== 'mouse' || disabled) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      void setTilt.start({
        rx: -13 - ny * 12,
        ry: -18 + nx * 18,
      });
    };

    const handlePointerLeave = () => {
      void setTilt.start({ rx: -13, ry: -18 });
    };

    const handleChestClick = () => {
      if (disabled) return;
      onChestClick?.();
    };

    useImperativeHandle(ref, () => ({
      burst: (intensity = 1) => {
        const rect = chestMouthRef.current?.getBoundingClientRect();
        const originX =
          rect && window.innerWidth > 0 ? (rect.left + rect.width / 2) / window.innerWidth : 0.5;
        const originY =
          rect && window.innerHeight > 0 ? (rect.top + rect.height / 2) / window.innerHeight : 0.5;
        triggerChestExplosion(originX, originY, intensity);
        return rect;
      },
    }));

    const stageClassName = [
      styles.chestStage,
      isShaking ? styles.chestShaking : !open ? styles.chestFloat : '',
    ]
      .filter(Boolean)
      .join(' ');

    const activeChargeClass = !open ? CHARGE_TIER_CLASSES[chargeStep] ?? '' : '';

    return (
      <div
        className={[styles.chestRoot, className, activeChargeClass]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Interactive 3D Button Stage */}
        <button
          type="button"
          onClick={handleChestClick}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          disabled={disabled}
          aria-expanded={open}
          aria-label={open ? 'Đóng rương kho báu' : 'Mở rương kho báu'}
          className={styles.chestButton}
        >
          {/* Rotating 3D Arcane Magic Circle Beneath Chest */}
          <div aria-hidden="true" className={styles.magicCircle}>
            <div className={styles.magicCircleInner} />
          </div>

          {/* Warm Golden Aura Behind Chest */}
          <div aria-hidden="true" className={styles.chestBackAura} />

          {/* Ground Contact Shadow */}
          <div aria-hidden="true" className={styles.groundShadow} />

          {/* Idle Float / 350ms Shake Wrapper */}
          <div className={stageClassName}>
            {/* Unified 3D Chest Container (220x180, preserve-3d) with 650ms Summon Entrance */}
            <div className={`${styles.chestContainer} ${styles.chestSummon}`}>
              {/* 3D Isometric Camera Angle with Pointer Parallax */}
              <animated.div
                className={styles.chestIsometric}
                style={{
                  transform: to(
                    [tilt.rx, tilt.ry],
                    (rx, ry) => `rotateX(${rx}deg) rotateY(${ry}deg)`
                  ),
                }}
              >
                {/* ==================== ROTATING DUAL GOD-RAYS (INSIDE CHEST) ==================== */}
                <animated.div
                  aria-hidden="true"
                  className={styles.godRaysWrapper}
                  style={{
                    opacity: auraSpring.opacity,
                    transform: auraSpring.scale.to(
                      (s) =>
                        `translate3d(-50%, -50%, 0px) rotateY(18deg) rotateX(13deg) scale(${s})`
                    ),
                  }}
                >
                  <div className={styles.godRaysSecondary} />
                  <div className={styles.godRaysSpin} />
                  <div className={styles.godRaysCore} />
                </animated.div>

                {/* ==================== MULTI-TAP SEAM CRACKS & CHARGE GLOW ==================== */}
                {!open && chargeStep > 0 ? (
                  <div aria-hidden="true" className={styles.seamCrack} />
                ) : null}
                {isShaking && chargeStep >= 3 ? (
                  <div aria-hidden="true" className={styles.seamGlow} />
                ) : null}

                {/* ==================== IMPACT BURST & FLOATING 3D COINS ==================== */}
                {open && !isEmpty ? (
                  <>
                    <div aria-hidden="true" className={styles.shockwaveRing} />
                    <div aria-hidden="true" className={styles.impactFlash} />
                    <div
                      aria-hidden="true"
                      className={`${styles.interiorCoin} ${styles.interiorCoin1}`}
                    />
                    <div
                      aria-hidden="true"
                      className={`${styles.interiorCoin} ${styles.interiorCoin2}`}
                    />
                    <div
                      aria-hidden="true"
                      className={`${styles.interiorCoin} ${styles.interiorCoin3}`}
                    />
                  </>
                ) : null}

                {/* ==================== CHEST BASE (WOOD + GOLD TRIMS) ==================== */}
                <div className={styles.chestBase}>
                  {/* Chest Mouth Anchor for Particle Origin */}
                  <div
                    ref={chestMouthRef}
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      width: '16px',
                      height: '16px',
                      transform: 'translateX(-50%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Interior Cavity Floor (Golden Treasure Glow Bed) */}
                  <div
                    className={styles.woodInterior}
                    style={{
                      position: 'absolute',
                      width: `${CHEST_W - 12}px`,
                      height: `${CHEST_D - 12}px`,
                      left: '6px',
                      top: `${-(CHEST_D - 12) / 2 + 8}px`,
                      transform: 'rotateX(90deg) translateZ(-4px)',
                      background: open && !isEmpty
                        ? 'radial-gradient(circle at 50% 50%, #fef08a 0%, #f59e0b 45%, #451a03 95%)'
                        : undefined,
                      boxShadow: open && !isEmpty
                        ? 'inset 0 0 28px rgba(254, 240, 138, 0.9), 0 0 24px rgba(251, 191, 36, 0.65)'
                        : undefined,
                      transition: 'background 260ms ease, box-shadow 260ms ease',
                    }}
                  />

                  {/* Base Front Face */}
                  <div
                    className={styles.woodSurface}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      transform: `translateZ(${HALF_D}px)`,
                      borderRadius: '0 0 8px 8px',
                      boxShadow:
                        'inset 0 0 0 5px #d4941a, inset 0 0 18px rgba(0,0,0,0.55)',
                    }}
                  >
                    <div
                      className={styles.goldStrap}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '12px',
                        borderBottom: '1px solid rgba(90, 50, 5, 0.6)',
                      }}
                    />
                    <div
                      className={styles.goldStrap}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '10px',
                        borderRadius: '0 0 6px 6px',
                      }}
                    />
                    <div
                      className={styles.goldStrapVertical}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '22px',
                        width: '16px',
                      }}
                    />
                    <div
                      className={styles.goldStrapVertical}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        right: '22px',
                        width: '16px',
                      }}
                    />
                    {[18, 86].map((topPos) => (
                      <React.Fragment key={topPos}>
                        <span
                          style={{
                            position: 'absolute',
                            top: `${topPos}px`,
                            left: '27px',
                            width: '6px',
                            height: '6px',
                            borderRadius: '9999px',
                            background: '#fff3b0',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                          }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            top: `${topPos}px`,
                            right: '27px',
                            width: '6px',
                            height: '6px',
                            borderRadius: '9999px',
                            background: '#fff3b0',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                          }}
                        />
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Base Back Face */}
                  <div
                    className={styles.woodSurface}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      transform: `rotateY(180deg) translateZ(${HALF_D}px)`,
                      borderRadius: '0 0 8px 8px',
                      boxShadow: 'inset 0 0 0 5px #b5760a',
                    }}
                  />

                  {/* Base Right Face */}
                  <div
                    className={styles.woodSide}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: `${(CHEST_W - CHEST_D) / 2}px`,
                      width: `${CHEST_D}px`,
                      height: `${CHEST_BASE_H}px`,
                      transform: `rotateY(90deg) translateZ(${CHEST_W / 2}px)`,
                      boxShadow:
                        'inset 0 0 0 5px #c98614, inset 0 0 22px rgba(0,0,0,0.55)',
                    }}
                  >
                    <div
                      className={styles.goldStrap}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '12px',
                      }}
                    />
                    <div
                      className={styles.goldStrap}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '10px',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: '40px',
                        left: '50%',
                        width: '34px',
                        height: '26px',
                        transform: 'translateX(-50%)',
                        borderRadius: '9999px',
                        border: '5px solid #f5c542',
                        boxShadow: '0 3px 6px rgba(0,0,0,0.45)',
                      }}
                    />
                  </div>

                  {/* Base Left Face */}
                  <div
                    className={styles.woodSide}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: `${(CHEST_W - CHEST_D) / 2}px`,
                      width: `${CHEST_D}px`,
                      height: `${CHEST_BASE_H}px`,
                      transform: `rotateY(-90deg) translateZ(${CHEST_W / 2}px)`,
                      boxShadow:
                        'inset 0 0 0 5px #c98614, inset 0 0 22px rgba(0,0,0,0.6)',
                    }}
                  >
                    <div
                      className={styles.goldStrap}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '12px',
                      }}
                    />
                    <div
                      className={styles.goldStrap}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '10px',
                      }}
                    />
                  </div>

                  {/* Base Bottom Face */}
                  <div
                    style={{
                      position: 'absolute',
                      top: `${(CHEST_BASE_H - CHEST_D) / 2}px`,
                      left: 0,
                      width: `${CHEST_W}px`,
                      height: `${CHEST_D}px`,
                      transform: `rotateX(-90deg) translateZ(${CHEST_BASE_H / 2}px)`,
                      background: '#2b1306',
                    }}
                  />

                  {/* ==================== CENTER GOLD LOCK ==================== */}
                  <animated.div
                    style={{
                      position: 'absolute',
                      top: '-16px',
                      left: '50%',
                      transform: to(
                        [lockSpring.y, lockSpring.rotateX],
                        (y, rx) =>
                          `translate3d(-50%, ${y}px, ${HALF_D + 6}px) rotateX(${rx}deg)`
                      ),
                      transformStyle: 'preserve-3d',
                      willChange: 'transform',
                      zIndex: 10,
                    }}
                  >
                    <div className={styles.goldLockPlate}>
                      <div className={styles.goldLockShackle} />
                      <svg
                        width="16"
                        height="20"
                        viewBox="0 0 16 20"
                        fill="none"
                        aria-hidden="true"
                        style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.5))' }}
                      >
                        <circle cx="8" cy="7" r="3.6" fill="#1a0d02" />
                        <path d="M6.2 9.5H9.8L11 17.5H5L6.2 9.5Z" fill="#1a0d02" />
                      </svg>
                    </div>
                  </animated.div>
                </div>

                {/* ==================== 3D HINGED LID (-115DEG) ====================
                    Hinge = back-bottom edge of the lid (y: 100%, z: -HALF_D), which is exactly the
                    back-top edge of the base. The lid's depth extends toward +Z (viewer), so CSS
                    rotateX must be POSITIVE to tip its front edge up and back; the spring keeps the
                    spec's signed opening angle (-115deg) and is negated when applied. */}
                <animated.div
                  className={styles.chestLid}
                  style={{
                    transform: lidSpring.rotateX.to((rx) => `rotateX(${-rx}deg)`),
                    zIndex: 5,
                  }}
                >
                  {/* Lid Front Face */}
                  <div
                    className={styles.woodSurface}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      transform: `translateZ(${HALF_D}px)`,
                      borderRadius: '12px 12px 0 0',
                      boxShadow:
                        'inset 0 0 0 5px #d4941a, inset 0 4px 12px rgba(255,255,255,0.12)',
                    }}
                  >
                    <div
                      className={styles.goldStrap}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '11px',
                      }}
                    />
                    <div
                      className={styles.goldStrapVertical}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '22px',
                        width: '16px',
                      }}
                    />
                    <div
                      className={styles.goldStrapVertical}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        right: '22px',
                        width: '16px',
                      }}
                    />
                  </div>

                  {/* Lid Back Face */}
                  <div
                    className={styles.woodSurface}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      transform: `rotateY(180deg) translateZ(${HALF_D}px)`,
                      borderRadius: '12px 12px 0 0',
                      boxShadow: 'inset 0 0 0 5px #b5760a',
                    }}
                  />

                  {/* Lid Top Face */}
                  <div
                    className={styles.woodSurface}
                    style={{
                      position: 'absolute',
                      top: `${(CHEST_LID_H - CHEST_D) / 2}px`,
                      left: 0,
                      width: `${CHEST_W}px`,
                      height: `${CHEST_D}px`,
                      transform: `rotateX(90deg) translateZ(${CHEST_LID_H / 2}px)`,
                      boxShadow:
                        'inset 0 0 0 5px #e3a72b, inset 0 0 24px rgba(0,0,0,0.35)',
                    }}
                  >
                    <div
                      className={styles.goldStrapVertical}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '22px',
                        width: '16px',
                      }}
                    />
                    <div
                      className={styles.goldStrapVertical}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        right: '22px',
                        width: '16px',
                      }}
                    />
                  </div>

                  {/* Lid Underside */}
                  <div
                    className={styles.woodInterior}
                    style={{
                      position: 'absolute',
                      top: `${(CHEST_LID_H - CHEST_D) / 2}px`,
                      left: 0,
                      width: `${CHEST_W}px`,
                      height: `${CHEST_D}px`,
                      transform: `rotateX(-90deg) translateZ(${CHEST_LID_H / 2}px)`,
                      boxShadow: 'inset 0 0 0 5px #9b6409',
                    }}
                  />

                  {/* Lid Right Face */}
                  <div
                    className={styles.woodSide}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: `${(CHEST_W - CHEST_D) / 2}px`,
                      width: `${CHEST_D}px`,
                      height: `${CHEST_LID_H}px`,
                      transform: `rotateY(90deg) translateZ(${CHEST_W / 2}px)`,
                      borderRadius: '10px 10px 0 0',
                      boxShadow: 'inset 0 0 0 5px #c98614',
                    }}
                  />

                  {/* Lid Left Face */}
                  <div
                    className={styles.woodSide}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: `${(CHEST_W - CHEST_D) / 2}px`,
                      width: `${CHEST_D}px`,
                      height: `${CHEST_LID_H}px`,
                      transform: `rotateY(-90deg) translateZ(${CHEST_W / 2}px)`,
                      borderRadius: '10px 10px 0 0',
                      boxShadow: 'inset 0 0 0 5px #c98614',
                    }}
                  />
                </animated.div>
              </animated.div>
            </div>
          </div>
        </button>
      </div>
    );
  }
);

export default TreasureChest;
