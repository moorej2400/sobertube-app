# TASK: Fix serve.sh Script for WSL/PowerShell Integration

## Overview
Fix the serve.sh script that runs npx serve on the ./md-to-html/dist folder. The issue is that we're in WSL but need to convert the Linux path to a Windows path for PowerShell to use.

## Current Script Content
```bash
#!/bin/bash
# Serve the md-to-html/dist folder over the network using PowerShell and npx serve
powershell.exe -Command "npx serve ./md-to-html/dist --host 0.0.0.0"
```

## Requirements
1. First run the current script to see what errors occur
2. Fix the script to dynamically convert the WSL path to a Windows path that PowerShell can use
3. The script should serve the md-to-html/dist folder over the network (not just localhost)  
4. Test the fixed script to ensure it works

## Context
- We are in WSL (Windows Subsystem for Linux) 
- Working directory: /home/jared/dev/personal/sobertube-app
- The script needs to call PowerShell from WSL
- PowerShell needs Windows-style paths, not Linux paths

---

## Phase 0: Investigation and Analysis
### 0.0: Current Script Analysis
- [ ] 0.0.0: Read the current serve.sh script content to understand its structure
- [ ] 0.0.1: Execute the current script to observe and document the exact error messages
- [ ] 0.0.2: Verify the existence and structure of the ./md-to-html/dist folder
- [ ] 0.0.3: Test WSL path conversion utilities (wslpath) to understand available tools

### 0.1: Requirements Analysis  
- [ ] 0.1.0: Document the exact path conversion needed (WSL to Windows format)
- [ ] 0.1.1: Verify PowerShell accessibility from WSL environment
- [ ] 0.1.2: Research npx serve command requirements and network binding options

---

## Phase 1: Implementation
### 1.0: Script Enhancement
- [ ] 1.0.0: Modify serve.sh to use wslpath for dynamic path conversion
- [ ] 1.0.1: Update the PowerShell command to use the converted Windows path
- [ ] 1.0.2: Ensure network hosting remains configured (--host 0.0.0.0)
- [ ] 1.0.3: Add error handling for path conversion failures

### 1.1: Script Optimization
- [ ] 1.1.0: Add validation to check if md-to-html/dist folder exists before serving
- [ ] 1.1.1: Add informative output messages for debugging and user feedback
- [ ] 1.1.2: Ensure script maintains proper bash shebang and permissions

---

## Phase 2: Testing and Validation
### 2.0: Functionality Testing
- [ ] 2.0.0: Execute the modified script and verify it starts without errors  
- [ ] 2.0.1: Verify the web server is accessible over the network (not just localhost)
- [ ] 2.0.2: Test serving actual content from the md-to-html/dist folder
- [ ] 2.0.3: Verify script can be stopped gracefully (Ctrl+C)

### 2.1: Edge Case Testing
- [ ] 2.1.0: Test script behavior when md-to-html/dist folder doesn't exist
- [ ] 2.1.1: Test script behavior when PowerShell is not available
- [ ] 2.1.2: Verify path conversion works correctly with special characters/spaces

---

## Phase 3: Final Validation
### 3.0: Complete Integration Test
- [ ] 3.0.0: Run full end-to-end test of the serve.sh script
- [ ] 3.0.1: Verify the script meets all original requirements
- [ ] 3.0.2: Document any remaining issues or limitations
- [ ] 3.0.3: Confirm script is ready for production use

---

## Technical Notes
- Use `wslpath -w` to convert WSL paths to Windows format
- PowerShell commands from WSL: `powershell.exe -Command "..."`
- Network serving requires --host 0.0.0.0 flag
- Working directory: /home/jared/dev/personal/sobertube-app
- Target folder: ./md-to-html/dist

## Success Criteria
- Script executes without errors
- Web server starts and serves content over network
- Path conversion works dynamically
- All original functionality is preserved