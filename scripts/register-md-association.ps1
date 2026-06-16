param(
  [string]$ExePath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ExePath)) {
  $candidate = Join-Path $PSScriptRoot "..\dist\win-unpacked\MD-Room.exe"
  $ExePath = [System.IO.Path]::GetFullPath($candidate)
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Executable not found: $ExePath"
}

$progId = "MDRoom.md"
$classesRoot = "HKCU:\Software\Classes"

New-Item -Path "$classesRoot\$progId" -Force | Out-Null
Set-Item -Path "$classesRoot\$progId" -Value "MD-Room Document"

New-Item -Path "$classesRoot\$progId\DefaultIcon" -Force | Out-Null
Set-Item -Path "$classesRoot\$progId\DefaultIcon" -Value "`"$ExePath`",0"

New-Item -Path "$classesRoot\$progId\shell\open\command" -Force | Out-Null
Set-Item -Path "$classesRoot\$progId\shell\open\command" -Value "`"$ExePath`" `"%1`""

foreach ($extension in @(".md", ".markdown", ".mdown", ".mkd")) {
  New-Item -Path "$classesRoot\$extension" -Force | Out-Null
  Set-Item -Path "$classesRoot\$extension" -Value $progId
}

Write-Host "Registered MD-Room for .md, .markdown, .mdown, .mkd"
