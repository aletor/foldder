"use client";

import { useEffect, useId, useRef } from "react";
import gsap from "gsap";
import wavePaths from "./brain-color-wave-paths.json";
import { HOME_V2_NODE_WAVE_COLORS } from "./home-v2-nodes";

const SVG_NS = "http://www.w3.org/2000/svg";

export function BrainColorWaveBackground() {
  const reactId = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const defsRef = useRef<SVGDefsElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const defs = defsRef.current;
    if (!svg || !defs) return;

    const paths = Array.from(svg.querySelectorAll<SVGPathElement>("[data-home-v2-brain-wave-path]"));
    const clones: SVGPathElement[] = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    paths.forEach((path, index) => {
      const clone = path.cloneNode(true) as SVGPathElement;
      clone.removeAttribute("data-home-v2-brain-wave-path");
      clone.removeAttribute("mask");
      clone.setAttribute("stroke-dasharray", "");

      const mask = document.createElementNS(SVG_NS, "mask");
      mask.setAttribute("id", `brain-wave-mask-${reactId}-${index}`);
      mask.appendChild(clone);
      defs.appendChild(mask);
      clones.push(clone);

      path.setAttribute("mask", `url(#brain-wave-mask-${reactId}-${index})`);

      const length = clone.getTotalLength();
      if (reducedMotion) return;

      gsap.set(clone, { strokeDasharray: length, strokeDashoffset: length });
      gsap.to(clone, {
        duration: 10,
        delay: index * 0.1,
        repeat: -1,
        strokeDashoffset: length * 3,
        ease: "power1.inOut",
      });
      gsap.to(path, {
        duration: 10,
        repeat: -1,
        strokeDashoffset: length * 0.4,
        ease: "none",
      });
    });

    gsap.set(svg, { opacity: 1 });

    return () => {
      gsap.killTweensOf([...paths, ...clones, svg]);
      clones.forEach((clone) => clone.remove());
      defs.querySelectorAll("mask").forEach((mask) => mask.remove());
    };
  }, [reactId]);

  return (
    <div ref={wrapRef} data-home-v2-brain-wave-wrap aria-hidden>
      <svg
        ref={svgRef}
        data-home-v2-brain-wave
        viewBox="0 0 921.5 600"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs ref={defsRef} />
        {wavePaths.map((path, index) => (
          <path
            key={index}
            data-home-v2-brain-wave-path
            d={path.d}
            fill="none"
            stroke={HOME_V2_NODE_WAVE_COLORS[index % HOME_V2_NODE_WAVE_COLORS.length]}
            strokeWidth={2}
            strokeDasharray={path.dasharray}
          />
        ))}
      </svg>
    </div>
  );
}
