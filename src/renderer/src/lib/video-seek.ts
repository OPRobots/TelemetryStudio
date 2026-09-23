/**
 * Espera a que el vídeo termine de hacer `seek` a `time` (segundos).
 * Resuelve por `seeked` o, como mucho, tras `timeoutMs`.
 */
export function seekVideo(
  video: HTMLVideoElement,
  time: number,
  timeoutMs = 1500
): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    video.addEventListener('seeked', finish);
    try {
      if (Math.abs(video.currentTime - time) < 1e-4) {
        finish();
        return;
      }
      video.currentTime = time;
    } catch {
      finish();
    }
  });
}
