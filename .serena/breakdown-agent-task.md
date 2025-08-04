# BREAKDOWN-AGENT Task

## Role
You are the breakdown agent responsible for breaking down the main task into detailed phases, features, and sub-features.

## Main Task
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

## Critical Instructions
- You are running in WSL (Windows Subsystem for Linux) on Ubuntu
- ALWAYS use desktop commander MCP tools for docker and curl operations
- Follow TDD methodology strictly  
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation files unless explicitly requested

## Your Task
Create a detailed breakdown file named TASK-serve-script-wsl-fix.md that breaks this down into:
- Phases (major sections of work)
- Features (logical groupings within phases) 
- Sub-features (specific actionable tasks that can be assigned to individual agents)

Each sub-feature should be numbered as [phase].[feature].[sub-feature] (e.g., 0.0.0, 0.0.1, etc.)

Make sure each sub-feature is:
- Specific and actionable
- Can be completed by a single agent (either WORKER-AGENT or CODER-AGENT)
- Has clear success criteria
- Includes any necessary context or requirements

The breakdown should be thorough and detailed enough that agents can work independently on their assigned sub-features.