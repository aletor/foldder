/**
 * Fullscreen API con prefijos (Safari webkit, Firefox moz, IE/Edge legacy ms).
 * iOS Safari suele no permitir fullscreen de documento; se intenta y se ignora el fallo.
 */

export function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  );
}

export function isDocumentFullscreen(): boolean {
  return getFullscreenElement() !== null;
}

function hasFullscreenUserActivation(): boolean {
  const activation = navigator.userActivation;
  if (!activation) return true;
  return activation.isActive;
}

export async function enterFullscreen(el: HTMLElement = document.documentElement): Promise<void> {
  if (!hasFullscreenUserActivation()) {
    throw new Error('Fullscreen requires a user gesture');
  }

  const node = el as HTMLElement & {
    webkitRequestFullscreen?: () => void;
    mozRequestFullScreen?: () => void;
    msRequestFullscreen?: () => void;
  };
  if (typeof node.requestFullscreen === 'function') {
    await node.requestFullscreen();
  } else if (typeof node.webkitRequestFullscreen === 'function') {
    node.webkitRequestFullscreen();
  } else if (typeof node.mozRequestFullScreen === 'function') {
    node.mozRequestFullScreen();
  } else if (typeof node.msRequestFullscreen === 'function') {
    node.msRequestFullscreen();
  } else {
    throw new Error('Fullscreen API not supported');
  }
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => void;
    mozCancelFullScreen?: () => void;
    msExitFullscreen?: () => void;
  };
  if (typeof document.exitFullscreen === 'function') {
    await document.exitFullscreen();
  } else if (typeof doc.webkitExitFullscreen === 'function') {
    doc.webkitExitFullscreen();
  } else if (typeof doc.mozCancelFullScreen === 'function') {
    doc.mozCancelFullScreen();
  } else if (typeof doc.msExitFullscreen === 'function') {
    doc.msExitFullscreen();
  }
}

export async function toggleDocumentFullscreen(): Promise<void> {
  if (getFullscreenElement()) {
    await exitFullscreen();
  } else {
    await enterFullscreen(document.documentElement);
  }
}

/** Registrar todos los eventos que disparan los distintos motores al entrar/salir. */
export function subscribeFullscreenChange(cb: () => void): () => void {
  const events = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'MSFullscreenChange',
  ] as const;
  for (const ev of events) {
    document.addEventListener(ev, cb);
  }
  return () => {
    for (const ev of events) {
      document.removeEventListener(ev, cb);
    }
  };
}

/**
 * Chrome/Safari suelen salir de document fullscreen al abrir el diálogo nativo de archivos.
 * Si el usuario estaba a pantalla completa justo antes, intentamos restaurarla al elegir archivo
 * (`change`) o al cerrar el diálogo sin elegir (`window` `focus`).
 * Puede fallar si el motor exige un gesto de usuario para volver a entrar; en ese caso el usuario
 * puede pulsar de nuevo el botón de pantalla completa.
 */
export function installPreserveDocumentFullscreenOnFilePicker(): () => void {
  let pendingRestoreAfterPicker = false;
  let pendingClearTimer: ReturnType<typeof setTimeout> | undefined;

  const clearArmTimer = () => {
    if (pendingClearTimer === undefined) return;
    clearTimeout(pendingClearTimer);
    pendingClearTimer = undefined;
  };

  const armIfFullscreenAndFileInput = (e: Event) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'file') return;
    clearArmTimer();
    if (isDocumentFullscreen()) {
      pendingRestoreAfterPicker = true;
      pendingClearTimer = setTimeout(() => {
        pendingClearTimer = undefined;
        pendingRestoreAfterPicker = false;
      }, 90_000);
    } else {
      pendingRestoreAfterPicker = false;
    }
  };

  const tryRestore = () => {
    if (!pendingRestoreAfterPicker) return;
    if (isDocumentFullscreen()) {
      pendingRestoreAfterPicker = false;
      clearArmTimer();
      return;
    }
    pendingRestoreAfterPicker = false;
    clearArmTimer();
    if (!hasFullscreenUserActivation()) return;
    void enterFullscreen(document.documentElement).catch(() => undefined);
  };

  /** `change` al elegir archivo; a veces basta para re-entrada con activación de usuario. */
  const onFileInputChangeCapture = (e: Event) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'file') return;
    tryRestore();
  };

  /**
   * Si el usuario cancela el diálogo, no hay `change`; al volver el foco a la ventana intentamos restaurar.
   * `document.hasFocus()` reduce falsos positivos mientras el picker sigue abierto (p. ej. alt-tab).
   */
  const onWindowFocus = () => {
    if (!pendingRestoreAfterPicker) return;
    requestAnimationFrame(() => {
      if (!pendingRestoreAfterPicker) return;
      if (typeof document !== 'undefined' && !document.hasFocus()) return;
      tryRestore();
    });
  };

  document.addEventListener('pointerdown', armIfFullscreenAndFileInput, true);
  document.addEventListener('mousedown', armIfFullscreenAndFileInput, true);
  document.addEventListener('change', onFileInputChangeCapture, true);
  window.addEventListener('focus', onWindowFocus);

  return () => {
    clearArmTimer();
    document.removeEventListener('pointerdown', armIfFullscreenAndFileInput, true);
    document.removeEventListener('mousedown', armIfFullscreenAndFileInput, true);
    document.removeEventListener('change', onFileInputChangeCapture, true);
    window.removeEventListener('focus', onWindowFocus);
  };
}
