# 数据管家 (Data Manager)

SillyTavern 第三方 UI 扩展。在一个面板里批量管理预设、世界书、角色卡、聊天记录、主题美化方案。

## 功能

| 标签 | 删除 | 改名 | 编辑 JSON | 撤销还原 |
|---|---|---|---|---|
| 预设（OpenAI/TextGen/NovelAI/Kobold/Instruct/Context/SysPrompt/Reasoning） | ✅ 批量 | ✅ | ✅ | ✅ |
| 世界书 | ✅ 批量 | ✅ | ✅ | ✅ |
| 角色卡 | ✅ 批量（可选连聊天一起删） | — | — | 自动下载 PNG 备份，需手动导入 |
| 聊天记录（按角色筛选） | ✅ 批量 | ✅ | ✅ | ✅ |
| 主题美化 | ✅ 批量 | ✅ | ✅ | ✅ |

其它：搜索框实时筛选、全选/清空、单条导出为 JSON、删除时自动下载备份文件、`↩ 撤销上次删除` 一键还原。

## 安装

**方式一（推荐，服务器/云端部署都适用）**

1. 把 `st-data-manager` 整个文件夹放到：
   ```
   SillyTavern/data/<你的用户名>/extensions/st-data-manager/
   ```
   单用户部署通常是 `data/default-user/extensions/`。
2. 重启 SillyTavern（或刷新页面）。
3. 顶部「扩展」(魔棒图标) 菜单里会出现 **数据管家**；扩展设置面板里也有入口；也可以直接输入斜杠命令 `/datamanager`。

**方式二（只能改前端文件时）**

放到 `SillyTavern/public/scripts/extensions/third-party/st-data-manager/`，同样重启即可。

## 打开方式

- 魔棒菜单 → 数据管家
- 扩展设置 → 🗂️ 数据管家 → 打开数据管家
- 聊天框输入 `/datamanager`（别名 `/dm`）

## 安全须知

- 删除是**真删文件**，走的是 SillyTavern 官方后端接口（`/api/presets/delete`、`/api/worldinfo/delete`、`/api/characters/delete`、`/api/chats/delete`、`/api/themes/delete`）。
- 默认勾选「删除时下载备份文件」，会把整批被删内容存成一个 JSON 落到你电脑上。**建议保持勾选。**
- 「撤销上次删除」只在当前页面会话内有效，刷新页面就没了 —— 真正的保险是那个备份文件。
- 角色卡是 PNG，无法用 JSON 接口还原，所以删除前会逐个下载到本地。浏览器可能弹出「允许多文件下载」提示，选允许。
- 改名的实现是「新建 + 删旧」。如果新名字和已有条目重名，会直接覆盖。

## 兼容性

针对当前 SillyTavern release 分支的后端接口编写。如果某个标签页报「加载失败 404」，说明你的版本该接口路径不同 —— 打开浏览器控制台看具体报错，改 `index.js` 里对应 adapter 的 URL 即可，每种数据的读写删都集中在一个对象里。
