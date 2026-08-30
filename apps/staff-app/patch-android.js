const fs = require('fs')
const path = require('path')

console.log('--- Patching Android files for Full-Screen Intent & Foreground Service ---')

// 1. Copy alarm.mp3 to res/raw
const rawDir = path.join(__dirname, 'android/app/src/main/res/raw')
fs.mkdirSync(rawDir, { recursive: true })
const alarmSrc = path.join(__dirname, 'assets/alarm.mp3')
if (fs.existsSync(alarmSrc)) {
  fs.copyFileSync(alarmSrc, path.join(rawDir, 'alarm.mp3'))
  console.log('✅ Copied alarm.mp3 to android/app/src/main/res/raw/alarm.mp3')
} else {
  console.warn('⚠️ assets/alarm.mp3 not found!')
}

// 2. Patch AndroidManifest.xml
const manifestPath = path.join(__dirname, 'android/app/src/main/AndroidManifest.xml')
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8')

  // Add showWhenLocked and turnScreenOn to MainActivity
  if (!manifest.includes('android:showWhenLocked="true"')) {
    manifest = manifest.replace(
      '<activity android:name=".MainActivity"',
      '<activity android:name=".MainActivity" android:showWhenLocked="true" android:turnScreenOn="true" android:showOnLockScreen="true" android:inheritShowWhenLocked="true"'
    )
    console.log('✅ Patched MainActivity in AndroidManifest.xml (showWhenLocked, turnScreenOn)')
  }

  // Add Notifee ForegroundService declaration with dataSync type if not present
  if (!manifest.includes('app.notifee.core.ForegroundService')) {
    const serviceXml = `
    <!-- Notifee Foreground Service for 24/7 Request Monitoring -->
    <service
      android:name="app.notifee.core.ForegroundService"
      android:foregroundServiceType="dataSync"
      android:exported="false" />
  </application>`
    manifest = manifest.replace('</application>', serviceXml)
    console.log('✅ Added Notifee ForegroundService with dataSync to AndroidManifest.xml')
  }

  // Add FOREGROUND_SERVICE_DATA_SYNC permission if not present
  if (!manifest.includes('android.permission.FOREGROUND_SERVICE_DATA_SYNC')) {
    manifest = manifest.replace(
      '<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>',
      '<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>\n  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC"/>'
    )
    console.log('✅ Added FOREGROUND_SERVICE_DATA_SYNC to AndroidManifest.xml')
  }

  fs.writeFileSync(manifestPath, manifest, 'utf8')
} else {
  console.warn('⚠️ AndroidManifest.xml not found at', manifestPath)
}

// 3. Patch MainActivity.kt to wake screen programmatically
const mainActivityPath = path.join(
  __dirname,
  'android/app/src/main/java/com/hotelqr/staffapp/MainActivity.kt'
)
if (fs.existsSync(mainActivityPath)) {
  let kt = fs.readFileSync(mainActivityPath, 'utf8')
  if (!kt.includes('setShowWhenLocked')) {
    const target = 'super.onCreate(null)'
    const replacement = `super.onCreate(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }`
    kt = kt.replace(target, replacement)
    fs.writeFileSync(mainActivityPath, kt, 'utf8')
    console.log('✅ Patched MainActivity.kt (setShowWhenLocked, setTurnScreenOn)')
  }
} else {
  console.warn('⚠️ MainActivity.kt not found at', mainActivityPath)
}

console.log('--- Android patch completed successfully ---')
