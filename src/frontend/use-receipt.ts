import { ref, watch, type WatchSource } from 'vue';

/** Only hide the transient presentation. The saved action and its journal entry stay intact. */
export function useReceipt(message: WatchSource<string>, timeout = 6000) {
  const visible = ref(false);
  function dismiss() { visible.value = false; }
  watch(message, (text, _previous, onCleanup) => {
    visible.value = Boolean(text);
    if (!text || !timeout) return;
    const timer = setTimeout(dismiss, timeout);
    onCleanup(() => clearTimeout(timer));
  }, { immediate: true, flush: 'sync' });
  return { visible, dismiss };
}
