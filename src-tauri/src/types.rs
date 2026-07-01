// front/shared/types.ts と同じ JSON スキーマ（camelCase）に対応する共有型。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeInterval {
    pub start_time: String,
    pub end_time: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkLocation {
    Office,
    Telework,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub task_id: String,
    pub name: String,
    pub project_code: String,
    pub work_category: String,
    pub times: Vec<TimeInterval>,
    pub date: String,
    pub color: String,
    pub total_time: i64,
    /// telework のときのみ保存。出社時は省略（None）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub work_location: Option<WorkLocation>,
}
