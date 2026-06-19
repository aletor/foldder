"use client";

import Image from "next/image";
import { Maximize2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { NodeIcon } from "@/app/spaces/foldder-icons";
import { FOLDDER_NODE_STUDIO_BACKGROUND_SRC } from "@/app/spaces/studio-node/foldder-studio-node-backgrounds";

const PROMPT_TEXT = "woman jumping in water";
const OUTPUT_IMAGE = "/assets/home/flows-nano-banana-output.png";
const OUTPUT_WIDTH = 1024;
const OUTPUT_HEIGHT = 571;
const NANO_TILE_BG =
  FOLDDER_NODE_STUDIO_BACKGROUND_SRC.nanoBanana ?? "/assets/nodes/nano-banana-empty-pink.png";
const CONNECTED_NODE_GAP_PX = 80;

function DemoHandle({
  dataType,
  connected = false,
  side,
  handleRef,
  stackIndex = 0,
}: {
  dataType: "prompt" | "brain" | "image";
  connected?: boolean;
  side: "left" | "right";
  handleRef?: React.RefObject<HTMLDivElement | null>;
  stackIndex?: number;
}) {
  const iconKey = dataType === "prompt" ? "prompt" : dataType === "brain" ? "brain" : "asset";

  return (
    <div
      ref={handleRef}
      className={`flows-demo-handle-wrap flows-demo-handle-wrap--${side}${connected ? " flows-demo-handle-wrap--connected" : ""}`}
      style={{ zIndex: 40 + stackIndex }}
      data-connected={connected ? "true" : "false"}
    >
      <div
        className={`flows-demo-handle flows-demo-handle--${dataType}${connected ? " flows-demo-handle--connected" : ""}`}
      >
        <NodeIcon type="promptInput" iconKey={iconKey} size={9} done={connected} />
      </div>
    </div>
  );
}

function DemoNodeLabel({
  children,
  variant = "glass",
}: {
  children: string;
  variant?: "glass" | "media-studio";
}) {
  return (
    <div className={`flows-demo-node-label flows-demo-node-label--${variant}`}>
      <span className="flows-demo-node-label-dot" aria-hidden />
      {children}
    </div>
  );
}

function buildEdgePath(x1: number, y1: number, x2: number, y2: number) {
  const midX = x1 + (x2 - x1) * 0.5;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}

export function FlowsCanvasDemo() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const promptNodeRef = useRef<HTMLElement>(null);
  const nanoNodeRef = useRef<HTMLElement>(null);
  const promptHandleRef = useRef<HTMLDivElement>(null);
  const nanoHandleRef = useRef<HTMLDivElement>(null);
  const [edgePath, setEdgePath] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 400 });
  const [layoutTick, setLayoutTick] = useState(0);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const promptNode = promptNodeRef.current;
    const promptHandle = promptHandleRef.current;
    const nanoHandle = nanoHandleRef.current;
    const nanoNode = nanoNodeRef.current;
    if (!canvas || !promptNode || !nanoNode || !promptHandle || !nanoHandle) return;

    const updateLayout = () => {
      const canvasRect = canvas.getBoundingClientRect();
      setCanvasSize({ width: canvasRect.width, height: canvasRect.height });

      const promptRect = promptHandle.getBoundingClientRect();
      const nanoRect = nanoHandle.getBoundingClientRect();

      const x1 = promptRect.left + promptRect.width / 2 - canvasRect.left;
      const y1 = promptRect.top + promptRect.height / 2 - canvasRect.top;
      const x2 = nanoRect.left + nanoRect.width / 2 - canvasRect.left;
      const y2 = nanoRect.top + nanoRect.height / 2 - canvasRect.top;

      setEdgePath(buildEdgePath(x1, y1, x2, y2));
    };

    updateLayout();
    requestAnimationFrame(updateLayout);

    const observer = new ResizeObserver(updateLayout);
    observer.observe(canvas);
    observer.observe(promptNode);
    observer.observe(nanoNode);
    observer.observe(promptHandle);
    observer.observe(nanoHandle);

    window.addEventListener("resize", updateLayout);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [layoutTick]);

  return (
    <div data-home-v2-flows-demo className="flows-demo" aria-hidden>
      <div ref={canvasRef} className="flows-demo-canvas">
        <div className="flows-demo-grid" />

        <svg
          className="flows-demo-edge"
          viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {edgePath ? <path className="flows-demo-edge-path" d={edgePath} /> : null}
        </svg>

        <div
          className="flows-demo-nodes-track"
          style={{ gap: CONNECTED_NODE_GAP_PX }}
        >
          <article ref={promptNodeRef} className="flows-demo-node flows-demo-node--prompt">
            <div className="flows-demo-card flows-demo-card--prompt">
              <DemoNodeLabel variant="glass">PROMPT 1</DemoNodeLabel>
              <p className="flows-demo-prompt-text">{PROMPT_TEXT}</p>
              <DemoHandle dataType="prompt" connected side="right" handleRef={promptHandleRef} stackIndex={3} />
            </div>
          </article>

          <article ref={nanoNodeRef} className="flows-demo-node flows-demo-node--nano">
            <div className="flows-demo-card flows-demo-card--nano">
              <span
                className="flows-demo-studio-mark"
                style={{ backgroundImage: `url(${NANO_TILE_BG})` }}
                aria-hidden
              />
              <DemoNodeLabel variant="media-studio">IMAGE CREATION 1</DemoNodeLabel>

              <DemoHandle dataType="brain" side="left" stackIndex={0} />
            <DemoHandle dataType="image" side="left" stackIndex={1} />
            <DemoHandle dataType="image" side="left" stackIndex={2} />
            <DemoHandle dataType="prompt" connected side="left" handleRef={nanoHandleRef} stackIndex={3} />
            <DemoHandle dataType="image" connected side="right" stackIndex={3} />

            <div className="flows-demo-media">
              <Image
                src={OUTPUT_IMAGE}
                alt=""
                width={OUTPUT_WIDTH}
                height={OUTPUT_HEIGHT}
                sizes="(max-width: 768px) 88vw, 420px"
                className="flows-demo-media-image"
                priority
                onLoad={() => setLayoutTick((tick) => tick + 1)}
              />
              <div className="flows-demo-frameless-footer">
                <button type="button" tabIndex={-1} className="flows-demo-execute">
                  Generar Imagen con prompt
                </button>
                <button type="button" tabIndex={-1} className="flows-demo-studio">
                  <Maximize2 size={10} aria-hidden />
                  Open Studio
                </button>
              </div>
            </div>
          </div>
          </article>
        </div>
      </div>
    </div>
  );
}
