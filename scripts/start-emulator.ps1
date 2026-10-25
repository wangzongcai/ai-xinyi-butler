<#
  启动 Android 模拟器，并把窗口摆到主屏右侧、完整显示。
  emulator 37.x 不会记忆窗口位置，启动/恢复过程中还可能自己把窗口挪回虚拟屏，
  所以脚本在启动后默认守护 90 秒，位置一跑偏就拉回来。

  用法：
    powershell -ExecutionPolicy Bypass -File scripts\start-emulator.ps1
    powershell -ExecutionPolicy Bypass -File scripts\start-emulator.ps1 -Watch        # 一直守护（Ctrl+C 退出）
    powershell -ExecutionPolicy Bypass -File scripts\start-emulator.ps1 -GuardSeconds 0  # 只摆一次就走
#>
param(
  [string]$Avd = "Medium_Phone_API_37.0",
  [switch]$Watch,
  [int]$Margin = 12,
  [int]$GuardSeconds = 90
)

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class EmuWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint action, uint param, out RECT rect, uint winIni);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
'@

# 声明 DPI 感知，否则在 125%/150% 缩放下拿到的坐标会被系统换算错
[EmuWin]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null

# 主屏工作区（物理像素，已扣除任务栏）
function Get-WorkArea {
  $r = New-Object EmuWin+RECT
  [EmuWin]::SystemParametersInfo(0x0030, 0, [ref]$r, 0) | Out-Null  # SPI_GETWORKAREA
  return $r
}

function Get-EmuWindow {
  $p = Get-Process qemu-system-x86_64 -ErrorAction SilentlyContinue |
       Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) { return $p.MainWindowHandle }
  return [IntPtr]::Zero
}

# 把模拟器窗口缩放进主屏工作区，并右对齐
# 返回 $true 表示窗口本来就在目标位置，没动它
function Place-EmulatorWindow([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return $true }
  $work = Get-WorkArea
  $r = New-Object EmuWin+RECT
  [EmuWin]::GetWindowRect($h, [ref]$r) | Out-Null
  $w = $r.Right - $r.Left
  $ht = $r.Bottom - $r.Top
  if ($w -le 0 -or $ht -le 0) { return $true }

  $availH = ($work.Bottom - $work.Top) - 2 * $Margin
  $extW = 56                                   # 模拟器右侧扩展工具栏宽度，留出来避免被屏幕边缘裁掉
  $maxW = [int](($work.Right - $work.Left) * 0.42) - $extW

  # 按可用高度缩放（允许适当放大），再保证宽度不超过屏幕宽度的 42%
  $scale = $availH / $ht
  if ($scale -gt 1.5) { $scale = 1.5 }
  if ($w * $scale -gt $maxW) { $scale = $maxW / $w }

  $nw = [int]($w * $scale)
  $nh = [int]($ht * $scale)
  $x = $work.Right - $Margin - $extW - $nw
  $y = $work.Top + $Margin

  # 已经在目标位置就不要再折腾（模拟器自身会按宽高比微调尺寸）
  if ([Math]::Abs($r.Left - $x) -le 8 -and [Math]::Abs($r.Top - $y) -le 8 -and
      [Math]::Abs($w - $nw) -le 8 -and [Math]::Abs($ht - $nh) -le 8) {
    return $true
  }

  # SWP_ASYNCWINDOWPOS：模拟器窗口还没响应时不至于把脚本卡死
  [EmuWin]::SetWindowPos($h, [IntPtr]::Zero, $x, $y, $nw, $nh, 0x4004) | Out-Null
  return $false
}

# 找到模拟器可执行文件
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$emulator = Join-Path $sdk "emulator\emulator.exe"
if (-not (Test-Path $emulator)) { throw "找不到模拟器：$emulator" }

# 未运行时启动（参数与 Expo 启动时一致，避免快照加载卡住）
$started = $false
if ((Get-EmuWindow) -eq [IntPtr]::Zero) {
  Write-Host "启动模拟器 $Avd ..."
  Start-Process $emulator -ArgumentList @("-avd", $Avd, "-no-boot-anim", "-no-snapshot-load") -WorkingDirectory (Get-Location)
  $started = $true
}

# 等系统真正启动完成：启动早期窗口会自己改尺寸，过早摆位会被覆盖
$adb = Join-Path $sdk "platform-tools\adb.exe"
if ($started -and (Test-Path $adb)) {
  Write-Host "等待系统启动完成 ..."
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 2
    $line = (& $adb devices 2>$null) | Select-String '^emulator-\d+\s+device$' | Select-Object -First 1
    if (-not $line) { continue }
    $serial = ($line.Line -split '\s+')[0]
    $booted = (& $adb -s $serial shell getprop sys.boot_completed 2>$null) -match '1'
    if ($booted) { break }
  }
}

# 等待窗口出现（首次冷启动可能较慢）
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 240 -and $h -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 500
  $h = Get-EmuWindow
}
if ($h -eq [IntPtr]::Zero) { throw "等待模拟器窗口超时" }

Place-EmulatorWindow $h | Out-Null
Write-Host "模拟器窗口已摆到主屏右侧。"

# 守护：模拟器启动/恢复期间会自己挪窗口，发现跑偏就拉回来
$guardUntil = if ($Watch) { [DateTime]::MaxValue } else { (Get-Date).AddSeconds($GuardSeconds) }
if ($Watch) { Write-Host "持续守护中，按 Ctrl+C 退出。" }
while ((Get-Date) -lt $guardUntil) {
  Start-Sleep -Seconds 1
  $h = Get-EmuWindow
  if ($h -eq [IntPtr]::Zero) { continue }
  if (-not (Place-EmulatorWindow $h)) { Write-Host "窗口位置跑偏，已校正。" }
}
