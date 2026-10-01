import { invoke } from '@tauri-apps/api/core';

/**
 * 注销某个播放器实例在本地 FLV 代理上登记的流地址。
 * 代理服务本身由所有播放器共享、不会被停止；对应的旧连接会随注销自动断开。
 */
export async function stopStreamProxy(proxyKey?: string): Promise<void> {
  try {
    await invoke('stop_proxy', { key: proxyKey ?? null });
  } catch (e) {
    console.error('[StreamProxy] Error unregistering proxy stream:', e);
  }
}
