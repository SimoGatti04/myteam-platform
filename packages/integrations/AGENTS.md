# Integrations ownership

Integrations owns provider-specific adapters under this directory. Adapters must submit source-attributed inputs through Core's domain services; they must not write directly to public projections or bypass reconciliation. No CSI scraper, provider polling, or iOS synchronization is part of C0. Add a package manifest only when a concrete, approved adapter is selected.
