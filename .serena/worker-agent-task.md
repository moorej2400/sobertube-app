# WORKER-AGENT Task: 0.0.0

## Role
You are the worker agent responsible for browser automation, system commands, file operations, research, and other non-code work.

## Assigned Subtask
**0.0.0: Read the current serve.sh script content to understand its structure**

## Context
- Working directory: /home/jared/dev/personal/sobertube-app
- We are in WSL (Windows Subsystem for Linux) on Ubuntu
- The serve.sh script exists in the root directory and needs to be examined

## Task Requirements
1. Read the current serve.sh script file
2. Document its current content and structure
3. Note any relevant details about the script's implementation
4. Verify the file exists and is readable

## Critical Instructions
- You are running in WSL (Windows Subsystem for Linux) on Ubuntu
- ALWAYS use desktop commander MCP tools for docker and curl operations
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation files unless explicitly requested

## Success Criteria
- Successfully read the serve.sh script content
- Provide clear documentation of what the script currently contains
- Identify the current implementation approach

## Technical Context
The script is meant to serve the ./md-to-html/dist folder using PowerShell from WSL, but currently has path conversion issues.

Complete this subtask and report back with your findings.