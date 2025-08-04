#!/bin/bash

# Serve the md-to-html/dist folder over the network using PowerShell and npx serve

# Check if md-to-html/dist folder exists
if [ ! -d "./md-to-html/dist" ]; then
    echo "Error: md-to-html/dist folder not found!"
    exit 1
fi

# Get the absolute path of the dist folder
DIST_FULL_PATH=$(realpath "./md-to-html/dist")

# Convert to Windows path format
WIN_PATH=$(wslpath -w "$DIST_FULL_PATH")

echo "Starting server for: $WIN_PATH"
echo "Server will be accessible over the network at: 0.0.0.0:3000"

# Create a temporary directory in Windows and copy files there, then serve
TEMP_DIR="C:\temp\serve-$(date +%s)"

powershell.exe -Command "
    \$tempDir = '$TEMP_DIR';
    \$sourcePath = '$WIN_PATH';
    Write-Host 'Creating temporary directory:' \$tempDir;
    New-Item -ItemType Directory -Force -Path \$tempDir | Out-Null;
    Write-Host 'Copying files from:' \$sourcePath;
    Copy-Item -Path \"\$sourcePath\*\" -Destination \$tempDir -Recurse -Force;
    Write-Host 'Starting server...';
    Set-Location \$tempDir;
    npx serve . --host 0.0.0.0 --port 3000;
    Write-Host 'Cleaning up...';
    Set-Location C:\;
    Remove-Item -Path \$tempDir -Recurse -Force -ErrorAction SilentlyContinue;
"