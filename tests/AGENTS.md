# QA ownership

QA owns automated tests under this directory. Keep tests deterministic and independent of production services. Integration tests that require PostgreSQL must be explicitly named/documented and run against the same PostgreSQL major version targeted for deployment. Do not change API contracts here; coordinate proposed contract changes with Core.
