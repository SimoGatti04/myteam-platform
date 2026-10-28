# Core ownership: shared contracts

Core owns public and internal shared contracts. Export supported schemas/types from `src/index.ts`; avoid deep imports. Changes to public DTOs must be documented, versioned, and coordinated with Web and QA before implementation. C0 currently defines only the liveness response; it is not a finalized product API.
