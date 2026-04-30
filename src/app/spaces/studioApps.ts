import type { ProjectFileKind } from "./project-files";

export type StudioAppId =
  | "brain"
  | "files"
  | "designer"
  | "photoRoom"
  | "painter"
  | "nanoBanana"
  | "geminiVideo"
  | "vfxGenerator"
  | "presenter";

export type StudioAppConfig = {
  appId: StudioAppId;
  label: string;
  nodeType?: string;
  fileKind: ProjectFileKind;
  extension?: string;
  showInDock: boolean;
  canCreateFile: boolean;
  canOpenFile: boolean;
  requiresSourceFile?: boolean;
  sourceFileKinds?: ProjectFileKind[];
};

export const STUDIO_APPS: StudioAppConfig[] = [
  {
    appId: "brain",
    label: "Brain",
    nodeType: "projectBrain",
    fileKind: "brain",
    showInDock: true,
    canCreateFile: false,
    canOpenFile: true,
  },
  {
    appId: "files",
    label: "Foldder",
    nodeType: "projectAssets",
    fileKind: "assets",
    showInDock: true,
    canCreateFile: false,
    canOpenFile: true,
  },
  {
    appId: "designer",
    label: "Designer",
    nodeType: "designer",
    fileKind: "designer",
    extension: ".design",
    showInDock: true,
    canCreateFile: true,
    canOpenFile: true,
  },
  {
    appId: "photoRoom",
    label: "PhotoRoom",
    nodeType: "photoRoom",
    fileKind: "photoroom",
    extension: ".photoroom",
    showInDock: true,
    canCreateFile: true,
    canOpenFile: true,
  },
  {
    appId: "painter",
    label: "Freehand",
    nodeType: "painter",
    fileKind: "painter",
    extension: ".painter",
    showInDock: false,
    canCreateFile: true,
    canOpenFile: true,
  },
  {
    appId: "nanoBanana",
    label: "Imagen IA",
    nodeType: "nanoBanana",
    fileKind: "image",
    extension: ".image",
    showInDock: true,
    canCreateFile: true,
    canOpenFile: true,
  },
  {
    appId: "geminiVideo",
    label: "Video",
    nodeType: "geminiVideo",
    fileKind: "video",
    extension: ".video",
    showInDock: true,
    canCreateFile: true,
    canOpenFile: true,
  },
  {
    appId: "vfxGenerator",
    label: "VFX",
    nodeType: "vfxGenerator",
    fileKind: "vfx",
    extension: ".vfx",
    showInDock: false,
    canCreateFile: true,
    canOpenFile: true,
  },
  {
    appId: "presenter",
    label: "Presentar",
    nodeType: "presenter",
    fileKind: "presenter",
    extension: ".presenter",
    showInDock: true,
    canCreateFile: false,
    canOpenFile: true,
    requiresSourceFile: true,
    sourceFileKinds: ["designer"],
  },
];

export const DOCK_STUDIO_APPS = STUDIO_APPS.filter((app) => app.showInDock);

export function studioAppForId(appId: string): StudioAppConfig | undefined {
  return STUDIO_APPS.find((app) => app.appId === appId);
}

export function studioAppForFileKind(kind: ProjectFileKind): StudioAppConfig | undefined {
  return STUDIO_APPS.find((app) => app.fileKind === kind);
}

export function studioAppForNodeType(nodeType: string | undefined): StudioAppConfig | undefined {
  return nodeType ? STUDIO_APPS.find((app) => app.nodeType === nodeType) : undefined;
}
