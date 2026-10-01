"use client";

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { AnimatePresence, m } from "framer-motion";

import styles from "./PlayerOverlayProvider.module.css";
import type { PlayerMeta } from "@/components/player/MainPlayer";

const PlayerPage = dynamic(() => import("@/screens/PlayerPage").then((m) => m.PlayerPage), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 18, color: "var(--secondary-text)", fontWeight: 700 }}>
      加载播放器...
    </div>
  )
});

type PlayerOverlayOpenPayload = { platform: string; roomId: string };

export type PlayerTab = {
  /** 播放器实例 key，同时用作后端代理流/弹幕监听的区分标识。 */
  key: string;
  platform: string;
  roomId: string;
  meta: PlayerMeta | null;
};

type PlayerOverlayContextValue = {
  isOpen: boolean;
  /** 当前标签页的平台与房间号（无标签时保留最后一次的值）。 */
  platform: string;
  roomId: string;
  tabs: PlayerTab[];
  activeKey: string | null;
  /** 普通打开：替换当前标签页的直播间（没有标签页时新建一个）。 */
  openPlayer: (payload: PlayerOverlayOpenPayload) => void;
  /** 多开：在新标签页打开，其它标签页继续播放。 */
  openPlayerInNewTab: (payload: PlayerOverlayOpenPayload) => void;
  /** 关闭当前标签页。 */
  closePlayer: () => void;
  closeTab: (key: string) => void;
  activateTab: (key: string) => void;
  /** 在鼠标位置弹出单个主播的右键菜单（打开 / 多开）；onPicked 在选择任一菜单项后调用。 */
  openStreamerMenu: (e: React.MouseEvent, payload: PlayerOverlayOpenPayload, onPicked?: () => void) => void;
};

const PlayerOverlayContext = React.createContext<PlayerOverlayContextValue | null>(null);

export function usePlayerOverlay() {
  const ctx = useContext(PlayerOverlayContext);
  if (!ctx) throw new Error("usePlayerOverlay must be used within PlayerOverlayProvider");
  return ctx;
}

const PLATFORM_LABELS: Record<string, string> = {
  douyu: "斗鱼",
  huya: "虎牙",
  douyin: "抖音",
  bilibili: "B站"
};

const TAB_BAR_HIDE_DELAY_MS = 260;

let tabKeySeq = 0;
function createTabKey() {
  tabKeySeq += 1;
  return `tab${tabKeySeq}-${Date.now().toString(36)}`;
}

function normalizePlatform(platform: string) {
  return String(platform || "douyu").toLowerCase();
}

function sameMeta(a: PlayerMeta | null, b: PlayerMeta) {
  return !!a && a.anchorName === b.anchorName && a.title === b.title && a.avatarUrl === b.avatarUrl && a.isLive === b.isLive;
}

function PlayerTabBar({
  tabs,
  activeKey,
  pinned,
  onActivate,
  onClose
}: {
  tabs: PlayerTab[];
  activeKey: string | null;
  pinned: boolean;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const reveal = useCallback(() => {
    cancelHide();
    setRevealed(true);
  }, [cancelHide]);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setRevealed(false);
    }, TAB_BAR_HIDE_DELAY_MS);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  useEffect(() => {
    if (pinned) setRevealed(false);
  }, [pinned]);

  const barClass = pinned
    ? styles.tabBar
    : `${styles.tabBar} ${styles.tabBarFloating} ${revealed ? styles.tabBarFloatingRevealed : ""}`;

  return (
    <>
      {!pinned ? (
        <div className={styles.tabHotzone} onMouseEnter={reveal} onMouseLeave={scheduleHide} aria-hidden="true" />
      ) : null}
      <div
        className={barClass}
        role="tablist"
        aria-label="直播间标签页"
        onMouseEnter={pinned ? undefined : reveal}
        onMouseLeave={pinned ? undefined : scheduleHide}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          const name = tab.meta?.anchorName || tab.roomId;
          const title = tab.meta?.title ? `${name} · ${tab.meta.title}` : name;
          const isOffline = tab.meta?.isLive === false;
          return (
            <div
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              title={title}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""} ${isOffline ? styles.tabOffline : ""}`}
              onClick={() => onActivate(tab.key)}
              onMouseDown={(e) => {
                // 中键关闭，和浏览器标签页一致
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(tab.key);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onActivate(tab.key);
                }
              }}
            >
              <span className={styles.tabAvatar} aria-hidden="true">
                {tab.meta?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tab.meta.avatarUrl} alt="" draggable={false} />
                ) : (
                  <span className={styles.tabAvatarFallback}>{name.charAt(0).toUpperCase()}</span>
                )}
              </span>
              <span className={styles.tabPlatform}>{PLATFORM_LABELS[tab.platform] ?? tab.platform}</span>
              <span className={styles.tabName}>{name}</span>
              <button
                type="button"
                className={styles.tabClose}
                title="关闭"
                aria-label={`关闭 ${name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.key);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
        <div className={styles.tabBarDragArea} data-tauri-drag-region />
      </div>
    </>
  );
}

