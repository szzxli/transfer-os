# Transfer OS · 移动端管线

## 结构

```
mobile/
  www/                  # 纯静态离线 App（WebView / 浏览器直接打开即用）
    index.html          # TAG Guard（三语）
    compare.html        # Articulation 对比器（三语）
    css/app.css         # 移动优先共享样式
    js/
      tag-data.js       # 6 校 TAG 规则（自动生成）
      artic-data.js     # 25 份 articulation 报告（自动生成，紧凑格式）
      i18n.js           # 中文/English/Español 字典 + 语言切换
      tag-engine.js     # TAG 规则引擎（由 backend/tag_engine/checker.py 移植）
      comparator.js     # 对比引擎（由 backend/comparator/engine.py 移植）
      app-tag.js        # TAG 页面逻辑
      app-compare.js    # 对比页面逻辑
  scripts/
    build-data.py       # 数据打包：rules/*.yaml + data/raw/*.json → www/js/*-data.js
  TransferOS-debug.apk  # debug 签名，可直接安装试用（离线运行）
```

## 重新打包数据

```bash
cd ~/workspace/transfer-os
backend/.venv/bin/python mobile/scripts/build-data.py
```

## 验证 JS 引擎与 Python 一致

```bash
cd ~/workspace/transfer-os/backend
.venv/bin/python - <<'EOF'
# 生成 fixtures 到 /tmp/fixtures_py.json（见 mobile 管线文档）
EOF
node /tmp/verify-js.cjs   # 8 个用例应 ALL MATCH
```

## 打 APK（本机流程）

本机 Gradle daemon 的 client↔daemon TCP 通信在沙盒里失败（clean home + 最简
build 也复现，与代理配置无关），因此 APK 采用手工构建（aapt2/d8/apksigner），
产物与 Gradle 构建等价。Capacitor 脚手架（`npx cap init/add android`）已保留，
换一台正常机器可直接 `npx cap sync android && gradle assembleDebug`。

手工构建步骤（SDK 在 `~/workspace/tools/android-sdk`，JDK 21 在
`~/workspace/tools/jdk-21.0.12.1+1`）：

```bash
SDK=~/workspace/tools/android-sdk
export JAVA_HOME=~/workspace/tools/jdk-21.0.12.1+1
export PATH=$JAVA_HOME/bin:$PATH
cd /tmp/apkbuild   # 含 AndroidManifest.xml、src/、assets/www(=mobile/www 拷贝)

# 1. 编译 Java 外壳
javac --release 11 -cp $SDK/platforms/android-34/android.jar \
  -d classes src/com/szzxli/transferos/MainActivity.java
# 2. dex
$SDK/build-tools/34.0.0/d8 --lib $SDK/platforms/android-34/android.jar \
  --min-api 24 --output dexout $(find classes -name "*.class")
# 3. 打包资源+assets
$SDK/build-tools/34.0.0/aapt2 link -o app-base.apk \
  -I $SDK/platforms/android-34/android.jar --manifest AndroidManifest.xml \
  -A assets --min-sdk-version 24 --target-sdk-version 34
# 4. 加入 classes.dex
python3 -c "import zipfile; z=zipfile.ZipFile('app-base.apk','a'); \
  z.write('dexout/classes.dex','classes.dex')"
# 5. 对齐 + debug 签名
$SDK/build-tools/34.0.0/zipalign -f 4 app-base.apk app-aligned.apk
$SDK/build-tools/34.0.0/apksigner sign --ks debug.keystore \
  --ks-pass pass:android --key-pass pass:android \
  --out TransferOS-debug.apk app-aligned.apk
$SDK/build-tools/34.0.0/apksigner verify TransferOS-debug.apk
```

## 三语说明

- 切换器在每页右上角：中文 / EN / ES，即时生效，localStorage 持久化，默认中文。
- 专有名词不翻译：学校名、课程代码、专业英文名、YAML 规则原文保持原样。
- 引擎 detail 模板三语全覆盖；`t(key)` 缺失时回退 en → zh，不会抛错。
