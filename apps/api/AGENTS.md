# Core ownership: API

Core owns this backend service, its runtime configuration, and its domain/persistence modules. Keep HTTP handlers thin and route behavior through shared domain services. Public responses must use explicit, versioned projections and never expose admin-only state. No API write route may be exposed without the approved authorization model. Follow `../../AGENTS.md` and the decisions in `../../docs/decisions/`.
