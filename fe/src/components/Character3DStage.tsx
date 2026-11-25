'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import styles from './TreasureChestModal.module.css';

export interface Character3DStageProps {
  /** Path to the .glb model under /public */
  modelUrl?: string;
  /** Current gacha stage (0..3) */
  stage: number;
  /** True while the chest is shaking/rolling */
  shaking: boolean;
  /** True when the chest is fully open */
  isOpen: boolean;
  /** True when the opened chest is empty (lost round) */
  isEmpty?: boolean;
  /** Increments each time the player triggers a chest strike */
  strikeTick?: number;
  /** Fired when the user clicks (not drags) the 3D character */
  onCharacterClick?: () => void;
}

export function Character3DStage({
  modelUrl = '/models/character-level-6.glb',
  stage,
  shaking,
  isOpen,
  isEmpty = false,
  strikeTick = 0,
  onCharacterClick,
}: Character3DStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Keep latest choreography props in a ref so the 60fps rAF loop reads them without re-mounting WebGL
  const stateRef = useRef({ stage, shaking, isOpen, isEmpty, strikeTick });
  stateRef.current = { stage, shaking, isOpen, isEmpty, strikeTick };

  // Interactive pointer drag rotation + click detection
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    moved: false,
    targetYaw: 0.36, // Slightly angled toward the treasure chest on the right
    currentYaw: 0.36,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let rafId = 0;

    const width = container.clientWidth || 240;
    const height = container.clientHeight || 270;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 3.3);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    container.appendChild(renderer.domElement);

    // Studio Lighting: Key + Cool Fill + Emerald & Gold Rim Lights
    const ambientLight = new THREE.AmbientLight('#dbeafe', 1.1);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#fffbeb', 2.4);
    keyLight.position.set(2.5, 4, 3.5);
    scene.add(keyLight);

    const rimEmerald = new THREE.PointLight('#10b981', 3.5, 10);
    rimEmerald.position.set(-2.2, 1.2, -1.5);
    scene.add(rimEmerald);

    const rimGold = new THREE.PointLight('#f59e0b', 3.2, 10);
    rimGold.position.set(2.4, 0.8, 1.2);
    scene.add(rimGold);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let loadedModel: THREE.Object3D | null = null;
    let celebrateSpin = 0;
    let wasOpen = false;
    let lastStrikeTick = stateRef.current.strikeTick;
    let strikeProgress = 0; // > 0 while lunging toward chest

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;

        const root = gltf.scene;
        // Normalize bounding box to fit cleanly in the 3D stage
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 1.85 / maxDim;
        root.scale.setScalar(scale);
        root.position.set(
          -center.x * scale,
          -center.y * scale - 0.05,
          -center.z * scale
        );

        pivot.add(root);
        loadedModel = root;
        setIsLoaded(true);
      },
      (progress) => {
        if (disposed || !progress.total) return;
        setLoadProgress(Math.min(100, Math.round((progress.loaded / progress.total) * 100)));
      },
      () => {
        if (disposed) return;
        setHasError(true);
      }
    );

    const clock = new THREE.Clock();

    const animate = () => {
      if (disposed) return;
      rafId = window.requestAnimationFrame(animate);

      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const {
        stage: curStage,
        shaking: curShaking,
        isOpen: curOpen,
        isEmpty: curEmpty,
        strikeTick: curStrikeTick,
      } = stateRef.current;

      // Trigger lunge-and-strike toward the chest whenever strikeTick increments
      if (curStrikeTick !== lastStrikeTick) {
        lastStrikeTick = curStrikeTick;
        strikeProgress = 1;
      }
      if (strikeProgress > 0) {
        strikeProgress = Math.max(0, strikeProgress - dt * 3.4);
      }
      const strikeWave = Math.sin(strikeProgress * Math.PI);

      // Trigger celebratory 360 spin once when chest opens with reward
      if (curOpen && !curEmpty && !wasOpen) {
        celebrateSpin = Math.PI * 2;
      }
      wasOpen = curOpen;

      if (celebrateSpin > 0.01) {
        const step = celebrateSpin * Math.min(1, dt * 6.5);
        celebrateSpin -= step;
      } else {
        celebrateSpin = 0;
      }

      // Smooth yaw interpolation
      const drag = dragRef.current;
      drag.currentYaw += (drag.targetYaw - drag.currentYaw) * Math.min(1, dt * 8);

      // Dynamic choreography offsets
      let targetY = Math.sin(elapsed * 2.1) * 0.045;
      let targetPitch = 0;
      let targetRoll = 0;

      if (curShaking) {
        // Channeling energy into chest
        targetY += Math.sin(elapsed * 38) * 0.03;
        targetPitch = 0.14;
        targetRoll = Math.sin(elapsed * 42) * 0.06;
        rimGold.intensity = 6.5;
      } else if (curOpen && !curEmpty) {
        // Victory hover & golden aura
        targetY += 0.08 + Math.sin(elapsed * 3.4) * 0.05;
        targetPitch = -0.05;
        rimGold.intensity = 7.2;
        rimEmerald.intensity = 4.2;
      } else if (curOpen && curEmpty) {
        // Defeat slump
        targetY -= 0.08;
        targetPitch = 0.16;
        rimGold.intensity = 1.0;
        rimEmerald.intensity = 1.2;
      } else if (curStage > 0) {
        // Leaning closer to inspect cracking chest
        targetY += 0.03;
        targetPitch = 0.06 + curStage * 0.025;
        rimGold.intensity = 3.2 + curStage * 1.1;
      } else {
        rimGold.intensity = 3.2;
        rimEmerald.intensity = 3.5;
      }

      if (loadedModel) {
        const targetX = strikeWave * 0.42;
        pivot.position.x += (targetX - pivot.position.x) * Math.min(1, dt * 16);
        pivot.position.y += (targetY + strikeWave * 0.08 - pivot.position.y) * Math.min(1, dt * 12);
        pivot.rotation.x += (targetPitch + strikeWave * 0.22 - pivot.rotation.x) * Math.min(1, dt * 14);
        pivot.rotation.z += (targetRoll - strikeWave * 0.18 - pivot.rotation.z) * Math.min(1, dt * 14);
        pivot.rotation.y = drag.currentYaw + celebrateSpin + strikeWave * 0.45;
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 240;
      const h = container.clientHeight || 270;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      if (rafId) window.cancelAnimationFrame(rafId);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((mat) => {
            if (!mat) return;
            mat.dispose();
          });
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current.active = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.moved = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    dragRef.current.lastX = e.clientX;
    if (
      Math.abs(e.clientX - dragRef.current.startX) > 6 ||
      Math.abs(e.clientY - dragRef.current.startY) > 6
    ) {
      dragRef.current.moved = true;
    }
    dragRef.current.targetYaw += dx * 0.012;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasClick = dragRef.current.active && !dragRef.current.moved;
    dragRef.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (wasClick) {
      onCharacterClick?.();
    }
  };

  return (
    <div className={styles.characterStage}>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Kéo để xoay nhân vật 3D"
        className={styles.characterCanvasHost}
      />
      {!isLoaded && !hasError ? (
        <div className={styles.characterLoader}>
          Đang tải model 3D… {loadProgress > 0 ? `${loadProgress}%` : ''}
        </div>
      ) : null}
      {hasError ? (
        <div className={styles.characterLoader}>Không thể tải model 3D</div>
      ) : null}
      <span className={styles.characterCaption}>Bấm để ra đòn · Kéo xoay 360°</span>
    </div>
  );
}

export default Character3DStage;
