# CHANGELOG

## [0.2.0] - 2025-01-XX

### ✨ Added

- **Update reminders**: automatically checks the npm registry for newer
  versions; when one is found, a red badge appears on the **⚙ Runcat-Views**
  button and an update card shows at the top of the manager panel
  - **Update now**: shows the command to run, then executes
    `dsh plugin --profile web update dsh-view-manager` after confirmation
  - **Ignore this version**: stops reminding for that version (recorded in
    localStorage; can be restored via "Restore reminder")
  - **Later**: collapses the card without disturbing the user
  - After updating, the version is verified automatically; on success the
    user is prompted to restart the Web UI to apply
  - Local development mode (link/file source) disables the update button
    with an explanation
  - Failed checks stay silent; a manual "Check for updates" button is
    available in the panel
- Published to npm (`dsh plugin --profile web add dsh-view-manager`)

### 🔧 Fixed

- `package.json` `repository.url` corrected to
  https://github.com/runcat-tommy/dsh-view-manager

### 📦 Release

- Published to npmjs: `dsh-view-manager@0.2.0`
