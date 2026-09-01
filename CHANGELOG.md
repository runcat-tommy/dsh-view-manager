# CHANGELOG

## [0.2.0] - 2025-01-XX

### ✨ 新增

- **更新提醒**：自动检查 npm 上的最新版本，发现新版时在「⚙ 逃咪-视图管理」按钮上显示红点角标，管理面板顶部显示更新卡片
  - 「立即更新」：展示将执行的命令并确认后执行 `dsh plugin --profile web update dsh-view-manager`
  - 「忽略本版本」：该版本不再提醒（localStorage 记录，可「恢复提醒」）
  - 「稍后」：收起卡片，不打扰
  - 更新后自动验证版本号，成功则提示重启 Web UI 生效
  - 本地开发模式（link/file 源）自动禁用更新按钮并说明原因
  - 检查失败静默处理，不打扰用户；面板内可手动「检查更新」
- 插件已发布到 npm（`dsh plugin --profile web add dsh-view-manager` 直接安装）

### 🔧 修复

- `package.json` 的 `repository.url` 修正为 https://github.com/runcat-tommy/dsh-view-manager

### 📦 发布

- 发布到 npmjs：`dsh-view-manager@0.2.0`
