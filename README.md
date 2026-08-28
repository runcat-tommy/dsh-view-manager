# dsh-view-manager

Manage the **view tabs** in the DeepSeek Harness Web GUI session header — the
tabs contributed through the `conversation.view` slot (e.g. **对话 / Chat**,
**轨迹 / Trajectory**, and any future view plugins).

| 简体中文 | [English](README.en.md) |
| --- | --- |

## 功能 Features

- **启用/停用**：停用某个视图标签后，标签在会话页头隐藏（视图功能本身不受影响）
- **排序**：上移/下移调整标签显示顺序
- **重命名**：自定义标签显示名（留空恢复默认）
- **跟随语言**：插件文案随 DSH 界面语言自动切换（zh / en）
- **本地存储**：配置保存在浏览器 localStorage，即时生效，无需重启

## 安装 Install

**方式一：本地安装（推荐）**——克隆或下载本项目后，进入项目文件夹执行：

```sh
cd dsh-view-manager
dsh plugin --profile web add .
```

> 说明：本插件尚未发布到 npm 市场，直接执行 `dsh plugin add dsh-view-manager` 会因找不到包而无效；使用 `add .` 会以本地链接方式安装，代码更新后重启 Web UI 即可生效。

**方式二：从 GitHub 安装**：

```sh
dsh plugin --profile web add github:runcat-tommy/dsh-view-manager
```

安装后**重启 Web UI**，打开任意会话，在会话页头右侧会出现
**⚙ 逃咪-视图管理** 按钮，点击即可打开管理面板。

## 使用 Usage

1. 打开一个会话（对话或轨迹界面）
2. 会话页头最右侧点击 **⚙ 逃咪-视图管理**
3. 面板中每个视图一行：
   - 开关：启用/停用（停用 = 隐藏标签）
   - `原名`：当前默认名称（跟随语言）
   - 输入框：自定义显示名（留空恢复默认）
   - ↑ / ↓：调整顺序
   - **恢复默认**：清空所有自定义配置

## 工作原理 How it works

- 数据源与官方一致：`slots.entries("conversation.view")`
  （`viewTabs()` 同源），所以永远能看到当前所有视图注册项
- 官方宿主渲染标签时没有隐藏/排序/重命名的扩展点，因此本插件在
  DOM 层应用配置：`[role="tablist"]` 内按钮按 entries 顺序对齐，
  隐藏用 `display:none`、排序用 flex `order`、重命名改 `textContent`，
  MutationObserver 守护，React 重渲染后自动重新应用
- 管理入口挂载在 `conversation.session.header.utilities`（list/session）
- 文案通过 `locale` 服务注册（`viewManager` 命名空间），跟随 DSH 语言

## 开发 Development

```
dsh-view-manager/
├── package.json          # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml      # profile 层 bundle patch
├── lib/
│   ├── index.js          # node 半端（空宿主，无行为）
│   └── client.js         # 浏览器端：管理面板 + DOM 应用 + watcher
```

本地调试（热更新需要 dev:web 编译，否则改后重启 Web UI）：

```sh
dsh plugin --profile web add file:./dsh-view-manager
```

## License

MIT
