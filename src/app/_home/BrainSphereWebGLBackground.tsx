"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const LINE_COUNT = 50;
const DOT_COUNT = 50;
const BASE_RADIUS = 100;

const COLOR_MUTED = 0x52525f;
const COLOR_ACCENT = 0x8b7ae8;

type LineUserData = {
  speed: number;
  radius: number;
};

function createWaveLine(materials: THREE.LineBasicMaterial[]): THREE.Line {
  const radius = Math.floor(BASE_RADIUS + (Math.random() - 0.5) * (BASE_RADIUS * 0.2));
  const positions = new Float32Array(DOT_COUNT * 3);

  for (let j = 0; j < DOT_COUNT; j++) {
    const x = (j / DOT_COUNT) * radius * 2 - radius;
    positions[j * 3] = x;
    positions[j * 3 + 1] = 0;
    positions[j * 3 + 2] = 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = materials[Math.random() > 0.2 ? 0 : 1];
  const line = new THREE.Line(geometry, material);
  line.userData = {
    speed: Math.random() * 300 + 250,
    radius,
  } satisfies LineUserData;
  line.rotation.x = Math.random() * Math.PI;
  line.rotation.y = Math.random() * Math.PI;
  line.rotation.z = Math.random() * Math.PI;

  return line;
}

function updateDots(sphere: THREE.Group, time: number) {
  for (let i = 0; i < LINE_COUNT; i++) {
    const line = sphere.children[i] as THREE.Line;
    const { speed, radius } = line.userData as LineUserData;
    const positions = line.geometry.attributes.position.array as Float32Array;

    for (let j = 0; j < DOT_COUNT; j++) {
      const x = positions[j * 3];
      const ratio = 1 - (radius - Math.abs(x)) / radius;
      positions[j * 3 + 1] = Math.sin(time / speed + j * 0.15) * 12 * ratio;
    }

    line.geometry.attributes.position.needsUpdate = true;
  }
}

export function BrainSphereWebGLBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = wrap.clientWidth;
    let height = wrap.clientHeight;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 280);

    const sphere = new THREE.Group();
    scene.add(sphere);

    const matMuted = new THREE.LineBasicMaterial({ color: COLOR_MUTED, transparent: true, opacity: 0.62 });
    const matAccent = new THREE.LineBasicMaterial({ color: COLOR_ACCENT, transparent: true, opacity: 0.82 });
    const materials = [matMuted, matAccent];

    for (let i = 0; i < LINE_COUNT; i++) {
      sphere.add(createWaveLine(materials));
    }

    let frameId = 0;
    let running = true;
    let time = 0;

    const render = (now: number) => {
      if (!running) return;
      frameId = requestAnimationFrame(render);

      if (!reducedMotion) {
        time = now;
        updateDots(sphere, time);
        sphere.rotation.y = time * 0.0001;
        sphere.rotation.x = -time * 0.0001;
      }

      renderer.render(scene, camera);
    };

    frameId = requestAnimationFrame(render);

    const resize = () => {
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      if (width === 0 || height === 0) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(wrap);

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting;
        if (running) frameId = requestAnimationFrame(render);
      },
      { threshold: 0.05 },
    );
    visibilityObserver.observe(wrap);

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();

      sphere.children.forEach((child: THREE.Object3D) => {
        const line = child as THREE.Line;
        line.geometry.dispose();
      });
      matMuted.dispose();
      matAccent.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={wrapRef} data-home-v2-brain-webgl-wrap aria-hidden>
      <canvas ref={canvasRef} data-home-v2-brain-webgl />
    </div>
  );
}
