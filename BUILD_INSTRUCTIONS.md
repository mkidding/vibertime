# Release Instructions (v0.2.8)

## 1. Build the Extension
Run this to create the installer:
`vsce package`
*(Result: vibertime-0.2.8.vsix)*

## 2. The "Nuclear" Clean Release
Run these commands to wipe history and push a clean state:
1. `rm -rf .git`  (Windows: `rd /s /q .git`)
2. `git init`
3. `git add .`
4. `git commit -m "Initial Release v0.2.8 (Apache 2.0)"`
5. `git branch -M main`
6. `git remote add origin https://github.com/mkidding/vibertime.git`
7. `git push -u origin main --force`

## 3. Publish Release
1. Go to GitHub Releases.
2. Draft new release: `v0.2.8`.
3. Upload `vibertime-0.2.8.vsix`.
