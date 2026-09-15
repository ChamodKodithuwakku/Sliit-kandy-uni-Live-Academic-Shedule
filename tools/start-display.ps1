param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$previewUrl = $null

function Test-TimetableServer([string]$Address) {
    try {
        $response = Invoke-WebRequest -Uri $Address -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content.Contains('content="SLIIT Kandy Live Timetable"')
    } catch {
        return $false
    }
}

try {
    # Reuse this display's preview if it is already running. Do not open an
    # unrelated application that happens to occupy the usual port.
    foreach ($port in 8080..8089) {
        $candidate = "http://127.0.0.1:$port"
        if (Test-TimetableServer $candidate) {
            $previewUrl = $candidate
            break
        }

        $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        try { $probe.Start() } catch { continue } finally { $probe.Stop() }

        $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
        if (-not $pythonCommand) {
            throw 'Python is required for the local preview. Install Python, or open this folder with VS Code Live Server.'
        }

        $serverProcess = Start-Process -FilePath $pythonCommand.Source `
            -ArgumentList @('-m', 'http.server', "$port", '--bind', '127.0.0.1') `
            -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru

        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            if (Test-TimetableServer $candidate) { $previewUrl = $candidate; break }
            if ($serverProcess.HasExited) { break }
            Start-Sleep -Milliseconds 250
        }
        if ($previewUrl) { break }
    }

    if (-not $previewUrl) { throw 'Could not start the local preview. Try running python -m http.server 8080 from this folder.' }
    if (-not $NoBrowser) { Start-Process -FilePath $previewUrl }
    Write-Output "Timetable preview: $previewUrl"
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
