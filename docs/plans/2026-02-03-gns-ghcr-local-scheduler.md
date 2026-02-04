# GNS GHCR + Local Scheduler Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure GNS publishes to `ghcr.io/<owner>/gns:latest` and create a local scheduling workspace with envs and run scripts.

**Architecture:** Update GNS GH Actions to tag a stable image. Create a local, non-repo folder with envs + PowerShell scripts for Task Scheduler and Portainer-based visibility.

**Tech Stack:** GitHub Actions, Docker, PowerShell, Windows Task Scheduler.

---

### Task 1: Update GNS GHCR tagging

**Files:**
- Modify: `C:\Users\Sigfarm\Desktop\Github\GNS\.github\workflows\ghcr.yml`

**Step 1: Write the failing test**
- Not applicable.

**Step 2: Run test to verify it fails**
- Not applicable.

**Step 3: Write minimal implementation**
```yaml
images: ghcr.io/${{ github.repository_owner }}/gns
```

**Step 4: Run test to verify it passes**
- Not applicable.

**Step 5: Commit**
```bash
git add .github/workflows/ghcr.yml
git commit -m "ci: tag gns image in ghcr"
```

### Task 2: Create local scheduler workspace

**Files:**
- Create: `C:\Users\Sigfarm\Desktop\Github\landwatch-jobs\README.md`
- Create: `C:\Users\Sigfarm\Desktop\Github\landwatch-jobs\jobs\versionamento\run_versionamento.ps1`
- Create: `C:\Users\Sigfarm\Desktop\Github\landwatch-jobs\jobs\gns\run_gns.ps1`
- Create: `C:\Users\Sigfarm\Desktop\Github\landwatch-jobs\docs\task-scheduler.md`
- Create: `C:\Users\Sigfarm\Desktop\Github\landwatch-jobs\docs\portainer.md`
- Create: `C:\Users\Sigfarm\Desktop\Github\landwatch-jobs\docs\add-new-job.md`

**Step 1: Write the failing test**
- Not applicable.

**Step 2: Run test to verify it fails**
- Not applicable.

**Step 3: Write minimal implementation**
- Add run scripts that pull + run images with envs and volumes.

**Step 4: Run test to verify it passes**
- Not applicable.

**Step 5: Commit**
```bash
git add landwatch-jobs
git commit -m "docs: add local job scheduler workspace"
```
