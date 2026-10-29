$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskLogDir = Join-Path $taskRoot 'tools/_raw/local-media'
New-Item -ItemType Directory -Path $taskLogDir -Force | Out-Null
try {
    $taskVersion = Invoke-RestMethod -Uri 'http://127.0.0.1:50022/version' -TimeoutSec 3
    Write-Output "VOICEVOX already available on50022: $taskVersion"
    exit 0
} catch {}
if (Get-NetTCPConnection -LocalPort 50022 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port50022 is occupied but unresponsive. Inspect it; this script never kills an existing service.'
}
$taskEngine = 'D:/AI/voicevox/engine/windows-nvidia/run.exe'
if (!(Test-Path -LiteralPath $taskEngine)) { throw "VOICEVOX is not installed at $taskEngine" }
$taskProcess = Start-Process -FilePath $taskEngine -ArgumentList @('--host', '127.0.0.1', '--port', '50022', '--cpu_num_threads', '2', '--disable_mutable_api', '--output_log_utf8') -WorkingDirectory (Split-Path -Parent $taskEngine) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogDir 'voicevox-stdout.log') -RedirectStandardError (Join-Path $taskLogDir 'voicevox-stderr.log') -PassThru
$taskProcess.Id | Set-Content -LiteralPath (Join-Path $taskLogDir 'voicevox-cpu.pid')
Write-Output "Started dedicated CPU VOICEVOX PID $($taskProcess.Id); GPU service50021 was not changed."
for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
    if ($taskProcess.HasExited) { throw 'VOICEVOX exited; see tools/_raw/local-media/voicevox-stderr.log' }
    try {
        $taskVersion = Invoke-RestMethod -Uri 'http://127.0.0.1:50022/version' -TimeoutSec 2
        Write-Output "Ready: $taskVersion"
        exit 0
    } catch {}
    Start-Sleep -Seconds 1
}
throw 'VOICEVOX is not ready yet; inspect the task log before starting another process.'