export function PlayerOverlayHost() {
  const { isOpen, tabs, activeKey, closePlayer, closeTab, activateTab, updateTabMeta } = usePlayerOverlayInternal();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePlayer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePlayer, isOpen]);

  const pinned = tabs.length > 1;

  // NOTE:
  // - Avoid transforms while playing video (WebView2 may black-screen with transformed ancestors).
  // - Only apply the "drop" transform on exit, when the user is closing the player anyway.
  // - Background tabs stay mounted (and keep playing with sound); they are only hidden and made inert.
  return (
    <AnimatePresence>
      {isOpen ? (
        <m.div
          className={styles.overlayRoot}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <button type="button" className={styles.backdrop} aria-label="关闭播放器" onClick={closePlayer} />
          <m.div
            className={styles.overlayPanel}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: 110, rotate: 0.6, scale: 0.985 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <PlayerTabBar tabs={tabs} activeKey={activeKey} pinned={pinned} onActivate={activateTab} onClose={closeTab} />
            <div className={styles.playerStack}>
              {tabs.map((tab) => {
                const isActive = tab.key === activeKey;
                return (
                  <div
                    key={tab.key}
                    className={`${styles.playerSlot} ${isActive ? styles.playerSlotActive : styles.playerSlotHidden}`}
                    inert={!isActive}
                    aria-hidden={!isActive}
                  >
                    <PlayerPage
                      platform={tab.platform}
                      roomId={tab.roomId}
                      instanceKey={tab.key}
                      active={isActive}
                      onRequestClose={() => closeTab(tab.key)}
                      onMetaChange={(meta) => updateTabMeta(tab.key, meta)}
                    />
                  </div>
                );
              })}
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

function StreamerContextMenu({
  menu,
  isAlreadyOpen,
  onClose,
  onOpen,
  onOpenInNewTab
}: {
  menu: { x: number; y: number } | null;
  isAlreadyOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onOpenInNewTab: () => void;
}) {
  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {menu ? (
        <m.div
          className={styles.menuBackdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          onMouseDown={onClose}
          onWheel={onClose}
          onContextMenu={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <m.div
            className={styles.contextMenu}
            style={{ left: menu.x, top: menu.y }}
            role="menu"
            initial={{ opacity: 0, scale: 0.98, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button type="button" role="menuitem" className={styles.menuItem} onClick={onOpen}>
              {isAlreadyOpen ? "切换到该直播间" : "打开"}
            </button>
            <button type="button" role="menuitem" className={styles.menuItem} onClick={onOpenInNewTab}>
              多开（新标签页）
            </button>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

type PlayerOverlayInternalValue = PlayerOverlayContextValue & {
  updateTabMeta: (key: string, meta: PlayerMeta) => void;
};

function usePlayerOverlayInternal() {
  return usePlayerOverlay() as PlayerOverlayInternalValue;
}

const MENU_WIDTH = 176;
const MENU_HEIGHT = 96;

export function PlayerOverlayProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ tabs: PlayerTab[]; activeKey: string | null; lastPlatform: string; lastRoomId: string }>({
    tabs: [],
    activeKey: null,
    lastPlatform: "douyu",
    lastRoomId: ""
  });
  const [menu, setMenu] = useState<{ x: number; y: number; payload: PlayerOverlayOpenPayload; onPicked?: () => void } | null>(null);

  const openPlayer = useCallback((payload: PlayerOverlayOpenPayload) => {
    const platform = normalizePlatform(payload.platform);
    const roomId = String(payload.roomId || "");
    if (!roomId) return;
    setState((s) => {
      const existing = s.tabs.find((t) => t.platform === platform && t.roomId === roomId);
      if (existing) return { ...s, activeKey: existing.key, lastPlatform: platform, lastRoomId: roomId };
      // A new key remounts the player, so the replaced room's stream and danmaku are fully released.
      const tab: PlayerTab = { key: createTabKey(), platform, roomId, meta: null };
      const activeIndex = s.tabs.findIndex((t) => t.key === s.activeKey);
      const tabs = s.tabs.slice();
      if (activeIndex >= 0) tabs[activeIndex] = tab;
      else tabs.push(tab);
      return { tabs, activeKey: tab.key, lastPlatform: platform, lastRoomId: roomId };
    });
  }, []);

  const openPlayerInNewTab = useCallback((payload: PlayerOverlayOpenPayload) => {
    const platform = normalizePlatform(payload.platform);
    const roomId = String(payload.roomId || "");
    if (!roomId) return;
    setState((s) => {
      const existing = s.tabs.find((t) => t.platform === platform && t.roomId === roomId);
      if (existing) return { ...s, activeKey: existing.key, lastPlatform: platform, lastRoomId: roomId };
      const tab: PlayerTab = { key: createTabKey(), platform, roomId, meta: null };
      return { tabs: [...s.tabs, tab], activeKey: tab.key, lastPlatform: platform, lastRoomId: roomId };
    });
  }, []);

  const closeTab = useCallback((key: string) => {
    setState((s) => {
      const index = s.tabs.findIndex((t) => t.key === key);
      if (index < 0) return s;
      const tabs = s.tabs.filter((t) => t.key !== key);
      let activeKey = s.activeKey;
      if (activeKey === key) activeKey = (tabs[index] ?? tabs[index - 1])?.key ?? null;
      return { ...s, tabs, activeKey };
    });
  }, []);

  const closePlayer = useCallback(() => {
    setState((s) => {
      if (!s.activeKey) return s;
      const index = s.tabs.findIndex((t) => t.key === s.activeKey);
      if (index < 0) return s;
      const tabs = s.tabs.filter((t) => t.key !== s.activeKey);
      return { ...s, tabs, activeKey: (tabs[index] ?? tabs[index - 1])?.key ?? null };
    });
  }, []);

  const activateTab = useCallback((key: string) => {
    setState((s) => {
      const tab = s.tabs.find((t) => t.key === key);
      if (!tab || s.activeKey === key) return s;
      return { ...s, activeKey: key, lastPlatform: tab.platform, lastRoomId: tab.roomId };
    });
  }, []);

  const updateTabMeta = useCallback((key: string, meta: PlayerMeta) => {
    setState((s) => {
      const index = s.tabs.findIndex((t) => t.key === key);
      if (index < 0 || sameMeta(s.tabs[index].meta, meta)) return s;
      const tabs = s.tabs.slice();
      tabs[index] = { ...tabs[index], meta };
      return { ...s, tabs };
    });
  }, []);

  const openStreamerMenu = useCallback((e: React.MouseEvent, payload: PlayerOverlayOpenPayload, onPicked?: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    if (!payload.roomId) return;
    const x = Math.max(4, Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 4));
    const y = Math.max(4, Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 4));
    setMenu({ x, y, payload, onPicked });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const menuTargetOpen = useMemo(() => {
    if (!menu) return false;
    const platform = normalizePlatform(menu.payload.platform);
    return state.tabs.some((t) => t.platform === platform && t.roomId === menu.payload.roomId);
  }, [menu, state.tabs]);

  const activeTab = state.tabs.find((t) => t.key === state.activeKey) ?? null;

  const value = useMemo<PlayerOverlayInternalValue>(
    () => ({
      isOpen: state.tabs.length > 0,
      platform: activeTab?.platform ?? state.lastPlatform,
      roomId: activeTab?.roomId ?? state.lastRoomId,
      tabs: state.tabs,
      activeKey: state.activeKey,
      openPlayer,
      openPlayerInNewTab,
      closePlayer,
      closeTab,
      activateTab,
      openStreamerMenu,
      updateTabMeta
    }),
    [
      activateTab,
      activeTab,
      closePlayer,
      closeTab,
      openPlayer,
      openPlayerInNewTab,
      openStreamerMenu,
      state.activeKey,
      state.lastPlatform,
      state.lastRoomId,
      state.tabs,
      updateTabMeta
    ]
  );

  return (
    <PlayerOverlayContext.Provider value={value}>
      {children}
      <StreamerContextMenu
        menu={menu}
        isAlreadyOpen={menuTargetOpen}
        onClose={closeMenu}
        onOpen={() => {
          if (menu) openPlayer(menu.payload);
          menu?.onPicked?.();
          closeMenu();
        }}
        onOpenInNewTab={() => {
          if (menu) openPlayerInNewTab(menu.payload);
          menu?.onPicked?.();
          closeMenu();
        }}
      />
    </PlayerOverlayContext.Provider>
  );
}
