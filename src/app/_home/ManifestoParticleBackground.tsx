"use client";

import { useEffect, useRef } from "react";
import { FOLDDER_NODE_CARD_BG } from "@/app/spaces/node-card-palette";
import { readHomeV2DeviceProfile } from "./home-v2-device";

const MAX_PARTICLES_DESKTOP = 70;
const MAX_PARTICLES_TOUCH = 28;
const PARTICLE_COLORS = [...new Set(Object.values(FOLDDER_NODE_CARD_BG))];

type ParticleType = "bubble" | "line";

function randomFromArray<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function hexToRgba(hex: string, alpha: number): string {
  const trimmed = hex.replace("#", "");
  const red = parseInt(trimmed.substring(0, 2), 16);
  const green = parseInt(trimmed.substring(2, 4), 16);
  const blue = parseInt(trimmed.substring(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

class Particle {
  type: ParticleType;
  coords = { x: 0, y: 0 };
  velocity = { x: 0, y: 0 };
  alpha = 0.1;
  hex: string;
  color: string;
  strokeWidth: number;
  diameter = 0;
  angle = 0;
  length = 0;
  rotateSpeed = 0;
  rotateClockwise = true;
  private bounds = { w: 0, h: 0 };

  constructor(width: number, height: number) {
    this.type = this.randomizeType();
    this.coords = {
      x: Math.round(Math.random() * width),
      y: Math.round(Math.random() * height),
    };
    this.velocity = {
      x: (Math.random() < 0.5 ? -1 : 1) * (Math.random() * 0.7),
      y: (Math.random() < 0.5 ? -1 : 1) * (Math.random() * 0.7),
    };
    this.hex = randomFromArray(PARTICLE_COLORS);
    this.color = hexToRgba(this.hex, this.alpha);
    this.strokeWidth = Math.random() * (Math.random() > 0.5 ? 1.5 : 2.5);

    if (this.type === "bubble") {
      let diameter = 0;
      while (diameter < 2) {
        diameter = Math.random() * 7 * 2;
      }
      this.diameter = diameter;
    } else {
      this.angle = Math.atan2(this.coords.y, this.coords.x);
      this.length = randomFromArray([5, 7, 3, 10]);
      this.rotateSpeed = randomFromArray([10, 30, 60, 120]);
      this.rotateClockwise = Math.random() < 0.5;
    }
  }

  randomizeType(): ParticleType {
    const types: ParticleType[] = ["bubble", "bubble", "bubble", "bubble", "line"];
    return randomFromArray(types);
  }

  update(): boolean {
    if (this.alpha < 1) {
      this.alpha += 0.01;
      this.color = hexToRgba(this.hex, this.alpha);
    }

    this.coords.x += this.velocity.x;
    this.coords.y += this.velocity.y;

    if (this.type === "line") {
      const step = Math.PI / this.rotateSpeed;
      this.angle += this.rotateClockwise ? -Math.abs(step) : Math.abs(step);
    }

    return this.withinBounds();
  }

  draw(context: CanvasRenderingContext2D) {
    context.lineWidth = this.strokeWidth;
    context.strokeStyle = this.color;
    context.save();

    if (this.type === "line") {
      context.translate(this.coords.x, this.coords.y);
      context.rotate(this.angle);
      context.beginPath();
      context.moveTo(-this.length / 2, 0);
      context.lineTo(this.length / 2, 0);
    } else {
      context.beginPath();
      context.arc(this.coords.x, this.coords.y, this.diameter, 0, Math.PI * 2, false);
    }

    context.stroke();
    context.restore();
  }

  withinBounds(): boolean {
    const { w, h } = this.bounds;
    return !(this.coords.x > w + 5 || this.coords.x < -5 || this.coords.y > h + 5 || this.coords.y < -5);
  }

  setBounds(width: number, height: number) {
    this.bounds = { w: width, h: height };
  }
}

export function ManifestoParticleBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) return;

    const { perfMode } = readHomeV2DeviceProfile();
    const maxParticles = perfMode ? MAX_PARTICLES_TOUCH : MAX_PARTICLES_DESKTOP;

    const context = canvas.getContext("2d");
    if (!context) return;

    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;

    const resize = () => {
      dpr = perfMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles.forEach((particle) => particle.setBounds(width, height));
    };

    const generate = () => {
      while (particles.length < maxParticles) {
        const particle = new Particle(width, height);
        particle.setBounds(width, height);
        particles.push(particle);
      }
    };

    const tick = () => {
      if (!visible) {
        raf = requestAnimationFrame(tick);
        return;
      }

      if (particles.length < maxParticles - 5) {
        generate();
      }

      particles = particles.filter((particle) => particle.update());
      context.clearRect(0, 0, width, height);
      particles.forEach((particle) => particle.draw(context));
      raf = requestAnimationFrame(tick);
    };

    resize();
    generate();
    tick();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
      },
      { threshold: 0.08 },
    );
    visibilityObserver.observe(container);

    const stopOnReduce = (event: MediaQueryListEvent) => {
      if (event.matches) {
        cancelAnimationFrame(raf);
        context.clearRect(0, 0, width, height);
        particles = [];
      }
    };
    motionQuery.addEventListener("change", stopOnReduce);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      visibilityObserver.disconnect();
      motionQuery.removeEventListener("change", stopOnReduce);
    };
  }, []);

  return (
    <div ref={containerRef} data-home-v2-manifesto-bg aria-hidden>
      <canvas ref={canvasRef} data-home-v2-manifesto-canvas />
    </div>
  );
}
