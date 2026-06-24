import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/app/spaces/BeebleVfxStudio.tsx",
      "src/app/spaces/CanvasWallpaperTransition.tsx",
      "src/app/spaces/FreehandStudio.tsx",
      "src/app/spaces/SpacesContent.tsx",
      "src/app/spaces/VfxGeneratorNode.tsx",
      "src/app/spaces/foldder-node-ui.tsx",
      "src/app/spaces/designer/DesignerNode.tsx",
      "src/app/spaces/designer/DesignerStudio.tsx",
      "src/app/spaces/designer/useDesignerImagePipeline.ts",
      "src/app/spaces/freehand/ImageFrameFittingGlyph.tsx",
      "src/app/spaces/freehand/LayerStylesModal.tsx",
      "src/app/spaces/freehand/extract-document-colors.ts",
      "src/app/spaces/freehand/svg-import.ts",
      "src/app/spaces/hooks/use-foldder-canvas-intro.ts",
      "src/app/spaces/hooks/use-spaces-browser-fullscreen.ts",
      "src/app/spaces/hooks/use-spaces-canvas-background.ts",
      "src/app/spaces/image-creation-advanced/ImageCreationAdvancedNode.tsx",
      "src/app/spaces/indesign/text-layout.ts",
      "src/app/spaces/nano-banana/NanoBananaNode.tsx",
      "src/app/spaces/presenter/DesignerPageCanvasView.tsx",
      "src/app/spaces/presenter/PresenterImageVideoOverlays.tsx",
      "src/app/spaces/presenter/PresenterNode.tsx",
      "src/app/spaces/presenter/PresenterSlideStage.tsx",
      "src/app/spaces/presenter/PresenterStudio.tsx",
      "src/lib/advanced-image/domain.ts",
      "src/lib/presenter-share-types.ts",
    ],
    rules: {
      // Baseline legacy: estos módulos concentran deuda histórica de tipos,
      // callbacks y React Compiler. El resto del código conserva las reglas
      // estrictas del preset de Next para que la deuda nueva sí vuelva a fallar.
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "jsx-a11y/alt-text": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
