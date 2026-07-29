# Orchestration

## Parent critical path
Integrate schemas, Worker/Workflow configuration, UEX scheduling, and verification.

## Packets
- 01-discovery — read-only explorer.
- 02-repository-normalizer — worker; owns repository parser and its tests.
- 03-release-status-ui — worker; owns release-status persistence/API/UI and its tests.

## Delegation
Three native agents, one implementation wave, then one parent review/verification wave.

## Agents
Packets are isolated by module ownership. No agent may commit, deploy, or modify another packet's files.

## Delegation limits
3 agents; no further swarm without need.

## Wait points
Parent begins shared Worker orchestration while agents work; integration waits for both implementation packets.

## Fallback
If an agent is blocked, parent completes its bounded packet after integrating the other result.

## Verification order
Focused tests, lint, build, full local test command, then final diff and contract audit.
