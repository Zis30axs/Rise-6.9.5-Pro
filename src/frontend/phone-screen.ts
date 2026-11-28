type PhoneWindow = Window & { stTtsPhone?: { open: unknown } };
const failedScreens = new WeakMap<HTMLIFrameElement, { document: Document | null; reloading: boolean }>();

/** The embedded host can mount its dialog before the phone in its srcdoc starts. */
export function waitForPhoneScreen(frame: HTMLIFrameElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const previous = failedScreens.get(frame);
    const timer = setTimeout(() => {
      if (!inspect()) fail(new Error('手机桌面加载超时，请重试。'));
    }, 20_000);

    function cleanup() {
      clearTimeout(timer);
      frame.removeEventListener('load', inspect);
      signal.removeEventListener('abort', cancel);
    }
    function cancel() {
      cleanup();
      reject(signal.reason ?? new DOMException('手机窗口已关闭。', 'AbortError'));
    }
    function fail(error: unknown) {
      failedScreens.set(frame, { document: frame.contentDocument, reloading: false });
      cleanup();
      reject(error);
    }
    function inspect(): boolean {
      const doc = frame.contentDocument;
      if (doc && typeof (frame.contentWindow as PhoneWindow | null)?.stTtsPhone?.open === 'function') {
        failedScreens.delete(frame);
        cleanup();
        resolve();
        return true;
      }
      if (previous && doc === previous.document) {
        // Reopening a dialog reuses its iframe. Navigate once, then ignore the
        // old document until the fresh srcdoc actually replaces it.
        if (!previous.reloading) {
          previous.reloading = true;
          try { frame.srcdoc = frame.srcdoc; }
          catch (error) { fail(error); return true; }
        }
        return false;
      }
      if (!doc || doc.URL === 'about:blank' || doc.readyState !== 'complete') return false;
      const detail = doc.querySelector('#root .startup[role="alert"]')?.textContent?.trim();
      fail(new Error(detail?.slice(0, 600) || '手机桌面未能启动，请重试。'));
      return true;
    }

    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    frame.addEventListener('load', inspect);
    inspect();
  });
}
