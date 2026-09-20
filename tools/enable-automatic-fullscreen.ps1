param(
    [Parameter(Mandatory = $true)]
    [uri]$Url,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
if (-not $Url.IsAbsoluteUri -or $Url.Scheme -notin @('http', 'https') -or $Url.UserInfo -or $Url.Host.Contains('*')) {
    throw 'Provide the exact http:// or https:// timetable address, without wildcards or login credentials.'
}

# Chrome supports this per-site permission through its Windows user policy.
# Preserve existing entries and scope the permission to the supplied origin.
$origin = $Url.GetLeftPart([System.UriPartial]::Authority)
$policyPath = 'HKCU:\Software\Policies\Google\Chrome\AutomaticFullscreenAllowedForUrls'
$policyKey = Get-Item -LiteralPath $policyPath -ErrorAction SilentlyContinue
$valueNames = @()
if ($policyKey) { $valueNames = @($policyKey.GetValueNames()) }
$matchingNames = @($valueNames | Where-Object { $policyKey.GetValue($_) -eq $origin })

if ($Remove) {
    foreach ($valueName in $matchingNames) {
        Remove-ItemProperty -LiteralPath $policyPath -Name $valueName
    }
    Write-Output "Removed automatic fullscreen permission for $origin."
} elseif ($matchingNames.Count -gt 0) {
    Write-Output "Automatic fullscreen is already allowed for $origin."
} else {
    if (-not $policyKey) { New-Item -Path $policyPath -Force | Out-Null }
    $entryNumber = 1
    while ($valueNames -contains [string]$entryNumber) { $entryNumber++ }
    New-ItemProperty -LiteralPath $policyPath -Name ([string]$entryNumber) -Value $origin -PropertyType String | Out-Null
    Write-Output "Allowed automatic fullscreen for $origin in Chrome for this Windows user."
}

Write-Output 'In chrome://policy, click Reload policies, then reopen the timetable. Restarting Chrome also loads the policy.'
