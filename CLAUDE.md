# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DevOps MCP Server - A safety-first Model Context Protocol (MCP) server that exposes golden-path workflows (chezmoi, mise, brew, git) to agent clients with strict policy and audit controls. Built for Node 24+ with stdio transport.

## Commands

### Development
```bash
# Ensure Node 24 is active
mise use -g node@24

# Install dependencies
pnpm install

# Run dev (no build needed)
pnpm dev

# Build TypeScript
pnpm build

# Start production
pnpm start

# Type check (no emit)
pnpm check

# Run tests
pnpm test

# Lint with Biome
pnpm lint

# Run integration tests
pnpm integration:smoke
```

## Architecture

### Core Components

#### MCP Server (`src/index.ts`)
- Main server entry using `@modelcontextprotocol/sdk`
- Registers tools and resources with rate limiting and audit
- Implements telemetry via OpenTelemetry
- Uses stdio transport for communication

#### Configuration (`src/config.ts`)
- TOML-based config at `~/.config/devops-mcp/config.toml`
- Hot-reloads on file changes
- Defines allowlists, rate limits, capabilities, and timeouts
- Example config in `examples/config.example.toml`

#### Security & Safety (`src/lib/`)
- **exec.ts**: Hardened process execution (execFile only, sanitized PATH, no env inheritance)
- **audit.ts**: SQLite/JSONL audit logging to `~/Library/Application Support/devops.mcp/`
- **locks.ts**: File-based locking for mutating operations
- **ratelimit.ts**: Per-tool rate limiting with sliding window
- **secrets.ts**: SecretRef system with allowlist enforcement, hashed audit records

### Tools

#### System Management
- `mcp_health`: Server health and policy reporting
- `converge_host`: High-level routine for project convergence
- `system_converge`: Converge host from repo state
- `system_plan`: Plan system changes from repo
- `system_repo_sync`: Sync system repo to ref

#### Package Management
- `pkg_sync_plan`: Compute sync plan for Brewfile/mise (read-only)
- `pkg_sync_apply`: Apply package sync plan (requires confirm=true, pkg_admin capability)

#### Configuration Management
- `dotfiles_apply`: Apply chezmoi changes (requires confirm=true, mutate_repo capability)
- `patch_apply_check`: Validate patches without applying

#### Secrets
- `secrets_read_ref`: Return opaque secretRef for gopass path (rate-limited)

### Resources (Read-Only)
- `devops://policy_manifest`: Current policy configuration
- `devops://dotfiles_state`: Chezmoi status
- `devops://pkg_inventory`: Installed packages (brew/mise)
- `devops://repo_status`: Git repository status
- `devops://system_repo_state`: System repo state
- `devops://policy_manifest_repo`: Repo-based policy

### Key Libraries
- **mise.ts**: Interface with mise version manager
- **git.ts**: Git operations and repo management
- **provenance.ts**: Track operation provenance
- **telemetry/**: OpenTelemetry integration for tracing and metrics

## Testing

Tests use Vitest and are located in `tests/`. Key test patterns:
- Unit tests for individual components
- Integration tests with MCP client helper (`tests/helpers/mcpClient.ts`)
- INERT mode testing (`DEVOPS_MCP_INERT=1`) for safe testing without mutations

Run a single test file:
```bash
vitest run tests/health.spec.ts
```

## Security Model

### Execution Safety
- Commands run through sanitized exec wrapper with explicit PATH
- Allowlisted commands only (configured in TOML)
- Timeouts enforced per operation

### Audit Trail
- All operations logged to SQLite/JSONL with unique audit_ids
- Secret accesses hashed (SHA256) - values never logged
- Retention policy configurable (default 30 days)

### Rate Limiting
- Per-tool rate limits (configurable RPS)
- Capability tiers: read_only, mutate_repo, pkg_admin
- Special low rate for secrets access (0.2 RPS default)

### Locking Strategy
- File-based locks prevent concurrent mutations
- Lock order: pkg → dotfiles → repo
- Operations acquire locks atomically

## Failure Handling

- Circuit breaking: `converge_host` aborts if `pkg_sync_apply` fails
- Retries: `pkg_sync_apply` retries once on transient failure
- Verification: Post-apply inventory check computes residuals
- INERT mode: Test mode that simulates changes without mutations

## Configuration Example

Key config sections in `~/.config/devops-mcp/config.toml`:
- `[allow]`: Paths, commands, and PATH directories
- `[limits]`: Rate limits per capability tier
- `[capabilities]`: Tool-to-tier mappings
- `[secrets]`: Gopass allowlist roots
- `[pkg]`: Package management settings
- `[audit]`: Audit storage configuration
- `[telemetry]`: OpenTelemetry settings