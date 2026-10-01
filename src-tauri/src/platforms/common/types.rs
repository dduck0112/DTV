use serde::{Deserialize, Serialize};

// Wrapper for payload like { args: { room_id_str: "..." } }
// Used by get_douyin_live_stream_url and start_douyin_danmaku_listener
#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct PayloadWrapperForRoomId {
    pub args: RoomIdDetail,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct RoomIdDetail {
    #[serde(alias = "roomIdStr")]
    pub room_id_str: String,
}

// New payload wrapper specifically for get_douyin_live_stream_url
#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct GetStreamUrlArgs {
    pub room_id_str: String,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct GetStreamUrlPayload {
    pub args: GetStreamUrlArgs,
}

// 描述一个可用的播放流变体（用于调试/导出所有地址）
#[derive(Serialize, Clone, Debug)]
pub struct StreamVariant {
    pub url: String,
    pub format: Option<String>,   // e.g. flv, ts, mp4
    pub desc: Option<String>,     // e.g. 原画/高清
    pub qn: Option<i32>,          // B 站的清晰度编号
    pub protocol: Option<String>, // e.g. http, https, ws/hls
}

// For the return type of get_douyin_live_stream_url
// Matches LiveStreamInfo interface in DouyinLive.vue
#[derive(Serialize, Clone, Debug)]
pub struct LiveStreamInfo {
    pub title: Option<String>,
    pub anchor_name: Option<String>,
    pub avatar: Option<String>,
    pub stream_url: Option<String>,
    pub status: Option<i32>,
    pub error_message: Option<String>,
    // 新增：上游真实地址（未经过本地代理）
    pub upstream_url: Option<String>,
    // 新增：所有可用的播放地址列表（调试/导出用）
    pub available_streams: Option<Vec<StreamVariant>>,
    // 新增：规范化后的房间ID（例如从 web_id 提取出的 room.id_str）
    pub normalized_room_id: Option<String>,
    // 新增：直播间的 web_rid（用于关注列表以 web_id 为主键）
    pub web_rid: Option<String>,
}

#[derive(Default, Clone)]
#[allow(dead_code)]
pub struct StreamUrlStore {
    pub url: std::sync::Arc<std::sync::Mutex<String>>,
}

// 弹幕监听的停止信号表：按播放器实例 key 区分，支持多个直播间同时监听。
pub type DanmakuStopSenders = std::sync::Mutex<
    std::collections::HashMap<String, tokio::sync::mpsc::Sender<()>>,
>;

// State for the Douyin Danmaku listener
#[derive(Default)]
#[allow(dead_code)]
pub struct DouyinDanmakuState(pub DanmakuStopSenders);

// State for the Bilibili Danmaku listener
#[derive(Default)]
#[allow(dead_code)]
pub struct BilibiliDanmakuState(pub DanmakuStopSenders);

// State for the Douyu Danmaku listener
#[derive(Default)]
#[allow(dead_code)]
pub struct DouyuDanmakuState(pub DanmakuStopSenders);

// State for the Huya Danmaku listener
#[derive(Default)]
#[allow(dead_code)]
pub struct HuyaDanmakuState(pub DanmakuStopSenders);

/// 前端未传 key 时（旧调用方式）使用的默认实例 key。
pub const DEFAULT_INSTANCE_KEY: &str = "default";

/// 规范化播放器实例 key：只保留 [A-Za-z0-9_-]，为空则回落到默认 key。
/// key 会拼进代理 URL 的 query，所以这里顺便保证它不需要转义。
pub fn normalize_instance_key(key: Option<String>) -> String {
    let cleaned: String = key
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(64)
        .collect();
    if cleaned.is_empty() {
        DEFAULT_INSTANCE_KEY.to_string()
    } else {
        cleaned
    }
}

/// 取出待停止的监听：key 为 Some 时只取该实例，None 时取出全部（兼容旧调用）。
pub fn take_danmaku_senders(
    senders: &DanmakuStopSenders,
    key: Option<String>,
) -> Vec<tokio::sync::mpsc::Sender<()>> {
    let mut map = senders.lock().unwrap();
    match key {
        Some(k) => map
            .remove(&normalize_instance_key(Some(k)))
            .into_iter()
            .collect(),
        None => map.drain().map(|(_, tx)| tx).collect(),
    }
}

#[derive(Serialize, Clone, Debug, specta::Type)]
pub struct DanmakuFrontendPayload {
    pub room_id: String,
    pub user: String,
    pub content: String,
    pub user_level: i64,
    pub fans_club_level: i32,
}
